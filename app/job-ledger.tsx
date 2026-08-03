"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { pricingData } from "./pricing-data";

type Vehicle = "Motor Kurye" | "Arabalı Kurye";

type StoredJob = {
  id: string;
  createdAt: string;
  updatedAt: string;
  jobDate: string;
  monthKey: string;
  firm: string;
  customerTitle: string;
  taxOffice: string;
  taxNumber: string;
  customerAddress: string;
  contactName: string;
  contactPhone: string;
  orderNo: string;
  departure: string;
  departureZone: string;
  arrival: string;
  arrivalZone: string;
  vehicle: string;
  priority: string;
  packageProfile: string;
  actualDesi: number | null;
  appliedDesi: number;
  distanceKm: number | null;
  note: string;
  netPrice: number;
  vatRate: number;
  priceDate: string;
  proformaIncluded: boolean;
  proformaAddedAt: string | null;
};

type JobDraft = {
  firm: string;
  customerTitle: string;
  taxOffice: string;
  taxNumber: string;
  customerAddress: string;
  contactName: string;
  contactPhone: string;
  jobDate: string;
  orderNo: string;
  departure: string;
  arrival: string;
  vehicle: Vehicle;
  priority: string;
  packageProfile: string;
  actualDesi: string;
  note: string;
};

function todayInIstanbul() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number, digits = 2) {
  return new Intl.NumberFormat("tr-TR", {
    maximumFractionDigits: digits,
  }).format(value);
}

function formatDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

function formatMonth(value: string) {
  if (!value) return "Hizmet dönemi seçilmedi";
  const date = new Date(`${value}-01T00:00:00Z`);
  const label = new Intl.DateTimeFormat("tr-TR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
  return label.charAt(0).toLocaleUpperCase("tr-TR") + label.slice(1);
}

function calculatePrice(draft: JobDraft) {
  const departure = pricingData.districts.find(
    (district) => district.name === draft.departure,
  )!;
  const arrival = pricingData.districts.find(
    (district) => district.name === draft.arrival,
  )!;
  const fromIndex = pricingData.zoneCodes.indexOf(departure.zoneCode);
  const toIndex = pricingData.zoneCodes.indexOf(arrival.zoneCode);
  const matrix =
    draft.vehicle === "Motor Kurye"
      ? pricingData.motorPriceMatrix
      : pricingData.carPriceMatrix;
  const baseCell = matrix[fromIndex][toIndex];
  const packageRule = pricingData.packages.find(
    (item) => item.name === draft.packageProfile,
  )!;
  const priorityRule = pricingData.priorities.find(
    (item) => item.name === draft.priority,
  )!;
  const parsedDesi = Number.parseFloat(draft.actualDesi.replace(",", "."));
  const actualDesi =
    draft.actualDesi.trim() !== "" && Number.isFinite(parsedDesi) && parsedDesi >= 0
      ? parsedDesi
      : null;
  const appliedDesi = actualDesi ?? packageRule.defaultDesi;
  const desiRule = [...pricingData.desiRules]
    .filter((item) => item.vehicle === draft.vehicle)
    .reverse()
    .find((item) => appliedDesi >= item.minDesi)!;
  const loadFactor = Math.max(packageRule.factor, desiRule.factor);
  const distanceCell = pricingData.distanceMatrix[fromIndex][toIndex];
  const distance = typeof distanceCell === "number" ? distanceCell : null;
  const extraKmRate =
    draft.vehicle === "Motor Kurye"
      ? pricingData.meta.extraKmRate.motor
      : pricingData.meta.extraKmRate.car;
  const extraKm =
    distance === null
      ? 0
      : Math.max(distance - pricingData.meta.includedZoneKm, 0);
  const longDistanceExtraKm =
    distance === null
      ? 0
      : Math.max(distance - pricingData.meta.longDistanceThresholdKm, 0);
  const standardExtraKm = Math.max(extraKm - longDistanceExtraKm, 0);
  const extraKmCharge =
    standardExtraKm * extraKmRate +
    longDistanceExtraKm *
      extraKmRate *
      pricingData.meta.longDistanceExtraKmFactor;
  const special =
    departure.zoneCode === pricingData.meta.specialZoneCode ||
    arrival.zoneCode === pricingData.meta.specialZoneCode ||
    typeof baseCell !== "number";
  const netPrice = special
    ? null
    : Math.ceil(
        ((baseCell + extraKmCharge) * priorityRule.factor * loadFactor) /
          pricingData.meta.roundingStep,
      ) * pricingData.meta.roundingStep;
  const vatRate = 0.2;

  return {
    departure,
    arrival,
    basePrice: typeof baseCell === "number" ? baseCell : null,
    distance,
    actualDesi,
    appliedDesi,
    loadFactor,
    priorityFactor: priorityRule.factor,
    extraKm,
    standardExtraKm,
    longDistanceExtraKm,
    extraKmRate,
    extraKmCharge,
    special,
    netPrice,
    vatRate,
    vat: netPrice === null ? null : netPrice * vatRate,
    gross: netPrice === null ? null : netPrice * (1 + vatRate),
  };
}

export default function JobLedger() {
  const [draft, setDraft] = useState<JobDraft>({
    firm: "",
    customerTitle: "",
    taxOffice: "",
    taxNumber: "",
    customerAddress: "",
    contactName: "",
    contactPhone: "",
    jobDate: todayInIstanbul(),
    orderNo: "",
    departure: "Beşiktaş",
    arrival: "Kadıköy",
    vehicle: "Motor Kurye",
    priority: "Normal",
    packageProfile: "1 A4 Evrak",
    actualDesi: "",
    note: "",
  });
  const [jobs, setJobs] = useState<StoredJob[]>([]);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedFirm, setSelectedFirm] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const calculation = useMemo(() => calculatePrice(draft), [draft]);

  const requestJobs = useCallback(async () => {
    const response = await fetch("/api/jobs", { cache: "no-store" });
    const data = (await response.json()) as {
      jobs?: StoredJob[];
      error?: string;
    };
    if (!response.ok) throw new Error(data.error || "İş listesi alınamadı.");
    return data.jobs ?? [];
  }, []);

  useEffect(() => {
    let active = true;
    void requestJobs()
      .then((nextJobs) => {
        if (active) setJobs(nextJobs);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "İş listesi alınamadı.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [requestJobs]);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setJobs(await requestJobs());
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "İş listesi alınamadı.",
      );
    } finally {
      setLoading(false);
    }
  }, [requestJobs]);

  const monthOptions = useMemo(
    () => [...new Set(jobs.map((job) => job.monthKey))].sort().reverse(),
    [jobs],
  );
  const firmOptions = useMemo(
    () =>
      [...new Set(jobs.map((job) => job.firm))].sort((left, right) =>
        left.localeCompare(right, "tr"),
      ),
    [jobs],
  );

  const activeMonth = monthOptions.includes(selectedMonth)
    ? selectedMonth
    : (monthOptions[0] ?? "");
  const activeFirm = firmOptions.includes(selectedFirm)
    ? selectedFirm
    : (firmOptions[0] ?? "");

  const visibleJobs = useMemo(
    () =>
      jobs.filter(
        (job) => job.monthKey === activeMonth && job.firm === activeFirm,
      ),
    [activeFirm, activeMonth, jobs],
  );
  const proformaJobs = visibleJobs.filter((job) => job.proformaIncluded);
  const pendingJobs = visibleJobs.filter((job) => !job.proformaIncluded);
  const proformaCustomer = proformaJobs[0] ?? visibleJobs[0] ?? null;
  const netTotal = proformaJobs.reduce((sum, job) => sum + job.netPrice, 0);
  const vatTotal = proformaJobs.reduce(
    (sum, job) => sum + job.netPrice * job.vatRate,
    0,
  );
  const grossTotal = netTotal + vatTotal;
  const proformaNo = activeMonth && activeFirm
    ? `VEX-PRF-${activeMonth.replace("-", "")}-${activeFirm
        .toLocaleUpperCase("tr-TR")
        .replace(/[^A-ZÇĞİÖŞÜ0-9]+/g, "-")
        .replace(/^-|-$/g, "")}`
    : "VEX-PRF-—";

  function updateDraft<Key extends keyof JobDraft>(
    key: Key,
    value: JobDraft[Key],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function saveJob() {
    setMessage("");
    setError("");
    if (!draft.firm.trim() || !draft.customerTitle.trim() || !draft.jobDate) {
      setError("Firma kısa adı, yasal müşteri unvanı ve iş tarihi zorunludur.");
      return;
    }
    if (calculation.netPrice === null) {
      setError("Özel teklif gereken rota doğrudan iş listesine kaydedilemez.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...draft,
          firm: draft.firm.trim(),
          customerTitle: draft.customerTitle.trim(),
          departureZone: calculation.departure.zoneCode,
          arrivalZone: calculation.arrival.zoneCode,
          actualDesi: calculation.actualDesi,
          appliedDesi: calculation.appliedDesi,
          distanceKm: calculation.distance,
          netPrice: calculation.netPrice,
          vatRate: calculation.vatRate,
          priceDate: pricingData.meta.updatedAt,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "İş kaydedilemedi.");
      await loadJobs();
      setSelectedMonth(draft.jobDate.slice(0, 7));
      setSelectedFirm(draft.firm.trim());
      setDraft((current) => ({ ...current, orderNo: "", note: "" }));
      setMessage("İş kaydedildi. Firma ve ay listesinde hazır.");
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "İş kaydedilemedi.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateProforma(ids: string[], included: boolean) {
    setMessage("");
    setError("");
    if (ids.length === 0) return;
    try {
      const response = await fetch("/api/jobs", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids, proformaIncluded: included }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Proforma listesi güncellenemedi.");
      await loadJobs();
      setMessage(
        included
          ? `${ids.length} iş proforma listesine eklendi.`
          : "İş proforma listesinden çıkarıldı.",
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Proforma listesi güncellenemedi.",
      );
    }
  }

  return (
    <section className="content-section jobs-section" data-testid="jobs-section">
      <div className="content-heading">
        <div>
          <span className="section-index">02</span>
          <p>Tekli iş ve proforma yönetimi</p>
          <h2>İşi kaydet, firma ve aya göre proformaya hazırla</h2>
        </div>
        <span className="model-badge">Kalıcı kayıt · KDV %20</span>
      </div>

      <div className="single-job-grid">
        <article className="panel single-job-form">
          <div className="job-block-heading">
            <span>01</span>
            <div>
              <p>Firma ve belge bilgileri</p>
              <h3>Proformada görünecek müşteriyi tanımlayın</h3>
            </div>
          </div>

          <div className="job-company-grid">
            <label>
              <span>Firma kısa adı *</span>
              <input
                value={draft.firm}
                onChange={(event) => updateDraft("firm", event.target.value)}
                placeholder="Örn. TERA"
                autoComplete="organization"
              />
            </label>
            <label className="wide-field">
              <span>Yasal müşteri unvanı *</span>
              <input
                value={draft.customerTitle}
                onChange={(event) =>
                  updateDraft("customerTitle", event.target.value)
                }
                placeholder="Faturada yer alacak tam unvan"
              />
            </label>
            <label>
              <span>Vergi dairesi</span>
              <input
                value={draft.taxOffice}
                onChange={(event) => updateDraft("taxOffice", event.target.value)}
                placeholder="İsteğe bağlı"
              />
            </label>
            <label>
              <span>Vergi / TCKN</span>
              <input
                value={draft.taxNumber}
                onChange={(event) => updateDraft("taxNumber", event.target.value)}
                placeholder="İsteğe bağlı"
                inputMode="numeric"
              />
            </label>
            <label>
              <span>Yetkili kişi</span>
              <input
                value={draft.contactName}
                onChange={(event) => updateDraft("contactName", event.target.value)}
                placeholder="İsteğe bağlı"
                autoComplete="name"
              />
            </label>
            <label>
              <span>Telefon</span>
              <input
                value={draft.contactPhone}
                onChange={(event) => updateDraft("contactPhone", event.target.value)}
                placeholder="İsteğe bağlı"
                autoComplete="tel"
              />
            </label>
            <label className="full-field">
              <span>Müşteri adresi</span>
              <textarea
                value={draft.customerAddress}
                onChange={(event) =>
                  updateDraft("customerAddress", event.target.value)
                }
                placeholder="Proforma müşteri bilgisi için isteğe bağlı"
                rows={2}
              />
            </label>
          </div>

          <div className="job-block-heading service-heading">
            <span>02</span>
            <div>
              <p>İş ve gönderi bilgileri</p>
              <h3>Rotayı ve hizmeti seçin</h3>
            </div>
          </div>

          <div className="job-meta-grid">
            <label>
              <span>İş tarihi *</span>
              <input
                type="date"
                value={draft.jobDate}
                onChange={(event) => updateDraft("jobDate", event.target.value)}
              />
            </label>
            <label>
              <span>Sipariş / referans no</span>
              <input
                value={draft.orderNo}
                onChange={(event) => updateDraft("orderNo", event.target.value)}
                placeholder="İsteğe bağlı"
              />
            </label>
          </div>

          <div className="job-route-grid">
            <label>
              <span>Çıkış ilçesi</span>
              <select
                value={draft.departure}
                onChange={(event) => updateDraft("departure", event.target.value)}
              >
                {pricingData.districts.map((district) => (
                  <option value={district.name} key={district.name}>
                    {district.name} · {district.zoneCode}
                  </option>
                ))}
              </select>
              <small>{calculation.departure.zoneCode}</small>
            </label>
            <button
              type="button"
              className="job-swap-button"
              aria-label="Çıkış ve varış ilçelerini değiştir"
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  departure: current.arrival,
                  arrival: current.departure,
                }))
              }
            >
              ⇄
            </button>
            <label>
              <span>Varış ilçesi</span>
              <select
                value={draft.arrival}
                onChange={(event) => updateDraft("arrival", event.target.value)}
              >
                {pricingData.districts.map((district) => (
                  <option value={district.name} key={district.name}>
                    {district.name} · {district.zoneCode}
                  </option>
                ))}
              </select>
              <small>{calculation.arrival.zoneCode}</small>
            </label>
          </div>

          <fieldset className="job-vehicle-fieldset">
            <legend>Araç tipi</legend>
            <div>
              {(["Motor Kurye", "Arabalı Kurye"] as Vehicle[]).map((vehicle) => (
                <label
                  key={vehicle}
                  className={draft.vehicle === vehicle ? "active" : ""}
                >
                  <input
                    type="radio"
                    name="single-job-vehicle"
                    checked={draft.vehicle === vehicle}
                    onChange={() => updateDraft("vehicle", vehicle)}
                  />
                  <b>{vehicle === "Motor Kurye" ? "M" : "A"}</b>
                  <span>
                    <strong>{vehicle}</strong>
                    <small>
                      {vehicle === "Motor Kurye"
                        ? "Hızlı ve kompakt"
                        : "Hacimli gönderi"}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="job-service-grid">
            <label>
              <span>Öncelik</span>
              <select
                value={draft.priority}
                onChange={(event) => updateDraft("priority", event.target.value)}
              >
                {pricingData.priorities.map((priority) => (
                  <option value={priority.name} key={priority.name}>
                    {priority.name} · {formatNumber(priority.factor)}×
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Gönderi profili</span>
              <select
                value={draft.packageProfile}
                onChange={(event) =>
                  updateDraft("packageProfile", event.target.value)
                }
              >
                {pricingData.packages.map((item) => (
                  <option value={item.name} key={item.name}>
                    {item.name} · {formatNumber(item.factor)}×
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Gerçek desi</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={draft.actualDesi}
                onChange={(event) => updateDraft("actualDesi", event.target.value)}
                placeholder={`${formatNumber(calculation.appliedDesi)} varsayılan`}
              />
            </label>
            <label className="full-field">
              <span>İş açıklaması</span>
              <textarea
                value={draft.note}
                onChange={(event) => updateDraft("note", event.target.value)}
                placeholder="Teslimat veya operasyon notu"
                rows={2}
              />
            </label>
          </div>
        </article>

        <aside className="panel single-job-price" aria-live="polite">
          <div className="single-price-topline">
            <span>Otomatik hesaplanan</span>
            <b>KDV hariç</b>
          </div>
          <div className="single-route-summary">
            <div>
              <b>{calculation.departure.zoneCode}</b>
              <span>{draft.departure}</span>
            </div>
            <i>→</i>
            <div>
              <b>{calculation.arrival.zoneCode}</b>
              <span>{draft.arrival}</span>
            </div>
          </div>
          {calculation.netPrice === null ? (
            <div className="single-special-price">
              <strong>Özel teklif</strong>
              <span>Adalar ve özel rota manuel fiyatlanır.</span>
            </div>
          ) : (
            <>
              <div className="single-price-value">
                <strong>{formatCurrency(calculation.netPrice)}</strong>
                <span>Tek yön · {draft.vehicle}</span>
              </div>
              <dl className="single-price-breakdown">
                <div>
                  <dt>Baz tarife</dt>
                  <dd>{formatCurrency(calculation.basePrice ?? 0)}</dd>
                </div>
                <div>
                  <dt>Ek km</dt>
                  <dd>+{formatCurrency(calculation.extraKmCharge)}</dd>
                </div>
                <div>
                  <dt>Öncelik</dt>
                  <dd>{formatNumber(calculation.priorityFactor)}×</dd>
                </div>
                <div>
                  <dt>Paket / desi</dt>
                  <dd>{formatNumber(calculation.loadFactor)}×</dd>
                </div>
                <div>
                  <dt>KDV %20</dt>
                  <dd>{formatCurrency(calculation.vat ?? 0)}</dd>
                </div>
                <div className="gross-row">
                  <dt>KDV dahil</dt>
                  <dd>{formatCurrency(calculation.gross ?? 0)}</dd>
                </div>
              </dl>
            </>
          )}
          <div className="single-price-metrics">
            <span>
              {calculation.distance === null
                ? "Özel mesafe"
                : `${formatNumber(calculation.distance, 1)} km`}
            </span>
            <span>{formatNumber(calculation.appliedDesi)} desi</span>
          </div>
          <button
            type="button"
            className="primary-action save-job-button"
            onClick={() => void saveJob()}
            disabled={saving || calculation.netPrice === null}
          >
            {saving ? "Kaydediliyor…" : "İşi listeye kaydet"}
          </button>
          <small className="persistence-note">
            Kayıt firma ve hizmet ayı altında kalıcı olarak saklanır.
          </small>
        </aside>
      </div>

      {(message || error) && (
        <div className={`job-feedback ${error ? "error" : "success"}`} role="status">
          {error || message}
        </div>
      )}

      <article className="panel jobs-ledger-panel">
        <div className="jobs-ledger-heading">
          <div>
            <span>03 · Kayıtlı işler</span>
            <h3>Firma ve aya göre iş listesi</h3>
          </div>
          <div className="jobs-filters">
            <label>
              <span>Hizmet ayı</span>
              <select
                value={activeMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
                disabled={monthOptions.length === 0}
              >
                {monthOptions.length === 0 && <option>Henüz kayıt yok</option>}
                {monthOptions.map((month) => (
                  <option value={month} key={month}>
                    {formatMonth(month)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Firma</span>
              <select
                value={activeFirm}
                onChange={(event) => setSelectedFirm(event.target.value)}
                disabled={firmOptions.length === 0}
              >
                {firmOptions.length === 0 && <option>Henüz firma yok</option>}
                {firmOptions.map((firm) => (
                  <option value={firm} key={firm}>
                    {firm}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="secondary-action"
              disabled={pendingJobs.length === 0}
              onClick={() =>
                void updateProforma(
                  pendingJobs.map((job) => job.id),
                  true,
                )
              }
            >
              Tümünü proformaya ekle
            </button>
          </div>
        </div>

        <div className="jobs-table-shell">
          <table>
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Firma / Sipariş</th>
                <th>Rota</th>
                <th>Hizmet</th>
                <th>KDV hariç</th>
                <th>Proforma</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6}>Kayıtlı işler yükleniyor…</td>
                </tr>
              )}
              {!loading && visibleJobs.length === 0 && (
                <tr>
                  <td colSpan={6}>Seçili firma ve ay için kayıt bulunamadı.</td>
                </tr>
              )}
              {visibleJobs.map((job) => (
                <tr key={job.id}>
                  <td>{formatDate(job.jobDate)}</td>
                  <td>
                    <b>{job.firm}</b>
                    <small>{job.orderNo || "Referans no yok"}</small>
                  </td>
                  <td>
                    <b>{job.departure} → {job.arrival}</b>
                    <small>{job.departureZone} → {job.arrivalZone}</small>
                  </td>
                  <td>
                    <b>{job.vehicle} · {job.priority}</b>
                    <small>
                      {job.packageProfile} · {formatNumber(job.appliedDesi)} desi
                    </small>
                  </td>
                  <td><b>{formatCurrency(job.netPrice)}</b></td>
                  <td>
                    <button
                      type="button"
                      className={
                        job.proformaIncluded
                          ? "proforma-toggle included"
                          : "proforma-toggle"
                      }
                      onClick={() =>
                        void updateProforma([job.id], !job.proformaIncluded)
                      }
                    >
                      {job.proformaIncluded ? "Proformada" : "Proformaya ekle"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="proforma-workspace">
        <div className="proforma-toolbar">
          <div>
            <span>04 · Proforma listesi</span>
            <h3>{activeFirm || "Firma seçilmedi"} · {formatMonth(activeMonth)}</h3>
          </div>
          <div>
            <span>{proformaJobs.length} iş proformada</span>
            <button
              type="button"
              className="primary-action"
              disabled={proformaJobs.length === 0}
              onClick={() => window.print()}
            >
              Yazdır / PDF kaydet
            </button>
          </div>
        </div>

        <section className="proforma-sheet" aria-label="Proforma önizlemesi">
          <header className="proforma-brand-row">
            {/* The local Vinext worker does not expose Next's image optimizer. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/venturo-logo.png"
              alt="Venturo Express"
            />
            <strong>PROFORMA</strong>
          </header>

          <div className="proforma-meta-grid">
            <b>Müşteri</b>
            <span>{activeFirm || "—"}</span>
            <b>Proforma No</b>
            <span>{proformaNo}</span>
            <b>Düzenleme Tarihi</b>
            <span>{formatDate(todayInIstanbul())}</span>

            <b>Hizmet Dönemi</b>
            <span>{formatMonth(activeMonth)}</span>
            <b>Para Birimi</b>
            <span>TRY</span>
            <b>KDV</b>
            <span>%20</span>

            <b>Müşteri Bilgisi</b>
            <span className="customer-info-cell">
              {proformaCustomer ? (
                <>
                  {proformaCustomer.customerTitle}
                  {proformaCustomer.taxOffice || proformaCustomer.taxNumber
                    ? ` · ${proformaCustomer.taxOffice || "Vergi dairesi yok"} / ${proformaCustomer.taxNumber || "Vergi no yok"}`
                    : ""}
                  {proformaCustomer.customerAddress
                    ? ` · ${proformaCustomer.customerAddress}`
                    : ""}
                </>
              ) : (
                "Proforma listesine iş ekleyin"
              )}
            </span>
            <b>Fiyat Tarihi</b>
            <span>{proformaCustomer?.priceDate ?? pricingData.meta.updatedAt}</span>
            <b>Belge Türü</b>
            <span>Proforma · Mali belge değildir</span>
          </div>

          <div className="proforma-table-shell">
            <table>
              <thead>
                <tr>
                  <th>S.No</th>
                  <th>Tarih</th>
                  <th>Hizmet Açıklaması</th>
                  <th>Araç / Öncelik / Gönderi</th>
                  <th>KDV Hariç</th>
                  <th>KDV</th>
                  <th>Genel Toplam</th>
                  <th className="screen-only">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {proformaJobs.map((job, index) => {
                  const vat = job.netPrice * job.vatRate;
                  return (
                    <tr key={job.id}>
                      <td>{index + 1}</td>
                      <td>{formatDate(job.jobDate)}</td>
                      <td>
                        {job.departure.toLocaleUpperCase("tr-TR")} - {job.arrival.toLocaleUpperCase("tr-TR")}
                        {job.note ? ` (${job.note})` : ""}
                      </td>
                      <td>
                        {job.vehicle}<br />
                        {job.priority} · {job.packageProfile}
                      </td>
                      <td>{formatCurrency(job.netPrice)}</td>
                      <td>{formatCurrency(vat)}</td>
                      <td>{formatCurrency(job.netPrice + vat)}</td>
                      <td className="screen-only">
                        <button
                          type="button"
                          onClick={() => void updateProforma([job.id], false)}
                        >
                          Çıkar
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {proformaJobs.length === 0 && (
                  <tr>
                    <td colSpan={8}>Bu firma ve ay için proforma listesi boş.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="proforma-total-row">
            <div>
              <b>KDV HARİÇ TOPLAM</b>
              <span>{formatCurrency(netTotal)}</span>
            </div>
            <div>
              <b>KDV %20</b>
              <span>{formatCurrency(vatTotal)}</span>
            </div>
            <div className="grand-total">
              <b>GENEL TOPLAM</b>
              <strong>{formatCurrency(grossTotal)}</strong>
            </div>
          </div>
          <p className="proforma-note">
            Fiyatlar tek yön ve KDV hariçtir; %20 KDV ayrıca uygulanmıştır.
            Bu belge proformadır, mali belge değildir.
          </p>
        </section>
      </article>
    </section>
  );
}
