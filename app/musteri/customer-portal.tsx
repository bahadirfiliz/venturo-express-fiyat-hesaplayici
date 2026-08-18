"use client";

import { useEffect, useMemo, useState } from "react";
import type { CustomerJob } from "../lib/customer/jobs";
import type { CustomerVehicle } from "../lib/customer/pricing";

type PortalTab = "quote" | "jobs" | "proforma" | "regions" | "prices" | "model";
type PricingMatrixCell = number | string;
type CustomerZone = {
  code: string;
  name: string;
  side: string;
  hub: string;
  districts: string[];
  internalKm: number | null;
  internalMin: number | null;
  note: string;
  color: string;
};
type PricingOptions = {
  districts: Array<{ name: string; zoneCode: string }>;
  vehicles: CustomerVehicle[];
  priorities: string[];
  packages: string[];
  vatRate: number;
  priceDate: string;
  reference: {
    meta: {
      districtCount: number;
      zoneCount: number;
      currency: string;
      oneWay: boolean;
      includedZoneKm: number;
      extraKmRate: { motor: number; car: number };
      longDistanceThresholdKm: number;
      longDistanceExtraKmFactor: number;
      roundingStep: number;
      specialZoneCode: string;
      standardCrossing: string;
    };
    zoneCodes: string[];
    zones: CustomerZone[];
    motorPriceMatrix: PricingMatrixCell[][];
    carPriceMatrix: PricingMatrixCell[][];
    priorityRules: Array<{ name: string; factor: number; description: string }>;
    packageRules: Array<{
      name: string;
      factor: number;
      defaultDesi: number;
      description: string;
    }>;
    desiRules: Array<{
      vehicle: string;
      minDesi: number;
      factor: number;
      note: string;
    }>;
    sources: Array<{
      name: string;
      date: string;
      data: string;
      url: string;
      note: string;
    }>;
    notices: string[];
  };
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

function priceHeat(value: PricingMatrixCell) {
  if (typeof value !== "number") return "special";
  if (value < 700) return "low";
  if (value < 1200) return "mid";
  if (value < 2000) return "high";
  return "peak";
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
  const [regionSide, setRegionSide] = useState("Tümü");
  const [matrixVehicle, setMatrixVehicle] =
    useState<CustomerVehicle>("Motor Kurye");
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
  const departureZone = options.reference.zones.find(
    (item) => item.code === departureOption.zoneCode,
  )!;
  const arrivalZone = options.reference.zones.find(
    (item) => item.code === arrivalOption.zoneCode,
  )!;
  const filteredZones = options.reference.zones.filter(
    (zone) => regionSide === "Tümü" || zone.side === regionSide,
  );
  const visibleMatrix =
    matrixVehicle === "Motor Kurye"
      ? options.reference.motorPriceMatrix
      : options.reference.carPriceMatrix;

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
          ["regions", "Bölge Haritası", `${options.reference.meta.districtCount} ilçe`],
          ["prices", "Fiyat Matrisleri", "Motor & araba"],
          ["model", "Model Detayı", "Kural & kaynak"],
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

      {activeTab === "regions" && (
        <section className="content-section customer-reference-section">
          <div className="content-heading">
            <div>
              <span className="section-index">04</span>
              <p>Kurye operasyon haritası</p>
              <h2>Yakın ilçeler, ortak fiyat bölgeleri</h2>
            </div>
            <div className="segmented-control" aria-label="Yaka filtresi">
              {["Tümü", "Avrupa", "Anadolu", "Ada"].map((side) => (
                <button
                  type="button"
                  key={side}
                  className={regionSide === side ? "active" : ""}
                  onClick={() => setRegionSide(side)}
                >
                  {side}
                </button>
              ))}
            </div>
          </div>

          <div className="map-layout">
            <figure className="map-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/istanbul-bolge-haritasi.png"
                alt="İstanbul ilçelerinin 17 kurye fiyat bölgesine ayrıldığı renkli harita"
              />
              <figcaption>
                Aynı renkteki ilçeler aynı fiyat bölgesindedir. Adalar deniz
                aktarımı nedeniyle B17 özel bölgesidir.
              </figcaption>
            </figure>
            <div className="region-summary">
              <span>Seçili rota</span>
              <div>
                <b style={{ background: departureZone.color }}>{departureZone.code}</b>
                <p><strong>{departure}</strong><small>{departureZone.name}</small></p>
                <i>→</i>
                <b style={{ background: arrivalZone.color }}>{arrivalZone.code}</b>
                <p><strong>{arrival}</strong><small>{arrivalZone.name}</small></p>
              </div>
              <button type="button" onClick={() => setActiveTab("quote")}>
                Rotayı düzenle
              </button>
            </div>
          </div>

          <div className="zone-grid">
            {filteredZones.map((zone) => (
              <article className="zone-card" key={zone.code}>
                <div className="zone-card-top">
                  <span style={{ background: zone.color }}>{zone.code}</span>
                  <small>{zone.side}</small>
                </div>
                <h3>{zone.name}</h3>
                <p>{zone.districts.join(", ")}</p>
                <dl>
                  <div><dt>Merkez</dt><dd>{zone.hub}</dd></div>
                  <div>
                    <dt>İç rota</dt>
                    <dd>{zone.internalKm === null ? "Özel" : `${zone.internalKm} km · ${zone.internalMin} dk`}</dd>
                  </div>
                </dl>
                <small className="zone-note">{zone.note}</small>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === "prices" && (
        <section className="content-section customer-reference-section">
          <div className="content-heading matrix-heading">
            <div>
              <span className="section-index">05</span>
              <p>{options.reference.meta.zoneCount} × {options.reference.meta.zoneCount} bölge tarifesi</p>
              <h2>Motor ve arabalı kurye fiyat matrisleri</h2>
            </div>
            <div className="segmented-control" aria-label="Fiyat matrisi araç tipi">
              {options.vehicles.map((item) => (
                <button
                  type="button"
                  key={item}
                  className={matrixVehicle === item ? "active" : ""}
                  onClick={() => setMatrixVehicle(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="matrix-route-note">
            <span style={{ background: departureZone.color }}>{departureZone.code}</span>
            <b>{departure}</b><i>satırından</i>
            <span style={{ background: arrivalZone.color }}>{arrivalZone.code}</span>
            <b>{arrival}</b><i>sütununa bakılır.</i>
          </div>

          <div className="table-shell matrix-shell">
            <table className="price-matrix">
              <thead>
                <tr>
                  <th>Çıkış ↓ / Varış →</th>
                  {options.reference.zoneCodes.map((code) => (
                    <th key={code} className={arrivalZone.code === code ? "selected-axis" : ""}>{code}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleMatrix.map((row, rowIndex) => (
                  <tr key={options.reference.zoneCodes[rowIndex]}>
                    <th className={departureZone.code === options.reference.zoneCodes[rowIndex] ? "selected-axis" : ""}>
                      {options.reference.zoneCodes[rowIndex]}
                    </th>
                    {row.map((cell, columnIndex) => {
                      const selected =
                        departureZone.code === options.reference.zoneCodes[rowIndex] &&
                        arrivalZone.code === options.reference.zoneCodes[columnIndex];
                      return (
                        <td
                          key={options.reference.zoneCodes[columnIndex]}
                          className={`${priceHeat(cell)} ${selected ? "selected-cell" : ""}`}
                        >
                          {typeof cell === "number" ? formatNumber(cell, 0) : "Özel"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="matrix-legend">
            <span><i className="low" /> Alt bant</span>
            <span><i className="mid" /> Orta bant</span>
            <span><i className="high" /> Üst bant</span>
            <span><i className="peak" /> Uzak rota</span>
            <span>Fiyatlar TL, KDV hariç ve tek yöndür.</span>
          </div>
        </section>
      )}

      {activeTab === "model" && (
        <section className="content-section customer-reference-section model-section">
          <div className="content-heading">
            <div>
              <span className="section-index">06</span>
              <p>Şeffaf satış tarifesi</p>
              <h2>Fiyatlandırma kuralları ve model detayları</h2>
            </div>
            <span className="model-badge">Salt okunur · {options.priceDate}</span>
          </div>

          <div className="rule-grid">
            <article className="rule-card priority-card">
              <div className="rule-title"><span>Öncelik</span><small>Motor ve arabada aynı katsayı</small></div>
              {options.reference.priorityRules.map((item) => (
                <div className="rule-row" key={item.name}>
                  <span><b>{item.name}</b><small>{item.description}</small></span>
                  <strong>{formatNumber(item.factor)}×</strong>
                </div>
              ))}
              <div className="rule-row distance-trigger">
                <span>
                  <b>{options.reference.meta.longDistanceThresholdKm} km üzeri ek km</b>
                  <small>Yalnızca eşiği aşan kilometre bölümüne uygulanır</small>
                </span>
                <strong>{formatNumber(options.reference.meta.longDistanceExtraKmFactor)}× km</strong>
              </div>
            </article>

            <article className="rule-card package-card">
              <div className="rule-title"><span>Gönderi profili</span><small>Paket veya desinin yüksek olanı</small></div>
              {options.reference.packageRules.map((item) => (
                <div className="rule-row" key={item.name}>
                  <span><b>{item.name}</b><small>{formatNumber(item.defaultDesi)} desi · {item.description}</small></span>
                  <strong>{formatNumber(item.factor)}×</strong>
                </div>
              ))}
            </article>
          </div>

          <div className="customer-model-summary">
            <article>
              <span>Standart mesafe</span>
              <strong>{options.reference.meta.includedZoneKm} km dahil</strong>
              <small>Motor +{options.reference.meta.extraKmRate.motor} TL/km · Araba +{options.reference.meta.extraKmRate.car} TL/km</small>
            </article>
            <article>
              <span>Uzun mesafe</span>
              <strong>{options.reference.meta.longDistanceThresholdKm} km sonrası</strong>
              <small>Yalnızca aşan ek kilometre bedeli {options.reference.meta.longDistanceExtraKmFactor}× uygulanır.</small>
            </article>
            <article>
              <span>Yuvarlama</span>
              <strong>Üst {options.reference.meta.roundingStep} TL</strong>
              <small>Tarife sonucu bir sonraki {options.reference.meta.roundingStep} TL adımına yuvarlanır.</small>
            </article>
            <article>
              <span>Standart geçiş</span>
              <strong>{options.reference.meta.standardCrossing}</strong>
              <small>Adalar ({options.reference.meta.specialZoneCode}) özel teklif kapsamındadır.</small>
            </article>
          </div>

          <article className="customer-model-formula">
            <span>Fiyat formülü</span>
            <p>
              (Baz bölge tarifesi + 10–20 km normal ek mesafe bedeli + yalnızca
              20 km üzerindeki bölüm için 2× ek kilometre bedeli) × öncelik ×
              yüksek olan paket/desi katsayısı
            </p>
          </article>

          <article className="panel data-panel">
            <div className="table-title"><div><span>Desi kuralları</span><small>Araç tipine göre hacim katsayısı</small></div></div>
            <div className="table-shell compact-table">
              <table>
                <thead><tr><th>Araç</th><th>Asgari desi</th><th>Katsayı</th><th>Not</th></tr></thead>
                <tbody>
                  {options.reference.desiRules.map((item) => (
                    <tr key={`${item.vehicle}-${item.minDesi}`}>
                      <td>{item.vehicle}</td><td>{formatNumber(item.minDesi)}</td><td><b>{formatNumber(item.factor)}×</b></td><td>{item.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="sources-panel customer-sources-panel">
            <div className="sources-intro">
              <span>Kaynak ve kapsam</span>
              <p>Bölge, rota ve standart geçiş varsayımlarında kullanılan kamuya açık kaynaklar ile müşteri fiyat ekranının sınırları.</p>
            </div>
            <div className="source-list">
              {options.reference.sources.map((source, index) => (
                <div className="source-item" key={source.name}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div><b>{source.name}</b><small>{source.date}</small><p>{source.data}</p></div>
                  <a href={source.url} target="_blank" rel="noreferrer">Kaynak ↗</a>
                </div>
              ))}
            </div>
            <div className="limitations customer-limitations">
              {options.reference.notices.map((item, index) => (
                <p key={item}><span>{index + 1}</span>{item}</p>
              ))}
            </div>
          </article>
        </section>
      )}
    </main>
  );
}
