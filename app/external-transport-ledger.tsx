"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DriverSalaryPayments from "./driver-salary-payments";
import type { CashSummary } from "./lib/external-transport/cash-summary";
import type { DriverSalaryPayment } from "./lib/external-transport/driver-payments";

type StoredExpense = {
  id: string;
  label: string;
  amount: number;
  sortOrder: number;
};

type StoredDay = {
  id: string;
  entryDate: string;
  monthKey: string;
  incomeAmount: number;
  incomeNote: string;
  createdAt: string;
  updatedAt: string;
  expenses: StoredExpense[];
};

type ExpenseDraft = {
  key: string;
  label: string;
  amount: string;
  optional?: boolean;
};

type DaysResponse = {
  days: StoredDay[];
  months: string[];
  cashSummary: CashSummary;
  driverPayments: DriverSalaryPayment[];
};

const EMPTY_CASH_SUMMARY: CashSummary = {
  dayCount: 0,
  income: 0,
  paidExpenses: 0,
  paidMembership: 0,
  paidFuel: 0,
  paidOther: 0,
  accruedDriverSalary: 0,
  paidDriverSalary: 0,
  driverReserve: 0,
  vehicleReserve: 0,
  netResult: 0,
  cashOnHand: 0,
};

const FIXED_DAILY_EXPENSES = [
  { label: "Üyelik", amount: "1000,00" },
  { label: "Araç Kirası", amount: "1233,00" },
  { label: "Şoför Parası", amount: "1000,00" },
  { label: "Yakıt", amount: "", optional: true },
] as const;

function todayInIstanbul() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function newExpense(
  label = "",
  amount = "",
  optional = false,
): ExpenseDraft {
  return { key: crypto.randomUUID(), label, amount, optional };
}

function defaultExpenses() {
  return FIXED_DAILY_EXPENSES.map((expense) =>
    newExpense(
      expense.label,
      expense.amount,
      "optional" in expense && expense.optional,
    ),
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

function formatMonth(value: string) {
  if (!value) return "Ay seçilmedi";
  const date = new Date(`${value}-01T00:00:00Z`);
  const label = new Intl.DateTimeFormat("tr-TR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
  return label.charAt(0).toLocaleUpperCase("tr-TR") + label.slice(1);
}

function parseMoney(value: string) {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return 0;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function expenseTotal(day: StoredDay) {
  return day.expenses.reduce((sum, expense) => sum + expense.amount, 0);
}

export default function ExternalTransportLedger() {
  const today = todayInIstanbul();
  const [entryDate, setEntryDate] = useState(today);
  const [incomeAmount, setIncomeAmount] = useState("");
  const [incomeNote, setIncomeNote] = useState("");
  const [expenses, setExpenses] = useState<ExpenseDraft[]>(defaultExpenses);
  const [days, setDays] = useState<StoredDay[]>([]);
  const [driverPayments, setDriverPayments] = useState<DriverSalaryPayment[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [cashSummary, setCashSummary] = useState<CashSummary>(
    EMPTY_CASH_SUMMARY,
  );
  const [selectedMonth, setSelectedMonth] = useState(today.slice(0, 7));
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const requestDays = useCallback(async (monthKey: string) => {
    const response = await fetch(
      `/api/external-transport?month=${encodeURIComponent(monthKey)}`,
      { cache: "no-store" },
    );
    const data = (await response.json()) as {
      days?: StoredDay[];
      months?: string[];
      cashSummary?: CashSummary;
      driverPayments?: DriverSalaryPayment[];
      error?: string;
    };
    if (!response.ok) {
      throw new Error(data.error || "Harici taşıma kayıtları alınamadı.");
    }
    if (!data.cashSummary) throw new Error("Kasa verileri alınamadı; kayıtların silindiği anlamına gelmez.");
    return {
      days: data.days ?? [],
      months: data.months ?? [],
      cashSummary: data.cashSummary,
      driverPayments: data.driverPayments ?? [],
    };
  }, []);

  const applyDays = useCallback((monthKey: string, data: DaysResponse) => {
    setDays(data.days);
    setCashSummary(data.cashSummary);
    setDriverPayments(data.driverPayments);
    setDataLoaded(true);
    setLoadError("");
    setAvailableMonths(
      [...new Set([monthKey, ...data.months])].sort().reverse(),
    );
  }, []);

  const loadDays = useCallback(
    async (monthKey: string) => {
      try {
        applyDays(monthKey, await requestDays(monthKey));
      } catch (requestError) {
        setLoadError(requestError instanceof Error ? requestError.message : "Kasa verileri alınamadı.");
        throw requestError;
      }
    },
    [applyDays, requestDays],
  );

  useEffect(() => {
    let active = true;
    void requestDays(selectedMonth)
      .then((data) => {
        if (active) applyDays(selectedMonth, data);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setLoadError(
          requestError instanceof Error
            ? requestError.message
            : "Harici taşıma kayıtları alınamadı.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [applyDays, requestDays, selectedMonth]);

  function cashAmount(value: number) {
    return dataLoaded ? formatCurrency(value) : "—";
  }

  async function refreshDriverPayments() {
    await loadDays(selectedMonth);
  }

  const totals = useMemo(() => {
    const income = days.reduce((sum, day) => sum + day.incomeAmount, 0);
    const expense = days.reduce((sum, day) => sum + expenseTotal(day), 0);
    return { income, expense, net: income - expense };
  }, [days]);

  const maxDailyAmount = useMemo(
    () =>
      Math.max(
        1,
        ...days.flatMap((day) => [day.incomeAmount, expenseTotal(day)]),
      ),
    [days],
  );

  function resetDraft(date = today) {
    setEditingId(null);
    setEntryDate(date);
    setIncomeAmount("");
    setIncomeNote("");
    setExpenses(defaultExpenses());
    setMessage("");
    setError("");
  }

  function updateExpense(
    key: string,
    field: "label" | "amount",
    value: string,
  ) {
    setExpenses((current) =>
      current.map((expense) =>
        expense.key === key ? { ...expense, [field]: value } : expense,
      ),
    );
  }

  function editDay(day: StoredDay) {
    setEditingId(day.id);
    setEntryDate(day.entryDate);
    setIncomeAmount(String(day.incomeAmount));
    setIncomeNote(day.incomeNote);
    setExpenses(
      day.expenses.length
        ? day.expenses.map((expense) =>
            newExpense(expense.label, String(expense.amount)),
          )
        : [newExpense()],
    );
    setMessage(`${formatDate(day.entryDate)} kaydı düzenleniyor.`);
    setError("");
    window.scrollTo({ top: 560, behavior: "smooth" });
  }

  async function saveDay() {
    setMessage("");
    setError("");
    const parsedIncome = parseMoney(incomeAmount);
    if (!entryDate || parsedIncome === null) {
      setError("Tarih ve geçerli bir günlük gelir tutarı girin.");
      return;
    }
    const parsedExpenses = expenses
      .map((expense) => ({
        label: expense.label.trim(),
        amount: parseMoney(expense.amount),
        amountEntered: expense.amount.trim() !== "",
        optional: expense.optional === true,
      }))
      .filter(
        (expense) =>
          !(expense.optional && !expense.amountEntered) &&
          (expense.label || (expense.amount ?? 0) > 0),
      );
    if (
      parsedExpenses.some(
        (expense) => !expense.label || expense.amount === null || expense.amount <= 0,
      )
    ) {
      setError("Her gider satırında gider kalemi ve sıfırdan büyük tutar olmalı.");
      return;
    }
    if (parsedIncome === 0 && parsedExpenses.length === 0) {
      setError("Gelir veya en az bir gider kalemi girin.");
      return;
    }
    setSaving(true);
    try {
      const updating = Boolean(editingId);
      const response = await fetch("/api/external-transport", {
        method: updating ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          entryDate,
          incomeAmount: parsedIncome,
          incomeNote,
          expenses: parsedExpenses,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Günlük kayıt kaydedilemedi.");
      }
      const monthKey = entryDate.slice(0, 7);
      if (selectedMonth === monthKey) await loadDays(monthKey);
      else {
        setLoading(true);
        setSelectedMonth(monthKey);
      }
      resetDraft(today);
      setMessage(
        updating
          ? "Günlük gelir ve gider kaydı güncellendi."
          : "Günlük gelir ve gider kaydı kaydedildi.",
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Günlük kayıt kaydedilemedi.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteDay(day: StoredDay) {
    if (!window.confirm(`${formatDate(day.entryDate)} kaydı silinsin mi?`)) return;
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/external-transport", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: day.id }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Kayıt silinemedi.");
      await loadDays(selectedMonth);
      if (editingId === day.id) resetDraft(today);
      setMessage("Günlük kayıt silindi.");
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Kayıt silinemedi.",
      );
    }
  }

  return (
    <section
      className="content-section external-transport-section"
      data-testid="external-transport-section"
    >
      <div className="content-heading">
        <div>
          <span className="section-index">03</span>
          <p>Günlük harici taşıma takibi</p>
          <h2>Geliri, gider kalemlerini ve günlük net kazancı kaydet</h2>
        </div>
        <span className="model-badge">Günlük kayıt · Kalıcı veri</span>
      </div>

      <div className="external-entry-layout">
        <article className="panel external-entry-form">
          <div className="external-card-heading">
            <div>
              <span>{editingId ? "Kayıt düzenleniyor" : "Günlük kayıt"}</span>
              <h3>Harici taşıma gelir ve giderleri</h3>
            </div>
            <button type="button" onClick={() => resetDraft()}>
              {editingId ? "Düzenlemeyi iptal et" : "Yeni gün"}
            </button>
          </div>

          <div className="external-income-grid">
            <label>
              <span>Tarih</span>
              <input
                type="date"
                value={entryDate}
                onChange={(event) => setEntryDate(event.target.value)}
              />
            </label>
            <label>
              <span>Günlük kazanç / gelir (TL)</span>
              <input
                type="text"
                inputMode="decimal"
                value={incomeAmount}
                onChange={(event) => setIncomeAmount(event.target.value)}
                placeholder="0,00"
              />
            </label>
            <label className="external-wide-field">
              <span>Gelir açıklaması</span>
              <input
                value={incomeNote}
                onChange={(event) => setIncomeNote(event.target.value)}
                placeholder="Örn. Günlük harici taşıma işleri"
              />
            </label>
          </div>

          <div className="external-expense-heading">
            <div>
              <span>Günlük giderler</span>
              <small>
                Üyelik, araç kirası ve şoför parası sabit; yakıt girişe hazırdır.
              </small>
            </div>
            <button
              type="button"
              onClick={() => setExpenses((current) => [...current, newExpense()])}
              disabled={expenses.length >= 30}
            >
              + Gider kalemi
            </button>
          </div>

          <div className="external-expense-list">
            {expenses.map((expense, index) => (
              <div className="external-expense-row" key={expense.key}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <input
                  value={expense.label}
                  onChange={(event) =>
                    updateExpense(expense.key, "label", event.target.value)
                  }
                  placeholder="Gider kalemi (yakıt, otoyol, şoför...)"
                />
                <input
                  type="text"
                  inputMode="decimal"
                  value={expense.amount}
                  onChange={(event) =>
                    updateExpense(expense.key, "amount", event.target.value)
                  }
                  placeholder="0,00 TL"
                />
                <button
                  type="button"
                  aria-label={`${index + 1}. gider kalemini kaldır`}
                  onClick={() =>
                    setExpenses((current) =>
                      current.length === 1
                        ? [newExpense()]
                        : current.filter((item) => item.key !== expense.key),
                    )
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {error && <p className="external-feedback error">{error}</p>}
          {message && <p className="external-feedback success">{message}</p>}
          <button
            type="button"
            className="external-save-button"
            onClick={saveDay}
            disabled={saving}
          >
            {saving
              ? editingId
                ? "Güncelleniyor…"
                : "Kaydediliyor…"
              : editingId
                ? "Günlük kaydı güncelle"
                : "Günlük kaydı kaydet"}
          </button>
        </article>

        <aside className="external-live-balance">
          <span>Girilen günün dengesi</span>
          <strong>
            {formatCurrency(
              (parseMoney(incomeAmount) ?? 0) -
                expenses.reduce(
                  (sum, expense) => sum + (parseMoney(expense.amount) ?? 0),
                  0,
                ),
            )}
          </strong>
          <dl>
            <div><dt>Gelir</dt><dd>{formatCurrency(parseMoney(incomeAmount) ?? 0)}</dd></div>
            <div>
              <dt>Toplam gider</dt>
              <dd>
                − {formatCurrency(
                  expenses.reduce(
                    (sum, expense) => sum + (parseMoney(expense.amount) ?? 0),
                    0,
                  ),
                )}
              </dd>
            </div>
          </dl>
          <p>
            {editingId
              ? "Seçili günün tarih, gelir ve gider kalemlerini değiştirebilirsiniz."
              : "Listeden Düzenle seçeneğiyle mevcut bir günü güncelleyebilirsiniz."}
          </p>
        </aside>
      </div>

      <div className="external-ledger-heading">
        <div><span>Aylık görünüm</span><h3>{formatMonth(selectedMonth)} gelir-gider dengesi</h3></div>
        <label>
          <span>Dönem</span>
          <select
            value={selectedMonth}
            onChange={(event) => {
              setLoading(true);
              setError("");
              setSelectedMonth(event.target.value);
            }}
          >
            {availableMonths.map((month) => (
              <option value={month} key={month}>{formatMonth(month)}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="external-summary-grid">
        <article className="income"><span>Toplam gelir</span><strong>{cashAmount(totals.income)}</strong></article>
        <article className="expense"><span>Toplam gider</span><strong>{cashAmount(totals.expense)}</strong></article>
        <article className={totals.net >= 0 ? "net positive" : "net negative"}><span>Net bakiye</span><strong>{cashAmount(totals.net)}</strong></article>
        <article><span>Kayıtlı gün</span><strong>{dataLoaded ? days.length : "—"}</strong></article>
      </div>

      <div className="external-report-grid">
        <article className="panel external-trend-card">
          <div className="external-card-heading">
            <div><span>Günlük hareket</span><h3>Gelir ve gider karşılaştırması</h3></div>
          </div>
          <div className="external-trend-list">
            {[...days].reverse().map((day) => {
              const expense = expenseTotal(day);
              const net = day.incomeAmount - expense;
              return (
                <div className="external-trend-row" key={day.id}>
                  <b>{formatDate(day.entryDate).slice(0, 5)}</b>
                  <div>
                    <span className="income-bar" style={{ width: `${(day.incomeAmount / maxDailyAmount) * 100}%` }} />
                    <span className="expense-bar" style={{ width: `${(expense / maxDailyAmount) * 100}%` }} />
                  </div>
                  <strong className={net >= 0 ? "positive" : "negative"}>{formatCurrency(net)}</strong>
                </div>
              );
            })}
            {!loading && days.length === 0 && <p className="external-empty">{loadError ? "Günlük kayıtlar alınamadı; mevcut veriler silinmedi." : "Bu ay için günlük kayıt bulunmuyor."}</p>}
          </div>
          <div className="external-trend-legend"><span><i className="income" /> Gelir</span><span><i className="expense" /> Gider</span></div>
        </article>

        <article className="panel external-detail-card">
          <div className="external-card-heading">
            <div><span>Günlük detay</span><h3>Gelir, gider kalemleri ve net</h3></div>
          </div>
          <div className="table-shell external-detail-shell">
            <table>
              <thead><tr><th>Tarih</th><th>Gelir</th><th>Giderler</th><th>Toplam gider</th><th>Net</th><th>İşlem</th></tr></thead>
              <tbody>
                {days.map((day) => {
                  const expense = expenseTotal(day);
                  const net = day.incomeAmount - expense;
                  return (
                    <tr key={day.id}>
                      <td><b>{formatDate(day.entryDate)}</b><small>{day.incomeNote || "Açıklama yok"}</small></td>
                      <td>{formatCurrency(day.incomeAmount)}</td>
                      <td>{day.expenses.length ? day.expenses.map((item) => <small key={item.id}>{item.label}: {formatCurrency(item.amount)}</small>) : <small>Gider yok</small>}</td>
                      <td>{formatCurrency(expense)}</td>
                      <td><b className={net >= 0 ? "positive" : "negative"}>{formatCurrency(net)}</b></td>
                      <td><div className="external-row-actions"><button type="button" onClick={() => editDay(day)}>Düzenle</button><button type="button" className="danger" onClick={() => deleteDay(day)}>Sil</button></div></td>
                    </tr>
                  );
                })}
                {!loading && days.length === 0 && <tr><td colSpan={6}>{loadError ? "Günlük kayıtlar alınamadı; mevcut veriler silinmedi." : "Bu dönem için kayıt bulunmuyor."}</td></tr>}
                {loading && <tr><td colSpan={6}>Kayıtlar yükleniyor…</td></tr>}
              </tbody>
            </table>
          </div>
        </article>
      </div>

      <article
        className={`external-cash-position ${cashSummary.cashOnHand >= 0 ? "cash-positive" : "cash-negative"}`}
        data-testid="external-cash-position"
      >
        <section className="external-cash-hero">
          <span>Tüm zamanlar · {dataLoaded ? `${cashSummary.dayCount} kayıtlı gün` : "Veri bekleniyor"}</span>
          <h3>Kasada olması gereken net para</h3>
          <strong>{cashAmount(cashSummary.cashOnHand)}</strong>
          <p>
            Tahsil edilen toplam gelirden yalnızca ödenmiş giderler düşülmüştür.
            Ödenen şoför maaşları kasadan düşülür. Henüz ödenmemiş şoför ve araç
            kirası için ayrılan para kasanın içinde gösterilir.
          </p>
          {loadError && <p className="external-cash-load-error" role="alert">{loadError} {dataLoaded ? "Görünen tutarlar son alınan verilerdir." : "Veriler alınamadığı için bakiye sıfır gösterilmez."}</p>}
        </section>

        <section className="external-cash-breakdown">
          <div className="external-reserve-grid">
            <article>
              <span>{cashSummary.driverReserve < 0 ? "Şoföre verilen maaş avansı" : "Şoför için biriken"}</span>
              <strong>{cashAmount(Math.abs(cashSummary.driverReserve))}</strong>
              <small>{cashSummary.driverReserve < 0 ? "Hakedişten fazla ödenen; kontrolde eksi tutar" : "Ödenmeyi bekleyen maaş"}</small>
              <small>Toplam hakediş: {cashAmount(cashSummary.accruedDriverSalary)}</small>
              <small>Ödenen maaş: {cashAmount(cashSummary.paidDriverSalary)}</small>
            </article>
            <article>
              <span>Araç kirası için biriken</span>
              <strong>{cashAmount(cashSummary.vehicleReserve)}</strong>
              <small>Ödenmek üzere kasada ayrılan</small>
            </article>
            <article className={cashSummary.netResult >= 0 ? "profit" : "loss"}>
              <span>Birikmiş net kâr / zarar</span>
              <strong>{cashAmount(cashSummary.netResult)}</strong>
              <small>Tüm maliyetlerden sonraki sonuç</small>
            </article>
          </div>

          <dl className="external-cash-reconciliation">
            <div>
              <dt>Toplam tahsil edilen gelir</dt>
              <dd>{cashAmount(cashSummary.income)}</dd>
            </div>
            <div>
              <dt>Ödenen üyelik</dt>
              <dd>− {cashAmount(cashSummary.paidMembership)}</dd>
            </div>
            <div>
              <dt>Ödenen yakıt</dt>
              <dd>− {cashAmount(cashSummary.paidFuel)}</dd>
            </div>
            <div>
              <dt>Şoför maaş ödemeleri</dt>
              <dd>− {cashAmount(cashSummary.paidDriverSalary)}</dd>
            </div>
            {cashSummary.paidOther > 0 && (
              <div>
                <dt>Ödenen diğer giderler</dt>
                <dd>− {cashAmount(cashSummary.paidOther)}</dd>
              </div>
            )}
            <div className="external-cash-total">
              <dt>Kasada olması gereken</dt>
              <dd>{cashAmount(cashSummary.cashOnHand)}</dd>
            </div>
          </dl>

          <p className="external-cash-formula">
            Kontrol: Şoför için kalan birikim + araç kirası birikimi + net kâr / zarar =
            kasada olması gereken toplam. Maaş avansı varsa şoför kalemi eksi hesaba katılır.
          </p>
        </section>
      </article>
      <DriverSalaryPayments
        today={today}
        payments={driverPayments}
        cashSummary={cashSummary}
        loading={loading}
        ready={dataLoaded && !loadError}
        onSaved={refreshDriverPayments}
      />
    </section>
  );
}
