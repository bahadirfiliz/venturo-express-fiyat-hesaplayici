export type CashSummary = {
  dayCount: number;
  income: number;
  paidExpenses: number;
  paidMembership: number;
  paidFuel: number;
  paidOther: number;
  accruedDriverSalary: number;
  paidDriverSalary: number;
  driverReserve: number;
  vehicleReserve: number;
  netResult: number;
  cashOnHand: number;
};

function expenseCategory(value: unknown) {
  const label = String(value ?? "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (label.includes("sofor") || label.includes("surucu")) return "driver";
  if (
    label.includes("arac kirasi") ||
    label.includes("araba kirasi") ||
    label.includes("tasit kirasi")
  ) return "vehicle";
  if (label.includes("uyelik")) return "membership";
  if (label.includes("yakit")) return "fuel";
  return "other";
}

export function buildCashSummary(
  dayRows: Array<Record<string, unknown>>,
  expenseRows: Array<Record<string, unknown>>,
  paidDriverSalary = 0,
): CashSummary {
  // Accumulate kuruş to avoid floating-point drift in the reconciliation.
  const cents = (value: unknown) => Math.round(Number(value) * 100);
  const income = dayRows.reduce((sum, day) => sum + cents(day.income_amount), 0);
  const buckets = { driver: 0, vehicle: 0, membership: 0, fuel: 0, other: 0 };
  for (const expense of expenseRows) {
    buckets[expenseCategory(expense.label)] += cents(expense.amount);
  }

  const paidSalary = cents(paidDriverSalary);
  const paidOperatingExpenses = buckets.membership + buckets.fuel + buckets.other;
  const paidExpenses = paidOperatingExpenses + paidSalary;
  const cashOnHand = income - paidExpenses;
  // Salary was already accrued as a daily cost. Paying it changes cash, not profit.
  const netResult = income - paidOperatingExpenses - buckets.driver - buckets.vehicle;

  return {
    dayCount: dayRows.length,
    income: income / 100,
    paidExpenses: paidExpenses / 100,
    paidMembership: buckets.membership / 100,
    paidFuel: buckets.fuel / 100,
    paidOther: buckets.other / 100,
    accruedDriverSalary: buckets.driver / 100,
    paidDriverSalary: paidSalary / 100,
    driverReserve: (buckets.driver - paidSalary) / 100,
    vehicleReserve: buckets.vehicle / 100,
    netResult: netResult / 100,
    cashOnHand: cashOnHand / 100,
  };
}
