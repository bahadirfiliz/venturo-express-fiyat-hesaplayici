"use client";

import { useRef, useState, type FormEvent } from "react";
import type { CashSummary } from "./lib/external-transport/cash-summary";
import { parseDriverPaymentMoney, validDriverPaymentDate, type DriverSalaryPayment } from "./lib/external-transport/driver-payments";

function currency(value: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(value);
}

function displayDate(value: string) {
  return value.split("-").reverse().join(".");
}

type Props = {
  today: string;
  payments: DriverSalaryPayment[];
  cashSummary: CashSummary;
  loading: boolean;
  ready: boolean;
  onSaved: () => Promise<void>;
};

export default function DriverSalaryPayments({ today, payments, cashSummary, loading, ready, onSaved }: Props) {
  const [id, setId] = useState<string>(() => crypto.randomUUID());
  const [editing, setEditing] = useState<DriverSalaryPayment | null>(null);
  const [paymentDate, setPaymentDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [invalidField, setInvalidField] = useState<"date" | "amount" | null>(null);
  const dateInput = useRef<HTMLInputElement>(null);
  const amountInput = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const parsedAmount = parseDriverPaymentMoney(amount);
  const paymentDelta = (parsedAmount ?? 0) - (editing?.amount ?? 0);
  const pendingAfterPayment = cashSummary.driverReserve - paymentDelta;
  const blocked = saving || loading || !ready;

  function resetDraft() {
    setId(crypto.randomUUID());
    setEditing(null);
    setPaymentDate(today);
    setAmount("");
    setNote("");
    setInvalidField(null);
    setError("");
    setMessage("");
  }

  function editPayment(payment: DriverSalaryPayment) {
    setEditing(payment);
    setId(payment.id);
    setPaymentDate(payment.paymentDate);
    setAmount(String(payment.amount).replace(".", ","));
    setNote(payment.note);
    setError("");
    setInvalidField(null);
    setMessage(`${displayDate(payment.paymentDate)} tarihli ödeme düzenleniyor.`);
    formRef.current?.scrollIntoView({ block: "center" });
    amountInput.current?.focus({ preventScroll: true });
  }

  async function savePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked) return;
    setError("");
    setMessage("");
    setInvalidField(null);
    if (!validDriverPaymentDate(paymentDate)) {
      setInvalidField("date");
      setError("Geçerli bir maaş ödeme tarihi girin.");
      dateInput.current?.focus();
      return;
    }
    if (parsedAmount === null) {
      setInvalidField("amount");
      setError("Sıfırdan büyük bir ödeme tutarı girin. Örn. 1.000,00");
      amountInput.current?.focus();
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/external-transport/driver-payments", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, paymentDate, amount: parsedAmount, note }),
      });
      const data = (await response.json()) as { payment?: DriverSalaryPayment; error?: string };
      if (!response.ok || !data.payment) throw new Error(data.error || "Maaş ödemesi kaydedilemedi.");
      const action = editing ? "güncellendi" : "kaydedildi";
      resetDraft();
      // Once the write is confirmed, a refresh failure must not encourage a duplicate payment.
      try {
        await onSaved();
        setMessage(`Şoför maaş ödemesi ${action}. Kasa ve bekleyen birikim güncellendi.`);
      } catch {
        setMessage(`Şoför maaş ödemesi ${action}; kasa görünümü yenilenemedi. Yeni ödeme girmeden sayfayı yenileyin.`);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Maaş ödemesi kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  async function cancelPayment(payment: DriverSalaryPayment) {
    if (blocked || !window.confirm(`${displayDate(payment.paymentDate)} tarihli ${currency(payment.amount)} tutarındaki hatalı ödeme kaydı iptal edilsin mi? Bu işlem para iadesi yapmaz; kayıt kasa hesabından çıkarılır.`)) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/external-transport/driver-payments", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: payment.id }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Ödeme kaydı iptal edilemedi.");
      if (editing?.id === payment.id) resetDraft();
      try {
        await onSaved();
        setMessage("Hatalı maaş ödeme kaydı iptal edildi. Kasa yeniden hesaplandı.");
      } catch {
        setMessage("Ödeme kaydı iptal edildi; kasa görünümü yenilenemedi. Sayfayı yenileyin.");
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ödeme kaydı iptal edilemedi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="panel external-driver-payments" data-testid="driver-salary-payments">
      <div className="external-card-heading">
        <div><span>Kasadan ödeme</span><h3>Şoför maaş ödemesi</h3></div>
        <button type="button" disabled={saving} onClick={resetDraft}>{editing ? "Düzenlemeyi iptal et" : "Yeni ödeme"}</button>
      </div>
      <p className="external-payment-help" id="driver-payment-help">
        Gerçekte ödediğiniz maaşı buraya girin. Ödeme kasadan ve şoför için bekleyen birikimden düşer;
        günlük giderlerde hesaplanan maaş, kâr / zarardan tekrar düşülmez.
      </p>
      <div className="external-payment-layout">
        <form ref={formRef} onSubmit={savePayment} noValidate aria-describedby="driver-payment-help" aria-busy={saving}>
          <fieldset disabled={blocked}>
            <legend>{editing ? "Maaş ödemesini düzenle" : "Yeni maaş ödemesi"}</legend>
            <div className="external-income-grid">
              <label htmlFor="driver-payment-date"><span>Ödeme tarihi</span>
                <input id="driver-payment-date" ref={dateInput} type="date" required value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} aria-invalid={invalidField === "date"} aria-describedby={invalidField === "date" ? "driver-payment-error" : undefined} />
              </label>
              <label htmlFor="driver-payment-amount"><span>Ödenen maaş (TL)</span>
                <input id="driver-payment-amount" ref={amountInput} type="text" inputMode="decimal" required placeholder="Örn. 10.000,00" value={amount} onChange={(event) => setAmount(event.target.value)} aria-invalid={invalidField === "amount"} aria-describedby={invalidField === "amount" ? "driver-payment-error" : undefined} />
              </label>
              <label htmlFor="driver-payment-note" className="external-wide-field"><span>Açıklama (isteğe bağlı)</span>
                <input id="driver-payment-note" value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="Örn. Eylül maaşı · banka havalesi" />
              </label>
            </div>
            {ready && parsedAmount !== null && <dl className="external-payment-preview" aria-live="polite">
              <div><dt>Ödeme sonrası kasa</dt><dd>{currency(cashSummary.cashOnHand - paymentDelta)}</dd></div>
              <div><dt>{pendingAfterPayment < 0 ? "Şoföre verilen maaş avansı" : "Ödeme sonrası bekleyen maaş"}</dt><dd>{currency(Math.abs(pendingAfterPayment))}</dd></div>
            </dl>}
            {ready && parsedAmount !== null && pendingAfterPayment < 0 && <p className="external-payment-warning">Ödeme biriken hakedişi aşıyor. Fazla ödenen kısım maaş avansı olarak görünür.</p>}
            {error && <p id="driver-payment-error" className="external-feedback error" role="alert">{error}</p>}
            {message && <p className="external-feedback success" role="status">{message}</p>}
            <button type="submit" className="external-save-button">{saving ? "Kaydediliyor…" : editing ? "Maaş ödemesini güncelle" : "Maaş ödemesini kaydet"}</button>
          </fieldset>
          {!ready && <p className="external-empty" role="status">Kasa verileri alınmadan ödeme girişi yapılamaz.</p>}
        </form>
        <section className="external-payment-history" aria-labelledby="driver-payment-history-title">
          <div className="external-card-heading"><div><span>Tüm zamanlar</span><h4 id="driver-payment-history-title">Tarih tarih maaş ödemeleri</h4></div>
            <strong>{ready ? currency(payments.reduce((sum, payment) => sum + payment.amount, 0)) : "—"}</strong>
          </div>
          <div className="table-shell external-payment-shell">
            <table><thead><tr><th scope="col">Tarih</th><th scope="col">Ödenen</th><th scope="col">Açıklama</th><th scope="col">İşlem</th></tr></thead><tbody>
              {loading ? <tr><td colSpan={4}>Ödemeler yükleniyor…</td></tr> : ready ? payments.length ? payments.map((payment) => <tr key={payment.id}>
                <td>{displayDate(payment.paymentDate)}</td><td><b>{currency(payment.amount)}</b></td><td>{payment.note || "—"}</td>
                <td><div className="external-row-actions"><button type="button" disabled={blocked} onClick={() => editPayment(payment)}>Düzenle</button><button type="button" disabled={blocked} className="danger" onClick={() => cancelPayment(payment)}>İptal et</button></div></td>
              </tr>) : <tr><td colSpan={4}>Henüz maaş ödemesi kaydedilmedi.</td></tr> : <tr><td colSpan={4}>Ödeme kayıtları alınamadı.</td></tr>}
            </tbody></table>
          </div>
          <p className="external-payment-help">Kısmi ödemeleri ayrı ayrı kaydedebilirsiniz. Hatalı kayıtlar iptal edildiğinde geçmiş kaydı veritabanında korunur.</p>
        </section>
      </div>
    </article>
  );
}
