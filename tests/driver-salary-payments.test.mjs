import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);

async function loadPureModule(path) {
  const source = await readFile(new URL(path, root), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}

const summaryModule = loadPureModule("app/lib/external-transport/cash-summary.ts");
const paymentModule = loadPureModule("app/lib/external-transport/driver-payments.ts");

const days = [{ income_amount: 125282 }];
const expenses = [
  { label: "Şoför Parası", amount: 29000 },
  { label: "Araç Kirası", amount: 35757 },
  { label: "Üyelik", amount: 24000 },
  { label: "Yakıt", amount: 31500 },
  { label: "Otoyol", amount: 2505 },
];

test("preserves the original cash position when no salary has been paid", async () => {
  const { buildCashSummary } = await summaryModule;
  const summary = buildCashSummary(days, expenses);
  assert.equal(summary.cashOnHand, 67277);
  assert.equal(summary.netResult, 2520);
  assert.equal(summary.driverReserve, 29000);
  assert.equal(summary.accruedDriverSalary, 29000);
  assert.equal(summary.paidDriverSalary, 0);
});

test("partial salary payments reduce cash and pending reserve, never profit twice", async () => {
  const { buildCashSummary } = await summaryModule;
  const summary = buildCashSummary(days, expenses, 10000);
  assert.equal(summary.cashOnHand, 57277);
  assert.equal(summary.driverReserve, 19000);
  assert.equal(summary.paidDriverSalary, 10000);
  assert.equal(summary.paidExpenses, 68005);
  assert.equal(summary.netResult, 2520);
  assert.equal(summary.cashOnHand, summary.driverReserve + summary.vehicleReserve + summary.netResult);
});

test("full, multiple and excess payments keep reconciliation exact", async () => {
  const { buildCashSummary } = await summaryModule;
  for (const paid of [5000 + 7500, 29000, 30000]) {
    const summary = buildCashSummary(days, expenses, paid);
    assert.equal(summary.netResult, 2520);
    assert.equal(summary.driverReserve, 29000 - paid);
    assert.equal(summary.cashOnHand, 67277 - paid);
    assert.equal(summary.cashOnHand, summary.driverReserve + summary.vehicleReserve + summary.netResult);
  }
  assert.equal(buildCashSummary([], [], 1000).cashOnHand, -1000);
  assert.equal(buildCashSummary([], [], 1000).driverReserve, -1000);
  assert.equal(buildCashSummary([], [], 1000).netResult, 0);
});

test("cash accounting handles Turkish labels and decimal amounts", async () => {
  const { buildCashSummary } = await summaryModule;
  const summary = buildCashSummary(
    [{ income_amount: "1000.30" }],
    [{ label: "SÜRÜCÜ ÜCRETİ", amount: "100.10" }, { label: "Araç kirası", amount: "200.10" }, { label: "Yakıt", amount: "0.10" }],
    0.10,
  );
  assert.equal(summary.cashOnHand, 1000.10);
  assert.equal(summary.driverReserve, 100);
  assert.equal(summary.netResult, 700);
});

test("salary input validates date and amount and cleans notes", async () => {
  const { parseDriverSalaryPaymentInput } = await paymentModule;
  const payment = parseDriverSalaryPaymentInput({ paymentDate: "2026-09-16", amount: 1234.565, note: "  Eylül   maaşı  " });
  assert.deepEqual(payment, { paymentDate: "2026-09-16", amount: 1234.57, note: "Eylül maaşı" });
  for (const amount of [null, true, "1000", 0, -1, 0.001, Infinity, NaN, 10000000000]) {
    assert.throws(() => parseDriverSalaryPaymentInput({ paymentDate: "2026-09-16", amount }), /tutar/i);
  }
  for (const paymentDate of ["", "2026-02-30", "2026-13-01", "2026-09-16extra", "16.09.2026"]) {
    assert.throws(() => parseDriverSalaryPaymentInput({ paymentDate, amount: 1000 }), /tarihi/i);
  }
});

test("the payment field accepts Turkish currency notation without changing meaning", async () => {
  const { parseDriverPaymentMoney } = await paymentModule;
  for (const [input, expected] of [["1000", 1000], ["1.000", 1000], ["10.000", 10000], ["1.000,00", 1000], ["1.234.567,89", 1234567.89], [" 1 000,50 ", 1000.5], ["1000.50", 1000.5]]) {
    assert.equal(parseDriverPaymentMoney(input), expected, input);
  }
  for (const input of ["", "-1000", "1,2,3", "abc", "1.2.3", "0", "0,001"]) {
    assert.equal(parseDriverPaymentMoney(input), null, input);
  }
});

const paymentId = "a233e9a9-b77a-47c9-a2ca-7c054a89a3c0";

async function createApiHarness(accessStatus = 200) {
  const stored = new Map();
  const queries = [];
  let connections = 0;
  const results = (rows) => Object.assign(rows, { count: rows.length });
  const database = {
    async unsafe(query, params = []) {
      queries.push(query);
      if (query.startsWith("INSERT INTO external_transport_driver_payments")) {
        const [id, payment_date, amount, note, created_at] = params;
        if (stored.has(id)) return results([]);
        const row = { id, payment_date, amount: amount.toFixed(2), note, created_at, updated_at: created_at, voided_at: null };
        stored.set(id, row);
        return results([{ ...row }]);
      }
      if (query.startsWith("UPDATE external_transport_driver_payments")) {
        const cancelling = query.includes("SET voided_at");
        const row = stored.get(params[cancelling ? 1 : 4]);
        if (!row || row.voided_at) return results([]);
        if (cancelling) row.voided_at = row.updated_at = params[0];
        else {
          [row.payment_date, row.amount, row.note, row.updated_at] = params;
          row.amount = row.amount.toFixed(2);
        }
        return results([{ ...row }]);
      }
      if (query.includes("FROM external_transport_driver_payments") && query.includes("WHERE id =")) {
        const row = stored.get(params[0]);
        return results(row && !row.voided_at ? [{ ...row }] : []);
      }
      if (query.includes("UNION")) return results([...new Set(["2026-09", ...[...stored.values()].filter((row) => !row.voided_at).map((row) => row.payment_date.slice(0, 7))])].sort().reverse().map((month_key) => ({ month_key })));
      if (query.includes("sum(amount)")) return results([{ paid_driver_salary: [...stored.values()].filter((row) => !row.voided_at).reduce((sum, row) => sum + Number(row.amount), 0) }]);
      if (query.includes("FROM external_transport_driver_payments")) return results([...stored.values()].filter((row) => !row.voided_at && row.payment_date.startsWith(params[0])).map((row) => ({ ...row })));
      if (query.includes("FROM external_transport_expenses")) return results(expenses.map((row) => ({ id: "expense", day_id: "day", sort_order: 0, ...row })));
      if (query.includes("FROM external_transport_days")) return results([{ ...days[0], id: "day", entry_date: "2026-09-16", month_key: "2026-09", created_at: "2026-09-16", updated_at: "2026-09-16" }]);
      throw new Error(`Unexpected test query: ${query}`);
    },
  };
  const modules = {
    db: { getSql() { connections++; return database; }, async ensureExternalTransportSchema() {} },
    auth: { async apiAccessError(roles) { assert.deepEqual(roles, ["admin"]); return { response: accessStatus === 200 ? null : Response.json({ error: "Access denied" }, { status: accessStatus }) }; } },
    payments: await paymentModule,
    summary: await summaryModule,
  };
  async function loadRoute(path) {
    const source = await readFile(new URL(path, root), "utf8");
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    const exports = {};
    new Function("require", "exports", outputText)((name) => {
      if (name.endsWith("/db")) return modules.db;
      if (name.endsWith("/auth/session")) return modules.auth;
      if (name.endsWith("/cash-summary")) return modules.summary;
      if (name.endsWith("/driver-payments")) return modules.payments;
      throw new Error(`Unexpected test import: ${name}`);
    }, exports);
    return exports;
  }
  return {
    payments: await loadRoute("app/api/external-transport/driver-payments/route.ts"),
    ledger: await loadRoute("app/api/external-transport/route.ts"),
    stored,
    queries,
    get connections() { return connections; },
  };
}

function apiRequest(method, body) {
  return new Request("http://test/api/external-transport/driver-payments", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

test("all salary mutations reject anonymous and customer users before touching data", async () => {
  for (const status of [401, 403]) {
    const harness = await createApiHarness(status);
    for (const method of ["POST", "PATCH", "DELETE"]) {
      assert.equal((await harness.payments[method](apiRequest(method, { id: paymentId, paymentDate: "2026-09-16", amount: 1000 }))).status, status);
    }
    assert.equal(harness.connections, 0);
    assert.equal(harness.queries.length, 0);
  }
});

test("the actual POST route is retry-safe and rejects reused IDs with different data", async () => {
  const harness = await createApiHarness();
  const body = { id: paymentId, paymentDate: "2026-09-16", amount: 10000, note: "Eylül maaşı" };
  assert.equal((await harness.payments.POST(apiRequest("POST", body))).status, 201);
  assert.equal((await harness.payments.POST(apiRequest("POST", body))).status, 200);
  assert.equal(harness.stored.size, 1);
  assert.equal((await harness.payments.POST(apiRequest("POST", { ...body, amount: 999 }))).status, 409);
  assert.equal(Number(harness.stored.get(paymentId).amount), 10000);
});

test("the actual GET route includes paid salary exactly once and filters history by month", async () => {
  const harness = await createApiHarness();
  await harness.payments.POST(apiRequest("POST", { id: paymentId, paymentDate: "2026-08-31", amount: 10000 }));
  const response = await harness.ledger.GET(new Request("http://test/api/external-transport?month=2026-09"));
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(data.driverPayments, []);
  assert.ok(data.months.includes("2026-08"));
  assert.equal(data.cashSummary.cashOnHand, 57277);
  assert.equal(data.cashSummary.driverReserve, 19000);
  assert.equal(data.cashSummary.netResult, 2520);
  const august = await (await harness.ledger.GET(new Request("http://test/api/external-transport?month=2026-08"))).json();
  assert.equal(august.driverPayments[0].paymentDate, "2026-08-31");
});

test("editing a salary payment changes its month and amount without creating a second payment", async () => {
  const harness = await createApiHarness();
  await harness.payments.POST(apiRequest("POST", { id: paymentId, paymentDate: "2026-09-16", amount: 10000 }));
  const response = await harness.payments.PATCH(apiRequest("PATCH", { id: paymentId, paymentDate: "2026-08-31", amount: 5000, note: "Düzeltilen ödeme" }));
  assert.equal(response.status, 200);
  assert.equal(harness.stored.size, 1);
  assert.equal((await response.json()).payment.amount, 5000);
  const data = await (await harness.ledger.GET(new Request("http://test/api/external-transport?month=2026-08"))).json();
  assert.equal(data.cashSummary.cashOnHand, 62277);
  assert.equal(data.cashSummary.netResult, 2520);
  assert.equal(data.driverPayments.length, 1);
});

test("cancelling a mistaken salary entry preserves it, restores cash and never deletes daily records", async () => {
  const harness = await createApiHarness();
  const body = { id: paymentId, paymentDate: "2026-09-16", amount: 10000 };
  await harness.payments.POST(apiRequest("POST", body));
  assert.equal((await harness.payments.DELETE(apiRequest("DELETE", body))).status, 200);
  assert.ok(harness.stored.get(paymentId).voided_at);
  assert.equal(harness.stored.size, 1);
  assert.equal((await (await harness.payments.DELETE(apiRequest("DELETE", body))).json()).cancelled, 0);
  assert.equal((await harness.payments.POST(apiRequest("POST", body))).status, 409);
  assert.equal((await harness.payments.PATCH(apiRequest("PATCH", body))).status, 404);
  const data = await (await harness.ledger.GET(new Request("http://test/api/external-transport?month=2026-09"))).json();
  assert.equal(data.cashSummary.cashOnHand, 67277);
  assert.equal(data.cashSummary.driverReserve, 29000);
  assert.equal(data.cashSummary.netResult, 2520);
  assert.equal(data.driverPayments.length, 0);
  assert.ok(harness.queries.every((query) => !query.includes("DELETE FROM external_transport_days") && !query.includes("DELETE FROM external_transport_expenses")));
});

test("invalid salary bodies and unknown IDs are handled safely", async () => {
  const harness = await createApiHarness();
  for (const body of [null, [], { id: "bad" }, { id: paymentId, paymentDate: "2026-02-30", amount: 100 }, { id: paymentId, paymentDate: "2026-09-16", amount: -1 }]) {
    assert.equal((await harness.payments.POST(apiRequest("POST", body))).status, 400);
  }
  assert.equal(harness.connections, 0);
  assert.equal((await harness.payments.PATCH(apiRequest("PATCH", { id: paymentId, paymentDate: "2026-09-16", amount: 100 }))).status, 404);
});

test("the additive migration creates only salary storage with exact money and preserved cancellations", async () => {
  const migration = await readFile(new URL("drizzle/0003_driver_salary_payments.sql", root), "utf8");
  assert.match(migration, /CREATE TABLE "external_transport_driver_payments"/);
  assert.match(migration, /numeric\(12, 2\)/);
  assert.match(migration, /"payment_date" date/);
  assert.match(migration, /"voided_at" timestamp with time zone/);
  assert.doesNotMatch(migration, /DROP|TRUNCATE|DELETE|ALTER TABLE "(?:external_transport_days|external_transport_expenses)"/i);
});
