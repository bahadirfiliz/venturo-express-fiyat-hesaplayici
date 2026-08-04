"use client";

import { useEffect, useMemo, useState } from "react";
import type { CustomerJob } from "../lib/customer/jobs";
import type { CustomerVehicle } from "../lib/customer/pricing";

type PortalTab = "quote" | "jobs" | "proforma";
type PricingOptions = {
  districts: Array<{ name: string; zoneCode: string }>;
  vehicles: CustomerVehicle[];
  priorities: string[];
  packages: string[];
  vatRate: number;
  priceDate: string;
};
type Quote =
  | {
      special: true;
      departureZone: string;
      arrivalZone: string;
      distanceKm: number | null;
      appliedDesi: number;
      priceDate: string;
    }
  | {
      special: false;
      departureZone: string;
      arrivalZone: string;
      distanceKm: number | null;
      appliedDesi: number;
      netPrice: number;
      vatRate: number;
      vat: number;
      gross: number;
      priceDate: string;
    };

function formatCurrency(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number, digits = 1) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: digits }).format(value);
}

function formatDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

function formatMonth(value: string) {
  if (!value) return "Dönem yok";
  const date = new Date(`${value}-01T00:00:00Z`);
  const text = new Intl.DateTimeFormat("tr-TR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
  return text.charAt(0).toLocaleUpperCase("tr-TR") + text.slice(1);
}

function todayInIstanbul() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default function CustomerPortal({
  user,
  customer,
  jobs,
  options,
}: {
  user: { username: string; displayName: string };
  customer: { code: string; shortName: string; legalTitle: string; jobFirm: string };
  jobs: CustomerJob[];
  options: PricingOptions;
}) {
  const [activeTab, setActiveTab] = useState<PortalTab>("quote");
  const [departure, setDeparture] = useState("Beşiktaş");
  const [arrival, setArrival] = useState("Kadıköy");
  const [vehicle, setVehicle] = useState<CustomerVehicle>("Motor Kurye");
  const [priority, setPriority] = useState("Normal");
  const [packageProfile, setPackageProfile] = useState("1 A4 Evrak");
  const [actualDesi, setActualDesi] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [quoteLoading, setQuoteLoading] = useState(true);
  const monthOptions = useMemo(
    () => [...new Set(jobs.map((job) => job.monthKey))].sort().reverse(),
    [jobs],
  );
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0] ?? "");

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setQuoteLoading(true);
      setQuoteError("");
      void fetch("/api/customer/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          departure,
          arrival,
          vehicle,
          priority,
          packageProfile,
          actualDesi: actualDesi.trim() === "" ? null : actualDesi,
        }),
      })
        .then(async (response) => {
          const data = (await response.json()) as { quote?: Quote; error?: string };
          if (!response.ok || !data.quote) throw new Error(data.error || "Fiyat hesaplanamadı.");
          setQuote(data.quote);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setQuote(null);
          setQuoteError(error instanceof Error ? error.message : "Fiyat hesaplanamadı.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setQuoteLoading(false);
        });
    }, 180);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [actualDesi, arrival, departure, packageProfile, priority, vehicle]);

  const monthJobs = jobs.filter((job) => job.monthKey === selectedMonth);
  const proformaJobs = monthJobs.filter((job) => job.proformaIncluded);
  const netTotal = proformaJobs.reduce((total, job) => total + job.netPrice, 0);
  const vatTotal = proformaJobs.reduce(
    (total, job) => total + job.netPrice * job.vatRate,
    0,
  );
  const grossTotal = netTotal + vatTotal;
  const proformaNo = selectedMonth
    ? `VEX-PRF-${selectedMonth.replace("-", "")}-${customer.code}`
    : "VEX-PRF-—";
  const latestPriceDate = proformaJobs[0]?.priceDate ?? options.priceDate;

  const departureOption = options.districts.find((item) => item.name === departure)!;
  const arrivalOption = options.districts.find((item) => item.name === arrival)!;

  return (
    <main className="customer-portal">
      <header className="customer-header">
        <div className="customer-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/venturo-logo.png" alt="Venturo Express" />
          <span>Müşteri Portalı</span>
        </div>
        <div className="customer-account">
          <div>
            <strong>{customer.shortName}</strong>
            <span>{user.displayName} · @{user.username}</span>
          </div>
          <form action="/api/auth/logout" method="post">
            <button type="submit">Çıkış yap</button>
          </form>
        </div>
      </header>

      <section className="customer-welcome">
        <div>
          <span>VENTURO EXPRESS · {customer.code}</span>
          <h1>Merhaba {user.displayName.split(" ")[0]}, gönderileriniz burada.</h1>
          <p>Fiyatları önceden görün; işlerinizi ve aylık proformanızı takip edin.</p>
        </div>
        <div className="customer-summary">
          <article><span>Toplam iş</span><strong>{jobs.length}</strong></article>
          <article><span>Proformadaki iş</span><strong>{jobs.filter((job) => job.proformaIncluded).length}</strong></article>
          <article><span>Firma</span><strong>{customer.shortName}</strong></article>
        </div>
      </section>

      <nav className="customer-tabs" aria-label="Müşteri portalı bölümleri">
        {([
          ["quote", "Fiyat Hesapla", "Anlık teklif"],
          ["jobs", "İşlerim", `${jobs.length} kayıt`],
          ["proforma", "Proforma", "Salt okunur"],
        ] as Array<[PortalTab, string, string]>).map(([id, label, eyebrow]) => (
          <button
            key={id}
            type="button"
            className={activeTab === id ? "active" : ""}
            onClick={() => setActiveTab(id)}
          >
            <small>{eyebrow}</small>
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {activeTab === "quote" && (
        <section className="customer-quote-layout">
          <article className="panel customer-quote-form">
            <div className="content-heading">
              <div>
                <span className="section-index">01</span>
                <p>Gönderi bilgileri</p>
                <h2>Rotayı ve hizmeti seçin</h2>
              </div>
              <span className="auto-pill">Otomatik hesaplanır</span>
            </div>
            <div className="customer-route-fields">
              <label>
                <span>Çıkış ilçesi</span>
                <select value={departure} onChange={(event) => setDeparture(event.target.value)}>
                  {options.districts.map((district) => (
                    <option value={district.name} key={district.name}>{district.name} · {district.zoneCode}</option>
                  ))}
                </select>
                <small>{departureOption.zoneCode}</small>
              </label>
              <button
                type="button"
                className="job-swap-button"
                aria-label="Çıkış ve varış ilçelerini değiştir"
                onClick={() => { setDeparture(arrival); setArrival(departure); }}
              >⇄</button>
              <label>
                <span>Varış ilçesi</span>
                <select value={arrival} onChange={(event) => setArrival(event.target.value)}>
                  {options.districts.map((district) => (
                    <option value={district.name} key={district.name}>{district.name} · {district.zoneCode}</option>
                  ))}
                </select>
                <small>{arrivalOption.zoneCode}</small>
              </label>
            </div>
            <fieldset className="job-vehicle-fieldset">
              <legend>Araç tipi</legend>
              <div>
                {options.vehicles.map((item) => (
                  <label key={item} className={vehicle === item ? "active" : ""}>
                    <input
                      type="radio"
                      name="customer-vehicle"
                      checked={vehicle === item}
                      onChange={() => setVehicle(item)}
                    />
                    <b>{item === "Motor Kurye" ? "M" : "A"}</b>
                    <span><strong>{item}</strong><small>{item === "Motor Kurye" ? "Hızlı ve kompakt" : "Hacimli gönderi"}</small></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="customer-service-grid">
              <label>
                <span>Öncelik</span>
                <select value={priority} onChange={(event) => setPriority(event.target.value)}>
                  {options.priorities.map((item) => <option value={item} key={item}>{item}</option>)}
                </select>
              </label>
              <label>
                <span>Gönderi profili</span>
                <select value={packageProfile} onChange={(event) => setPackageProfile(event.target.value)}>
                  {options.packages.map((item) => <option value={item} key={item}>{item}</option>)}
                </select>
              </label>
              <label>
                <span>Gerçek desi <i>isteğe bağlı</i></span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={actualDesi}
                  onChange={(event) => setActualDesi(event.target.value)}
                  placeholder="Boş bırakılabilir"
                />
              </label>
            </div>
          </article>

          <aside className="customer-quote-result" aria-live="polite">
            <div className="customer-result-top"><span>Hesaplanan fiyat</span><b>KDV hariç</b></div>
            <div className="customer-result-route">
              <div><b>{quote?.departureZone ?? departureOption.zoneCode}</b><strong>{departure}</strong></div>
              <i>→</i>
              <div><b>{quote?.arrivalZone ?? arrivalOption.zoneCode}</b><strong>{arrival}</strong></div>
            </div>
            {quoteLoading ? (
              <div className="customer-result-state">Fiyat hesaplanıyor…</div>
            ) : quoteError ? (
              <div className="customer-result-state error">{quoteError}</div>
            ) : quote?.special ? (
              <div className="customer-result-state special"><strong>Özel teklif</strong><span>Bu rota için Venturo ekibiyle iletişime geçin.</span></div>
            ) : quote ? (
              <>
                <div className="customer-result-price"><strong>{formatCurrency(quote.netPrice)}</strong><span>Tek yön · {vehicle}</span></div>
                <dl className="customer-result-breakdown">
                  <div><dt>KDV hariç</dt><dd>{formatCurrency(quote.netPrice)}</dd></div>
                  <div><dt>KDV %20</dt><dd>{formatCurrency(quote.vat)}</dd></div>
                  <div className="total"><dt>KDV dahil</dt><dd>{formatCurrency(quote.gross)}</dd></div>
                </dl>
                <div className="customer-result-metrics">
                  <span>{quote.distanceKm === null ? "Özel mesafe" : `${formatNumber(quote.distanceKm)} km`}</span>
                  <span>{formatNumber(quote.appliedDesi)} desi</span>
                </div>
              </>
            ) : null}
            <p>Bu ekran ön fiyat bilgisidir. Nihai hizmet kaydı Venturo operasyonu tarafından oluşturulur.</p>
          </aside>
        </section>
      )}

      {activeTab === "jobs" && (
        <section className="customer-content-section">
          <div className="customer-section-heading">
            <div><span>İş arşivi</span><h2>Firmanıza ait gönderiler</h2></div>
            <label><span>Hizmet ayı</span><select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} disabled={!monthOptions.length}>{monthOptions.length ? monthOptions.map((month) => <option value={month} key={month}>{formatMonth(month)}</option>) : <option>Henüz kayıt yok</option>}</select></label>
          </div>
          <article className="panel customer-jobs-card">
            <div className="customer-jobs-table-shell">
              <table>
                <thead><tr><th>Tarih</th><th>Sipariş / rota</th><th>Hizmet</th><th>Fiyat</th><th>Durum</th></tr></thead>
                <tbody>
                  {monthJobs.map((job) => (
                    <tr key={job.id}>
                      <td>{formatDate(job.jobDate)}</td>
                      <td><b>{job.departure} → {job.arrival}</b><small>{job.orderNo || `${job.departureZone} → ${job.arrivalZone}`}</small></td>
                      <td><b>{job.vehicle} · {job.priority}</b><small>{job.packageProfile} · {formatNumber(job.appliedDesi)} desi</small></td>
                      <td><b>{formatCurrency(job.netPrice)}</b><small>KDV hariç</small></td>
                      <td><span className={job.proformaIncluded ? "customer-status included" : "customer-status"}>{job.proformaIncluded ? "Proformada" : "Kaydedildi"}</span></td>
                    </tr>
                  ))}
                  {monthJobs.length === 0 && <tr><td colSpan={5}>Bu dönem için iş kaydı bulunmuyor.</td></tr>}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      )}

      {activeTab === "proforma" && (
        <section className="customer-content-section">
          <div className="customer-section-heading">
            <div><span>Salt okunur belge</span><h2>Aylık proforma görünümü</h2></div>
            <div className="customer-proforma-actions">
              <label><span>Hizmet ayı</span><select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} disabled={!monthOptions.length}>{monthOptions.length ? monthOptions.map((month) => <option value={month} key={month}>{formatMonth(month)}</option>) : <option>Henüz kayıt yok</option>}</select></label>
              <button type="button" onClick={() => window.print()} disabled={!proformaJobs.length}>Yazdır / PDF kaydet</button>
            </div>
          </div>
          <article className="proforma-workspace customer-proforma-workspace">
            <section className="proforma-sheet" aria-label="Müşteri proforma önizlemesi">
              <header className="proforma-brand-row">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/venturo-logo.png" alt="Venturo Express" />
                <strong>PROFORMA</strong>
              </header>
              <div className="proforma-meta-grid">
                <b>Müşteri</b><span>{customer.shortName}</span>
                <b>Proforma No</b><span>{proformaNo}</span>
                <b>Düzenleme Tarihi</b><span>{formatDate(todayInIstanbul())}</span>
                <b>Hizmet Dönemi</b><span>{formatMonth(selectedMonth)}</span>
                <b>Para Birimi</b><span>TRY</span>
                <b>KDV</b><span>%20</span>
                <b>Müşteri Bilgisi</b><span>{customer.legalTitle}</span>
                <b>Fiyat Tarihi</b><span>{latestPriceDate}</span>
                <b>Belge Türü</b><span>Proforma · Mali belge değildir</span>
              </div>
              <div className="proforma-table-shell customer-proforma-table">
                <table>
                  <thead><tr><th>S.No</th><th>Tarih</th><th>Hizmet Açıklaması</th><th>Araç / Öncelik / Gönderi</th><th>KDV Hariç</th><th>KDV</th><th>Genel Toplam</th></tr></thead>
                  <tbody>
                    {proformaJobs.map((job, index) => {
                      const vat = job.netPrice * job.vatRate;
                      return <tr key={job.id}><td>{index + 1}</td><td>{formatDate(job.jobDate)}</td><td>{job.departure.toLocaleUpperCase("tr-TR")} - {job.arrival.toLocaleUpperCase("tr-TR")}{job.note ? ` (${job.note})` : ""}</td><td>{job.vehicle}<br />{job.priority} · {job.packageProfile}</td><td>{formatCurrency(job.netPrice)}</td><td>{formatCurrency(vat)}</td><td>{formatCurrency(job.netPrice + vat)}</td></tr>;
                    })}
                    {!proformaJobs.length && <tr><td colSpan={7}>Bu dönem için yayımlanmış proforma kaydı bulunmuyor.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="proforma-total-row"><div><b>KDV HARİÇ TOPLAM</b><span>{formatCurrency(netTotal)}</span></div><div><b>KDV %20</b><span>{formatCurrency(vatTotal)}</span></div><div className="grand-total"><b>GENEL TOPLAM</b><strong>{formatCurrency(grossTotal)}</strong></div></div>
              <p className="proforma-note">Fiyatlar tek yön ve KDV hariçtir; %20 KDV ayrıca uygulanmıştır. Bu belge proformadır, mali belge değildir.</p>
            </section>
          </article>
        </section>
      )}
    </main>
  );
}
