import { ensureExternalTransportSchema, getSql } from "../../../../db";
import { apiAccessError } from "../../../lib/auth/session";
import { parseDriverSalaryPaymentInput, serializeDriverSalaryPayment } from "../../../lib/external-transport/driver-payments";

const paymentColumns = "id, payment_date::text AS payment_date, amount, note, created_at, updated_at";

function paymentId(value: unknown) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("Geçerli bir ödeme kaydı seçilmelidir.");
  }
  return value;
}

async function requestBody(request: Request) {
  const body: unknown = await request.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Ödeme bilgileri geçersiz.");
  }
  return body as Record<string, unknown>;
}

function paymentError(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : "Maaş ödemesi kaydedilemedi." }, { status: 400 });
}

export async function POST(request: Request) {
  const access = await apiAccessError(["admin"]);
  if (access.response) return access.response;
  try {
    const body = await requestBody(request);
    const id = paymentId(body.id);
    const payment = parseDriverSalaryPaymentInput(body);
    const database = getSql();
    await ensureExternalTransportSchema(database);
    const now = new Date().toISOString();
    // The draft's stable UUID makes retries safe if the first response was lost.
    const rows = await database.unsafe(
      `INSERT INTO external_transport_driver_payments
       (id, payment_date, amount, note, created_at, updated_at)
       VALUES ($1, $2::date, $3, $4, $5::timestamptz, $5::timestamptz)
       ON CONFLICT (id) DO NOTHING RETURNING ${paymentColumns}`,
      [id, payment.paymentDate, payment.amount, payment.note, now],
    );
    if (rows[0]) return Response.json({ payment: serializeDriverSalaryPayment(rows[0]) }, { status: 201 });
    const existing = await database.unsafe(
      `SELECT ${paymentColumns} FROM external_transport_driver_payments WHERE id = $1 AND voided_at IS NULL`,
      [id],
    );
    const saved = existing[0] ? serializeDriverSalaryPayment(existing[0]) : null;
    if (!saved || saved.paymentDate !== payment.paymentDate || saved.amount !== payment.amount || saved.note !== payment.note) {
      return Response.json({ error: "Bu ödeme kimliği daha önce kullanılmış. Listeyi yenileyip yeni ödeme açın." }, { status: 409 });
    }
    return Response.json({ payment: saved });
  } catch (error) {
    return paymentError(error);
  }
}

export async function PATCH(request: Request) {
  const access = await apiAccessError(["admin"]);
  if (access.response) return access.response;
  try {
    const body = await requestBody(request);
    const id = paymentId(body.id);
    const payment = parseDriverSalaryPaymentInput(body);
    const database = getSql();
    await ensureExternalTransportSchema(database);
    const rows = await database.unsafe(
      `UPDATE external_transport_driver_payments
       SET payment_date = $1::date, amount = $2, note = $3, updated_at = $4::timestamptz
       WHERE id = $5 AND voided_at IS NULL RETURNING ${paymentColumns}`,
      [payment.paymentDate, payment.amount, payment.note, new Date().toISOString(), id],
    );
    if (!rows[0]) return Response.json({ error: "Düzenlenecek maaş ödemesi bulunamadı." }, { status: 404 });
    return Response.json({ payment: serializeDriverSalaryPayment(rows[0]) });
  } catch (error) {
    return paymentError(error);
  }
}

export async function DELETE(request: Request) {
  const access = await apiAccessError(["admin"]);
  if (access.response) return access.response;
  try {
    const id = paymentId((await requestBody(request)).id);
    const database = getSql();
    await ensureExternalTransportSchema(database);
    // Keep cancelled payments for traceability; never delete a daily ledger record.
    const rows = await database.unsafe(
      `UPDATE external_transport_driver_payments
       SET voided_at = $1::timestamptz, updated_at = $1::timestamptz
       WHERE id = $2 AND voided_at IS NULL RETURNING id`,
      [new Date().toISOString(), id],
    );
    return Response.json({ cancelled: rows.count });
  } catch (error) {
    return paymentError(error);
  }
}
