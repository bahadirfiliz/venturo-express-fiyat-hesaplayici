import { ensureExternalTransportSchema, getSql } from "../../../db";
import { apiAccessError } from "../../lib/auth/session";

type ExpenseInput = { label?: unknown; amount?: unknown };

function cleanText(value: unknown, maxLength = 240) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function validDate(value: unknown) {
  const text = cleanText(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text
    ? text
    : null;
}

function nonNegativeAmount(value: unknown, label: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${label} geçersiz.`);
  }
  return Math.round(amount * 100) / 100;
}

function parseDayInput(body: Record<string, unknown>) {
  const entryDate = validDate(body.entryDate);
  if (!entryDate) throw new Error("Kayıt tarihi geçersiz.");
  const incomeAmount = nonNegativeAmount(body.incomeAmount, "Günlük gelir");
  const rawExpenses = Array.isArray(body.expenses)
    ? (body.expenses as ExpenseInput[])
    : [];
  if (rawExpenses.length > 30) {
    throw new Error("Bir güne en fazla 30 gider kalemi girilebilir.");
  }
  const expenses = rawExpenses
    .map((expense) => ({
      label: cleanText(expense.label, 160),
      amount: nonNegativeAmount(expense.amount, "Gider tutarı"),
    }))
    .filter((expense) => expense.label || expense.amount > 0);
  if (expenses.some((expense) => !expense.label || expense.amount <= 0)) {
    throw new Error(
      "Her gider kaleminde açıklama ve sıfırdan büyük tutar olmalıdır.",
    );
  }
  if (incomeAmount === 0 && expenses.length === 0) {
    throw new Error("Gelir veya en az bir gider kalemi girilmelidir.");
  }
  return {
    entryDate,
    incomeAmount,
    incomeNote: cleanText(body.incomeNote, 500),
    expenses,
  };
}

function currentMonthInIstanbul() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function serializeDay(
  row: Record<string, unknown>,
  expenses: Array<Record<string, unknown>>,
) {
  return {
    id: String(row.id),
    entryDate: String(row.entry_date),
    monthKey: String(row.month_key),
    incomeAmount: Number(row.income_amount),
    incomeNote: String(row.income_note ?? ""),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    expenses: expenses.map((expense) => ({
      id: String(expense.id),
      label: String(expense.label),
      amount: Number(expense.amount),
      sortOrder: Number(expense.sort_order),
    })),
  };
}

function errorResponse(error: unknown, status = 400) {
  return Response.json(
    {
      error:
        error instanceof Error ? error.message : "İşlem tamamlanamadı.",
    },
    { status },
  );
}

export async function GET(request: Request) {
  const access = await apiAccessError(["admin"]);
  if (access.response) return access.response;
  try {
    const database = getSql();
    await ensureExternalTransportSchema(database);
    const requestedMonth = new URL(request.url).searchParams.get("month") ?? "";
    const monthKey = /^\d{4}-\d{2}$/.test(requestedMonth)
      ? requestedMonth
      : currentMonthInIstanbul();
    const [dayRows, expenseRows, monthRows] = await Promise.all([
      database.unsafe(
        `SELECT * FROM external_transport_days
         WHERE month_key = $1
         ORDER BY entry_date DESC`,
        [monthKey],
      ),
      database.unsafe(
        `SELECT e.* FROM external_transport_expenses e
         INNER JOIN external_transport_days d ON d.id = e.day_id
         WHERE d.month_key = $1
         ORDER BY d.entry_date DESC, e.sort_order ASC, e.created_at ASC`,
        [monthKey],
      ),
      database.unsafe(
        "SELECT DISTINCT month_key FROM external_transport_days ORDER BY month_key DESC",
      ),
    ]);
    const days = dayRows as unknown as Array<Record<string, unknown>>;
    const expenses = expenseRows as unknown as Array<Record<string, unknown>>;
    return Response.json({
      selectedMonth: monthKey,
      months: (monthRows as unknown as Array<Record<string, unknown>>).map(
        (row) => String(row.month_key),
      ),
      days: days.map((day) =>
        serializeDay(
          day,
          expenses.filter((expense) => expense.day_id === day.id),
        ),
      ),
    });
  } catch (error) {
    return errorResponse(error, 500);
  }
}

export async function POST(request: Request) {
  const access = await apiAccessError(["admin"]);
  if (access.response) return access.response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const { entryDate, incomeAmount, incomeNote, expenses } = parseDayInput(body);

    const database = getSql();
    await ensureExternalTransportSchema(database);
    const now = new Date().toISOString();
    const day = await database.begin(async (transaction) => {
      const dayRows = (await transaction.unsafe(
        `INSERT INTO external_transport_days (
          id, entry_date, month_key, income_amount, income_note, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $6)
        ON CONFLICT (entry_date) DO UPDATE SET
          month_key = EXCLUDED.month_key,
          income_amount = EXCLUDED.income_amount,
          income_note = EXCLUDED.income_note,
          updated_at = EXCLUDED.updated_at
        RETURNING *`,
        [
          crypto.randomUUID(),
          entryDate,
          entryDate.slice(0, 7),
          incomeAmount,
          incomeNote,
          now,
        ],
      )) as unknown as Array<Record<string, unknown>>;
      const savedDay = dayRows[0];
      if (!savedDay) throw new Error("Günlük kayıt oluşturulamadı.");
      await transaction.unsafe(
        "DELETE FROM external_transport_expenses WHERE day_id = $1",
        [String(savedDay.id)],
      );
      const savedExpenses: Array<Record<string, unknown>> = [];
      for (const [index, expense] of expenses.entries()) {
        const rows = (await transaction.unsafe(
          `INSERT INTO external_transport_expenses (
            id, day_id, label, amount, sort_order, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $6)
          RETURNING *`,
          [
            crypto.randomUUID(),
            String(savedDay.id),
            expense.label,
            expense.amount,
            index,
            now,
          ],
        )) as unknown as Array<Record<string, unknown>>;
        if (rows[0]) savedExpenses.push(rows[0]);
      }
      return serializeDay(savedDay, savedExpenses);
    });

    return Response.json({ day }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const access = await apiAccessError(["admin"]);
  if (access.response) return access.response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    if (!id) throw new Error("Düzenlenecek günlük kayıt seçilmedi.");
    const { entryDate, incomeAmount, incomeNote, expenses } = parseDayInput(body);
    const database = getSql();
    await ensureExternalTransportSchema(database);
    const conflictRows = (await database.unsafe(
      `SELECT id FROM external_transport_days
       WHERE entry_date = $1 AND id <> $2
       LIMIT 1`,
      [entryDate, id],
    )) as unknown as Array<Record<string, unknown>>;
    if (conflictRows.length > 0) {
      throw new Error("Seçilen tarih için başka bir günlük kayıt zaten var.");
    }
    const now = new Date().toISOString();
    const day = await database.begin(async (transaction) => {
      const dayRows = (await transaction.unsafe(
        `UPDATE external_transport_days
         SET entry_date = $1, month_key = $2, income_amount = $3,
             income_note = $4, updated_at = $5
         WHERE id = $6
         RETURNING *`,
        [entryDate, entryDate.slice(0, 7), incomeAmount, incomeNote, now, id],
      )) as unknown as Array<Record<string, unknown>>;
      const savedDay = dayRows[0];
      if (!savedDay) throw new Error("Düzenlenecek günlük kayıt bulunamadı.");
      await transaction.unsafe(
        "DELETE FROM external_transport_expenses WHERE day_id = $1",
        [id],
      );
      const savedExpenses: Array<Record<string, unknown>> = [];
      for (const [index, expense] of expenses.entries()) {
        const rows = (await transaction.unsafe(
          `INSERT INTO external_transport_expenses (
            id, day_id, label, amount, sort_order, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $6)
          RETURNING *`,
          [crypto.randomUUID(), id, expense.label, expense.amount, index, now],
        )) as unknown as Array<Record<string, unknown>>;
        if (rows[0]) savedExpenses.push(rows[0]);
      }
      return serializeDay(savedDay, savedExpenses);
    });

    return Response.json({ day });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const access = await apiAccessError(["admin"]);
  if (access.response) return access.response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    if (!id) throw new Error("Silinecek günlük kayıt seçilmedi.");
    const database = getSql();
    await ensureExternalTransportSchema(database);
    const result = await database.unsafe(
      "DELETE FROM external_transport_days WHERE id = $1",
      [id],
    );
    return Response.json({ deleted: result.count });
  } catch (error) {
    return errorResponse(error);
  }
}
