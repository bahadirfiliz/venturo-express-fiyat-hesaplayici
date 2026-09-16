export type DriverSalaryPayment = {
  id: string;
  paymentDate: string;
  amount: number;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export function validDriverPaymentDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) === 0) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseDriverSalaryPaymentInput(body: Record<string, unknown>) {
  if (!validDriverPaymentDate(body.paymentDate)) {
    throw new Error("Maaş ödeme tarihi geçersiz.");
  }
  const rawAmount = body.amount;
  const amount = typeof rawAmount === "number"
    ? Math.round((rawAmount + Number.EPSILON) * 100) / 100
    : NaN;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 9999999999.99) {
    throw new Error("Maaş ödeme tutarı sıfırdan büyük, geçerli bir tutar olmalıdır.");
  }
  return {
    paymentDate: body.paymentDate,
    amount,
    note: String(body.note ?? "").trim().replace(/\s+/g, " ").slice(0, 500),
  };
}

export function parseDriverPaymentMoney(value: string): number | null {
  let text = value.trim().replace(/\s/g, "");
  if (!text) return null;
  if (text.includes(",")) {
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(text)) return null;
    text = text.replace(/\./g, "").replace(",", ".");
  } else {
    if (/^\d{1,3}(?:\.\d{3})+$/.test(text)) text = text.replace(/\./g, "");
    else if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  }
  const amount = Number(text);
  return Number.isFinite(amount) && amount > 0 && amount <= 9999999999.99
    ? amount
    : null;
}

export function serializeDriverSalaryPayment(row: Record<string, unknown>): DriverSalaryPayment {
  const timestamp = (value: unknown) => value instanceof Date ? value.toISOString() : String(value);
  return {
    id: String(row.id),
    paymentDate: String(row.payment_date),
    amount: Number(row.amount),
    note: String(row.note ?? ""),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}
