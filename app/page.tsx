"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { readSheet } from "read-excel-file/browser";
import JobLedger from "./job-ledger";
import { pricingData } from "./pricing-data";

type TabId = "calculate" | "jobs" | "bulk" | "regions" | "prices" | "model";
type Vehicle = "Motor Kurye" | "Arabalı Kurye";
type BulkStatus = "priced" | "special" | "invalid";

type BulkJob = {
  rowNumber: number;
  firm: string;
  jobDate: Date | null;
  monthKey: string | null;
  orderNo: string;
  departure: string;
  arrival: string;
  vehicle: string;
  priority: string;
  packageProfile: string;
  actualDesi: number | null;
  note: string;
  departureZone: string;
  arrivalZone: string;
  appliedDesi: number | null;
  distance: number | null;
  extraKm: number;
  standardExtraKm: number;
  longDistanceExtraKm: number;
  extraKmRate: number;
  longDistanceExtraKmRate: number;
  extraKmCharge: number;
  serviceFactor: number;
  longDistanceApplied: boolean;
  price: number | null;
  status: BulkStatus;
  message: string;
};

const tabs: Array<{ id: TabId; label: string; eyebrow: string }> = [
  { id: "calculate", label: "Fiyat Hesapla", eyebrow: "Anlık teklif" },
  { id: "jobs", label: "İşler / Proforma", eyebrow: "Tekli kayıt" },
  { id: "bulk", label: "Toplu Fiyat / Firma", eyebrow: "Excel yükle" },
  { id: "regions", label: "Bölge Haritası", eyebrow: "39 ilçe" },
  { id: "prices", label: "Fiyat Matrisleri", eyebrow: "Motor & araba" },
  { id: "model", label: "Model Detayı", eyebrow: "Kural & kaynak" },
];

const bulkHeaders = [
  "Firma",
  "İş Tarihi",
  "Sipariş No",
  "Çıkış İlçesi",
  "Varış İlçesi",
  "Araç Tipi",
  "Öncelik",
  "Gönderi Profili",
  "Gerçek Desi",
  "Açıklama",
] as const;

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeKey(value: unknown) {
  return normalizeText(value).toLocaleLowerCase("tr-TR");
}

function findNamedOption<T extends { name: string }>(
  value: unknown,
  options: readonly T[],
) {
  const key = normalizeKey(value);
  return options.find((item) => normalizeKey(item.name) === key) ?? null;
}

function findPriorityOption(value: unknown) {
  const key = normalizeKey(value);
  const normalizedValue = key === "express" ? "Ekspres" : value;
  return findNamedOption(normalizedValue, pricingData.priorities);
}

function calculateExtraKmPricing(vehicle: Vehicle, distance: number | null) {
  const extraKmRate =
    vehicle === "Motor Kurye"
      ? pricingData.meta.extraKmRate.motor
      : pricingData.meta.extraKmRate.car;
  const longDistanceExtraKmRate =
    extraKmRate * pricingData.meta.longDistanceExtraKmFactor;
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
    longDistanceExtraKm * longDistanceExtraKmRate;

  return {
    extraKm,
    standardExtraKm,
    longDistanceExtraKm,
    extraKmRate,
    longDistanceExtraKmRate,
    extraKmCharge,
    longDistanceApplied: longDistanceExtraKm > 0,
  };
}

function normalizeVehicle(value: unknown): Vehicle | null {
  const key = normalizeKey(value);
  if (
    key === "motor kurye" ||
    key === "motor" ||
    key === "motorlu kurye"
  ) {
    return "Motor Kurye";
  }
  if (
    key === "arabalı kurye" ||
    key === "araba" ||
    key === "otomobil" ||
    key === "araç"
  ) {
    return "Arabalı Kurye";
  }
  return null;
}

function buildUtcDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function parseJobDate(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return buildUtcDate(
      value.getUTCFullYear(),
      value.getUTCMonth() + 1,
      value.getUTCDate(),
    );
  }
  if (typeof value === "number" && value > 20000 && value < 100000) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return buildUtcDate(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
    );
  }
  const text = normalizeText(value);
  const dayFirst = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dayFirst) {
    return buildUtcDate(
      Number(dayFirst[3]),
      Number(dayFirst[2]),
      Number(dayFirst[1]),
    );
  }
  const yearFirst = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (yearFirst) {
    return buildUtcDate(
      Number(yearFirst[1]),
      Number(yearFirst[2]),
      Number(yearFirst[3]),
    );
  }
  return null;
}

function getMonthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatJobDate(date: Date | null) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatMonth(monthKey: string) {
  if (!monthKey) return "Ay seçilmedi";
  const date = new Date(`${monthKey}-01T00:00:00Z`);
  const label = new Intl.DateTimeFormat("tr-TR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
  return label.charAt(0).toLocaleUpperCase("tr-TR") + label.slice(1);
}

function parseOptionalDesi(value: unknown) {
  if (value === null || value === undefined || normalizeText(value) === "") {
    return { value: null, error: "" };
  }
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseFloat(normalizeText(value).replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { value: null, error: "Gerçek Desi 0 veya üzeri sayı olmalı." };
  }
  return { value: parsed, error: "" };
}

function calculateBulkPrice({
  departureName,
  arrivalName,
  vehicle,
  priorityName,
  packageName,
  actualDesi,
}: {
  departureName: string;
  arrivalName: string;
  vehicle: Vehicle;
  priorityName: string;
  packageName: string;
  actualDesi: number | null;
}) {
  const departure = pricingData.districts.find(
    (district) => district.name === departureName,
  )!;
  const arrival = pricingData.districts.find(
    (district) => district.name === arrivalName,
  )!;
  const fromIndex = pricingData.zoneCodes.indexOf(departure.zoneCode);
  const toIndex = pricingData.zoneCodes.indexOf(arrival.zoneCode);
  const matrix =
    vehicle === "Motor Kurye"
      ? pricingData.motorPriceMatrix
      : pricingData.carPriceMatrix;
  const baseCell = matrix[fromIndex][toIndex];
  const packageRule = pricingData.packages.find(
    (item) => item.name === packageName,
  )!;
  const priorityRule = pricingData.priorities.find(
    (item) => item.name === priorityName,
  )!;
  const appliedDesi = actualDesi ?? packageRule.defaultDesi;
  const desiRule = [...pricingData.desiRules]
    .filter((item) => item.vehicle === vehicle)
    .reverse()
    .find((item) => appliedDesi >= item.minDesi)!;
  const loadFactor = Math.max(packageRule.factor, desiRule.factor);
  const distanceCell = pricingData.distanceMatrix[fromIndex][toIndex];
  const distance = typeof distanceCell === "number" ? distanceCell : null;
  const extraKmPricing = calculateExtraKmPricing(
    vehicle,
    distance,
  );
  const serviceFactor = priorityRule.factor;
  const special =
    departure.zoneCode === pricingData.meta.specialZoneCode ||
    arrival.zoneCode === pricingData.meta.specialZoneCode;
  const price =
    typeof baseCell !== "number" || special
      ? null
      : Math.ceil(
          ((baseCell + extraKmPricing.extraKmCharge) *
            serviceFactor *
            loadFactor) /
            pricingData.meta.roundingStep,
        ) * pricingData.meta.roundingStep;
  return {
    departureZone: departure.zoneCode,
    arrivalZone: arrival.zoneCode,
    appliedDesi,
    distance,
    ...extraKmPricing,
    serviceFactor,
    price,
    special,
  };
}

function parseBulkRows(rows: readonly (readonly unknown[])[]) {
  const headerRowIndex = rows.findIndex((row) => {
    const keys = row.map(normalizeKey);
    return (
      keys.includes(normalizeKey("Firma")) &&
      keys.includes(normalizeKey("İş Tarihi")) &&
      keys.includes(normalizeKey("Çıkış İlçesi")) &&
      keys.includes(normalizeKey("Varış İlçesi"))
    );
  });
  if (headerRowIndex < 0) {
    throw new Error(
      "“İş Listesi” sayfasında başlık satırı bulunamadı. Venturo şablonunu kullanın.",
    );
  }

  const headerRow = rows[headerRowIndex].map(normalizeKey);
  const columnIndexes = new Map(
    bulkHeaders.map((header) => [header, headerRow.indexOf(normalizeKey(header))]),
  );
  const missingHeaders = bulkHeaders.filter(
    (header) => (columnIndexes.get(header) ?? -1) < 0,
  );
  if (missingHeaders.length > 0) {
    throw new Error(`Eksik başlık: ${missingHeaders.join(", ")}.`);
  }

  const parsedRows: BulkJob[] = [];
  rows.slice(headerRowIndex + 1).forEach((row, relativeIndex) => {
    if (row.every((value) => normalizeText(value) === "")) return;
    const cell = (header: (typeof bulkHeaders)[number]) =>
      row[columnIndexes.get(header)!];
    const firm = normalizeText(cell("Firma"));
    const jobDate = parseJobDate(cell("İş Tarihi"));
    const departureRule = findNamedOption(
      cell("Çıkış İlçesi"),
      pricingData.districts,
    );
    const arrivalRule = findNamedOption(
      cell("Varış İlçesi"),
      pricingData.districts,
    );
    const vehicleRule = normalizeVehicle(cell("Araç Tipi"));
    const priorityRule = findPriorityOption(cell("Öncelik"));
    const packageRule = findNamedOption(
      cell("Gönderi Profili"),
      pricingData.packages,
    );
    const desi = parseOptionalDesi(cell("Gerçek Desi"));
    const errors: string[] = [];
    if (!firm) errors.push("Firma boş.");
    if (!jobDate) errors.push("İş Tarihi geçersiz.");
    if (!departureRule) errors.push("Çıkış İlçesi tanınmadı.");
    if (!arrivalRule) errors.push("Varış İlçesi tanınmadı.");
    if (!vehicleRule) errors.push("Araç Tipi tanınmadı.");
    if (!priorityRule) errors.push("Öncelik tanınmadı.");
    if (!packageRule) errors.push("Gönderi Profili tanınmadı.");
    if (desi.error) errors.push(desi.error);

    const base: BulkJob = {
      rowNumber: headerRowIndex + relativeIndex + 2,
      firm,
      jobDate,
      monthKey: jobDate ? getMonthKey(jobDate) : null,
      orderNo: normalizeText(cell("Sipariş No")),
      departure: departureRule?.name ?? normalizeText(cell("Çıkış İlçesi")),
      arrival: arrivalRule?.name ?? normalizeText(cell("Varış İlçesi")),
      vehicle: vehicleRule ?? normalizeText(cell("Araç Tipi")),
      priority: priorityRule?.name ?? normalizeText(cell("Öncelik")),
      packageProfile:
        packageRule?.name ?? normalizeText(cell("Gönderi Profili")),
      actualDesi: desi.value,
      note: normalizeText(cell("Açıklama")),
      departureZone: "",
      arrivalZone: "",
      appliedDesi: null,
      distance: null,
      extraKm: 0,
      standardExtraKm: 0,
      longDistanceExtraKm: 0,
      extraKmRate: 0,
      longDistanceExtraKmRate: 0,
      extraKmCharge: 0,
      serviceFactor: 0,
      longDistanceApplied: false,
      price: null,
      status: "invalid",
      message: errors.join(" "),
    };

    if (errors.length > 0) {
      parsedRows.push(base);
      return;
    }

    const priceResult = calculateBulkPrice({
      departureName: departureRule!.name,
      arrivalName: arrivalRule!.name,
      vehicle: vehicleRule!,
      priorityName: priorityRule!.name,
      packageName: packageRule!.name,
      actualDesi: desi.value,
    });
    parsedRows.push({
      ...base,
      departureZone: priceResult.departureZone,
      arrivalZone: priceResult.arrivalZone,
      appliedDesi: priceResult.appliedDesi,
      distance: priceResult.distance,
      extraKm: priceResult.extraKm,
      standardExtraKm: priceResult.standardExtraKm,
      longDistanceExtraKm: priceResult.longDistanceExtraKm,
      extraKmRate: priceResult.extraKmRate,
      longDistanceExtraKmRate: priceResult.longDistanceExtraKmRate,
      extraKmCharge: priceResult.extraKmCharge,
      serviceFactor: priceResult.serviceFactor,
      longDistanceApplied: priceResult.longDistanceApplied,
      price: priceResult.price,
      status: priceResult.special ? "special" : "priced",
      message: priceResult.special
        ? "Adalar için deniz aktarımı dahil özel teklif gerekir."
        : "Fiyatlandı",
    });
  });

  return parsedRows;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCurrencyDetailed(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("tr-TR", {
    maximumFractionDigits,
  }).format(value);
}

function priceHeat(value: number | string) {
  if (typeof value !== "number") return "special";
  if (value < 700) return "low";
  if (value < 1200) return "mid";
  if (value < 2000) return "high";
  return "peak";
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("calculate");
  const [departureName, setDepartureName] = useState("Beşiktaş");
  const [arrivalName, setArrivalName] = useState("Kadıköy");
  const [vehicle, setVehicle] = useState<Vehicle>("Motor Kurye");
  const [priorityName, setPriorityName] = useState("Normal");
  const [packageName, setPackageName] = useState("1 A4 Evrak");
  const [actualDesi, setActualDesi] = useState("");
  const [regionSide, setRegionSide] = useState("Tümü");
  const [matrixVehicle, setMatrixVehicle] =
    useState<Vehicle>("Motor Kurye");
  const [bulkRows, setBulkRows] = useState<BulkJob[]>([]);
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [bulkMonth, setBulkMonth] = useState("");
  const [bulkFirm, setBulkFirm] = useState("Tüm firmalar");
  const [bulkReading, setBulkReading] = useState(false);

  const calculation = useMemo(() => {
    const departure = pricingData.districts.find(
      (district) => district.name === departureName,
    )!;
    const arrival = pricingData.districts.find(
      (district) => district.name === arrivalName,
    )!;
    const departureZone = pricingData.zones.find(
      (zone) => zone.code === departure.zoneCode,
    )!;
    const arrivalZone = pricingData.zones.find(
      (zone) => zone.code === arrival.zoneCode,
    )!;
    const fromIndex = pricingData.zoneCodes.indexOf(departure.zoneCode);
    const toIndex = pricingData.zoneCodes.indexOf(arrival.zoneCode);
    const priceMatrix =
      vehicle === "Motor Kurye"
        ? pricingData.motorPriceMatrix
        : pricingData.carPriceMatrix;
    const baseCell = priceMatrix[fromIndex][toIndex];
    const basePrice = typeof baseCell === "number" ? baseCell : null;
    const packageRule = pricingData.packages.find(
      (item) => item.name === packageName,
    )!;
    const priorityRule = pricingData.priorities.find(
      (item) => item.name === priorityName,
    )!;
    const parsedDesi = Number.parseFloat(actualDesi.replace(",", "."));
    const appliedDesi =
      actualDesi.trim() !== "" && Number.isFinite(parsedDesi) && parsedDesi >= 0
        ? parsedDesi
        : packageRule.defaultDesi;
    const vehicleDesiRules = pricingData.desiRules.filter(
      (item) => item.vehicle === vehicle,
    );
    const desiRule = [...vehicleDesiRules]
      .reverse()
      .find((item) => appliedDesi >= item.minDesi)!;
    const loadFactor = Math.max(packageRule.factor, desiRule.factor);
    const distanceCell = pricingData.distanceMatrix[fromIndex][toIndex];
    const durationCell = pricingData.durationMatrix[fromIndex][toIndex];
    const distance =
      typeof distanceCell === "number" ? distanceCell : null;
    const duration =
      typeof durationCell === "number" ? durationCell : null;
    const extraKmPricing = calculateExtraKmPricing(
      vehicle,
      distance,
    );
    const serviceFactor = priorityRule.factor;
    const totalFactor = serviceFactor * loadFactor;
    const priceBeforeFactors =
      basePrice === null ? null : basePrice + extraKmPricing.extraKmCharge;
    const finalPrice =
      priceBeforeFactors === null
        ? null
        : Math.ceil(
            (priceBeforeFactors * totalFactor) /
              pricingData.meta.roundingStep,
          ) * pricingData.meta.roundingStep;
    const special =
      departure.zoneCode === pricingData.meta.specialZoneCode ||
      arrival.zoneCode === pricingData.meta.specialZoneCode;
    const crossSide = departure.side !== arrival.side && !special;
    const vehicleParameter = (name: string) => {
      const row = pricingData.parameters.find((item) => item.name === name);
      return Number(
        vehicle === "Motor Kurye" ? row?.motor ?? 0 : row?.car ?? 0,
      );
    };
    const bridgeToll = crossSide
      ? vehicleParameter("FSM / 15 Temmuz geçişi")
      : 0;
    const operatingCostBeforeBridge =
      distance === null || duration === null
        ? null
        : vehicleParameter("Baz operasyon gideri") +
          distance * vehicleParameter("Toplam araç değişken maliyeti") +
          ((duration * vehicleParameter("Trafik süre çarpanı") +
            vehicleParameter("Teslim alma + bırakma") +
            (crossSide
              ? vehicleParameter("Kıtalararası ek tampon")
              : 0)) *
            vehicleParameter("Sürücü tam maliyeti")) /
            60;
    const ownTotalCost =
      operatingCostBeforeBridge === null
        ? null
        : operatingCostBeforeBridge + bridgeToll;
    const ownGrossProfit =
      finalPrice === null || ownTotalCost === null
        ? null
        : finalPrice - ownTotalCost;
    const ownIncomeTax =
      ownGrossProfit === null ? null : Math.max(ownGrossProfit, 0) * 0.2;
    const ownNetProfit =
      ownGrossProfit === null || ownIncomeTax === null
        ? null
        : ownGrossProfit - ownIncomeTax;
    const courierShare = finalPrice === null ? null : finalPrice * 0.6;
    const venturoGrossShare = finalPrice === null ? null : finalPrice * 0.4;
    const outsourcedIncomeTax =
      venturoGrossShare === null ? null : venturoGrossShare * 0.2;
    const outsourcedNetProfit =
      venturoGrossShare === null || outsourcedIncomeTax === null
        ? null
        : venturoGrossShare - outsourcedIncomeTax;
    const recommendCar =
      vehicle === "Motor Kurye" &&
      (packageName === "Büyük Paket" ||
        packageName === "Çok Büyük Paket" ||
        appliedDesi > 5);

    return {
      departure,
      arrival,
      departureZone,
      arrivalZone,
      basePrice,
      packageRule,
      priorityRule,
      appliedDesi,
      desiRule,
      loadFactor,
      totalFactor,
      ...extraKmPricing,
      serviceFactor,
      priceBeforeFactors,
      finalPrice,
      distance,
      duration,
      recommendCar,
      special,
      crossSide,
      profitability: {
        taxRate: 0.2,
        bridgeToll,
        operatingCostBeforeBridge,
        ownTotalCost,
        ownGrossProfit,
        ownIncomeTax,
        ownNetProfit,
        courierShare,
        venturoGrossShare,
        outsourcedIncomeTax,
        outsourcedNetProfit,
      },
    };
  }, [
    departureName,
    arrivalName,
    vehicle,
    priorityName,
    packageName,
    actualDesi,
  ]);

  const filteredZones = pricingData.zones.filter(
    (zone) => regionSide === "Tümü" || zone.side === regionSide,
  );
  const visibleMatrix =
    matrixVehicle === "Motor Kurye"
      ? pricingData.motorPriceMatrix
      : pricingData.carPriceMatrix;
  const bulkMonthOptions = useMemo(
    () =>
      [...new Set(bulkRows.flatMap((row) => (row.monthKey ? [row.monthKey] : [])))]
        .sort()
        .reverse(),
    [bulkRows],
  );
  const bulkFirmOptions = useMemo(
    () =>
      [...new Set(bulkRows.flatMap((row) => (row.firm ? [row.firm] : [])))].sort(
        (left, right) => left.localeCompare(right, "tr"),
      ),
    [bulkRows],
  );
  const filteredBulkRows = useMemo(
    () =>
      bulkRows.filter(
        (row) =>
          row.monthKey === bulkMonth &&
          (bulkFirm === "Tüm firmalar" || row.firm === bulkFirm),
      ),
    [bulkRows, bulkMonth, bulkFirm],
  );
  const pricedBulkRows = filteredBulkRows.filter(
    (row) => row.status === "priced" && row.price !== null,
  );
  const bulkInvoiceTotal = pricedBulkRows.reduce(
    (total, row) => total + row.price!,
    0,
  );
  const bulkInvalidCount = bulkRows.filter(
    (row) => row.status === "invalid",
  ).length;
  const bulkSpecialCount = filteredBulkRows.filter(
    (row) => row.status === "special",
  ).length;
  const bulkFirmSummary = useMemo(() => {
    const summaries = new Map<
      string,
      { firm: string; jobs: number; total: number; special: number; invalid: number }
    >();
    filteredBulkRows.forEach((row) => {
      const key = row.firm || "Firma belirtilmemiş";
      const current = summaries.get(key) ?? {
        firm: key,
        jobs: 0,
        total: 0,
        special: 0,
        invalid: 0,
      };
      if (row.status === "priced" && row.price !== null) {
        current.jobs += 1;
        current.total += row.price;
      } else if (row.status === "special") {
        current.special += 1;
      } else {
        current.invalid += 1;
      }
      summaries.set(key, current);
    });
    return [...summaries.values()].sort(
      (left, right) => right.total - left.total,
    );
  }, [filteredBulkRows]);

  function swapDistricts() {
    setDepartureName(arrivalName);
    setArrivalName(departureName);
  }

  async function handleBulkUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBulkReading(true);
    setBulkError("");
    try {
      const rows = await readSheet(file, "İş Listesi", {
        dateFormat: "dd.mm.yyyy",
      });
      const parsedRows = parseBulkRows(rows);
      if (parsedRows.length === 0) {
        throw new Error(
          "“İş Listesi” sayfasında fiyatlandırılacak kayıt bulunamadı.",
        );
      }
      const months = [
        ...new Set(
          parsedRows.flatMap((row) => (row.monthKey ? [row.monthKey] : [])),
        ),
      ]
        .sort()
        .reverse();
      const currentMonth = new Date()
        .toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" })
        .slice(0, 7);
      setBulkRows(parsedRows);
      setBulkFileName(file.name);
      setBulkFirm("Tüm firmalar");
      setBulkMonth(
        months.includes(currentMonth) ? currentMonth : (months[0] ?? ""),
      );
    } catch (error) {
      setBulkRows([]);
      setBulkFileName(file.name);
      setBulkMonth("");
      setBulkError(
        error instanceof Error
          ? error.message
          : "Excel dosyası okunamadı. Lütfen Venturo şablonunu kullanın.",
      );
    } finally {
      setBulkReading(false);
      event.target.value = "";
    }
  }

  function downloadBulkResults() {
    const csvHeaders = [
      "Satır",
      "Firma",
      "İş Tarihi",
      "Sipariş No",
      "Çıkış İlçesi",
      "Varış İlçesi",
      "Çıkış Bölgesi",
      "Varış Bölgesi",
      "Araç Tipi",
      "Öncelik",
      "Gönderi Profili",
      "Uygulanan Desi",
      "Toplam Ek Km",
      "10-20 Km Ek Mesafe",
      "20 Km Üzeri Ek Mesafe",
      "Normal Ek Km Birim Bedeli",
      "20 Km Üzeri Ek Km Birim Bedeli",
      "Ek Km Tutarı",
      "Öncelik Katsayısı",
      "KDV Hariç Fiyat",
      "Durum",
      "Not",
    ];
    const csvRows = filteredBulkRows.map((row) => [
      row.rowNumber,
      row.firm,
      formatJobDate(row.jobDate),
      row.orderNo,
      row.departure,
      row.arrival,
      row.departureZone,
      row.arrivalZone,
      row.vehicle,
      row.priority,
      row.packageProfile,
      row.appliedDesi ?? "",
      row.extraKm.toFixed(1).replace(".", ","),
      row.standardExtraKm.toFixed(1).replace(".", ","),
      row.longDistanceExtraKm.toFixed(1).replace(".", ","),
      row.extraKmRate.toFixed(2).replace(".", ","),
      row.longDistanceExtraKmRate.toFixed(2).replace(".", ","),
      row.extraKmCharge.toFixed(2).replace(".", ","),
      row.serviceFactor.toFixed(2).replace(".", ","),
      row.price === null ? "" : row.price.toFixed(2).replace(".", ","),
      row.status === "priced"
        ? "Fiyatlandı"
        : row.status === "special"
          ? "Özel teklif"
          : "Hatalı",
      row.message,
    ]);
    const escapeCell = (value: unknown) =>
      `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [csvHeaders, ...csvRows]
      .map((row) => row.map(escapeCell).join(";"))
      .join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const firmSlug =
      bulkFirm === "Tüm firmalar"
        ? "tum-firmalar"
        : normalizeKey(bulkFirm).replaceAll(" ", "-");
    link.href = url;
    link.download = `venturo-fiyatlanan-isler-${bulkMonth || "ay-yok"}-${firmSlug}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main>
      <header className="site-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            V
          </span>
          <div>
            <strong>VENTURO EXPRESS</strong>
            <span>İstanbul Kurye Tarifesi</span>
          </div>
        </div>
        <div className="header-meta">
          <span className="live-dot" aria-hidden="true" />
          <span>27 Temmuz 2026 modeli</span>
          <span className="header-divider" />
          <span>KDV hariç</span>
        </div>
      </header>

      <section className="hero-shell">
        <div className="hero-copy">
          <span className="hero-kicker">39 ilçe · 17 fiyat bölgesi</span>
          <h1>Kurye fiyatını rota ve gönderiye göre anında hesapla.</h1>
          <p>
            İstanbul’un gerçek ilçe grupları, iki araç tipi ve piyasanın %10
            üzerinde konumlanan taban tarifeler tek modelde.
          </p>
        </div>
        <div className="hero-stats" aria-label="Tarife özeti">
          <div>
            <span>Motor başlangıç</span>
            <strong>₺330</strong>
          </div>
          <div>
            <span>Arabalı başlangıç</span>
            <strong>₺550</strong>
          </div>
          <div>
            <span>Standart geçiş</span>
            <strong>FSM / 15 Temmuz</strong>
          </div>
        </div>
      </section>

      <nav className="tab-nav" aria-label="Uygulama bölümleri">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            data-testid={`tab-${tab.id}`}
            className={activeTab === tab.id ? "active" : ""}
            onClick={() => setActiveTab(tab.id)}
          >
            <small>{tab.eyebrow}</small>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {activeTab === "calculate" && (
        <section className="calculator-layout">
          <div className="panel form-panel">
            <div className="section-heading">
              <div>
                <span className="section-index">01</span>
                <p>Gönderi bilgileri</p>
                <h2>Rotayı ve hizmeti seçin</h2>
              </div>
              <span className="auto-pill">Otomatik hesaplanır</span>
            </div>

            <div className="route-fields">
              <label>
                <span>Çıkış ilçesi</span>
                <select
                  data-testid="departure-select"
                  value={departureName}
                  onChange={(event) => setDepartureName(event.target.value)}
                >
                  {pricingData.districts.map((district) => (
                    <option key={district.name} value={district.name}>
                      {district.name} · {district.zoneCode}
                    </option>
                  ))}
                </select>
                <small>
                  {calculation.departureZone.code} ·{" "}
                  {calculation.departureZone.name}
                </small>
              </label>

              <button
                className="swap-button"
                type="button"
                aria-label="Çıkış ve varış ilçelerini değiştir"
                onClick={swapDistricts}
              >
                ⇄
              </button>

              <label>
                <span>Varış ilçesi</span>
                <select
                  data-testid="arrival-select"
                  value={arrivalName}
                  onChange={(event) => setArrivalName(event.target.value)}
                >
                  {pricingData.districts.map((district) => (
                    <option key={district.name} value={district.name}>
                      {district.name} · {district.zoneCode}
                    </option>
                  ))}
                </select>
                <small>
                  {calculation.arrivalZone.code} ·{" "}
                  {calculation.arrivalZone.name}
                </small>
              </label>
            </div>

            <fieldset className="field-group">
              <legend>Araç tipi</legend>
              <div className="choice-grid vehicle-grid">
                {(["Motor Kurye", "Arabalı Kurye"] as Vehicle[]).map(
                  (item) => (
                    <label
                      key={item}
                      className={vehicle === item ? "choice active" : "choice"}
                    >
                      <input
                        type="radio"
                        name="vehicle"
                        value={item}
                        checked={vehicle === item}
                        onChange={() => setVehicle(item)}
                      />
                      <span className="choice-icon" aria-hidden="true">
                        {item === "Motor Kurye" ? "M" : "A"}
                      </span>
                      <span>
                        <strong>{item}</strong>
                        <small>
                          {item === "Motor Kurye"
                            ? "Hızlı ve kompakt"
                            : "Hacimli gönderi"}
                        </small>
                      </span>
                    </label>
                  ),
                )}
              </div>
            </fieldset>

            <div className="two-column-fields">
              <label>
                <span>Öncelik</span>
                <select
                  data-testid="priority-select"
                  value={priorityName}
                  onChange={(event) => setPriorityName(event.target.value)}
                >
                  {pricingData.priorities.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name} · {formatNumber(item.factor)}×
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Gönderi profili</span>
                <select
                  data-testid="package-select"
                  value={packageName}
                  onChange={(event) => setPackageName(event.target.value)}
                >
                  {pricingData.packages.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name} · {formatNumber(item.factor)}×
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="desi-field">
              <span>
                Gerçek desi <em>isteğe bağlı</em>
              </span>
              <div>
                <input
                  data-testid="desi-input"
                  type="number"
                  min="0"
                  step="0.1"
                  inputMode="decimal"
                  placeholder={`${formatNumber(calculation.packageRule.defaultDesi)} desi varsayılan`}
                  value={actualDesi}
                  onChange={(event) => setActualDesi(event.target.value)}
                />
                <b>desi</b>
              </div>
              <small>
                Boş bırakırsanız {calculation.packageRule.name} için{" "}
                {formatNumber(calculation.packageRule.defaultDesi)} desi
                kullanılır.
              </small>
            </label>
          </div>

          <aside className="panel result-panel" aria-live="polite">
            <div className="result-topline">
              <span>Hesaplanan fiyat</span>
              <span className="vat-chip">KDV hariç</span>
            </div>

            <div className="route-visual">
              <div>
                <b style={{ background: calculation.departureZone.color }}>
                  {calculation.departureZone.code}
                </b>
                <span>{departureName}</span>
                <small>{calculation.departure.side}</small>
              </div>
              <div className="route-line">
                <i />
                <span>{calculation.crossSide ? "Kıtalararası" : "Aynı yaka"}</span>
              </div>
              <div>
                <b style={{ background: calculation.arrivalZone.color }}>
                  {calculation.arrivalZone.code}
                </b>
                <span>{arrivalName}</span>
                <small>{calculation.arrival.side}</small>
              </div>
            </div>

            <div className="price-display" data-testid="final-price">
              {calculation.finalPrice === null ? (
                <>
                  <strong>Özel teklif</strong>
                  <span>Deniz aktarımı ayrıca planlanır</span>
                </>
              ) : (
                <>
                  <strong>{formatCurrency(calculation.finalPrice)}</strong>
                  <span>Tek yön · {vehicle}</span>
                </>
              )}
            </div>

            {calculation.special && (
              <div className="notice warning">
                <b>Adalar özel fiyatlanır.</b>
                <span>
                  Vapur saati, deniz aktarımı ve ada içi teslim maliyeti
                  karayolu tarifesinden ayrıdır.
                </span>
              </div>
            )}
            {calculation.recommendCar && !calculation.special && (
              <div className="notice warning">
                <b>Arabalı kurye kontrolü önerilir.</b>
                <span>
                  Seçilen hacim motorlu kurye için operasyonel sınırı
                  zorlayabilir.
                </span>
              </div>
            )}

            <div className="breakdown">
              <div>
                <span>Baz bölge tarifesi</span>
                <b>
                  {calculation.basePrice === null
                    ? "—"
                    : formatCurrency(calculation.basePrice)}
                </b>
              </div>
              <div className="extra-km-row">
                <span>
                  Ek km bedeli
                  <small>
                    {formatNumber(calculation.standardExtraKm, 1)} km ×{" "}
                    {formatCurrencyDetailed(calculation.extraKmRate)}
                    {calculation.longDistanceExtraKm > 0
                      ? ` + ${formatNumber(calculation.longDistanceExtraKm, 1)} km × ${formatCurrencyDetailed(calculation.longDistanceExtraKmRate)}`
                      : ""}
                  </small>
                </span>
                <b data-testid="extra-km-charge">
                  +{formatCurrencyDetailed(calculation.extraKmCharge)}
                </b>
              </div>
              <div className="service-factor-row">
                <span>
                  Öncelik
                  <small>{calculation.priorityRule.name}</small>
                </span>
                <b>{formatNumber(calculation.serviceFactor)}×</b>
              </div>
              <div>
                <span>Paket / desi</span>
                <b>{formatNumber(calculation.loadFactor)}×</b>
              </div>
              <div className="breakdown-total">
                <span>Toplam katsayı</span>
                <b>{formatNumber(calculation.totalFactor, 3)}×</b>
              </div>
            </div>

            <div className="route-metrics">
              <div>
                <span>Model mesafesi</span>
                <b>
                  {calculation.distance === null
                    ? "Özel"
                    : `${formatNumber(calculation.distance, 1)} km`}
                </b>
              </div>
              <div>
                <span>Tipik yol süresi</span>
                <b>
                  {calculation.duration === null
                    ? "Özel"
                    : `${calculation.duration} dk`}
                </b>
              </div>
              <div>
                <span>Uygulanan desi</span>
                <b>{formatNumber(calculation.appliedDesi)} desi</b>
              </div>
            </div>

            <section
              className="profit-section"
              data-testid="profit-analysis"
              aria-label="Venturo net kâr analizi"
            >
              <div className="profit-heading">
                <div>
                  <span>Venturo net kârı</span>
                  <small>Gelir vergisi sonrası</small>
                </div>
                <b>%20 vergi</b>
              </div>

              <div className="profit-net-grid">
                <article className="profit-net-card own">
                  <span>İşi biz yaparsak</span>
                  <strong data-testid="own-net-profit">
                    {calculation.profitability.ownNetProfit === null
                      ? "—"
                      : formatCurrencyDetailed(
                          calculation.profitability.ownNetProfit,
                        )}
                  </strong>
                  <small>Vergi sonrası net</small>
                </article>
                <article className="profit-net-card outsourced">
                  <span>Taşerona verirsek</span>
                  <strong data-testid="outsourced-net-profit">
                    {calculation.profitability.outsourcedNetProfit === null
                      ? "—"
                      : formatCurrencyDetailed(
                          calculation.profitability.outsourcedNetProfit,
                        )}
                  </strong>
                  <small>%40 payın vergi sonrası</small>
                </article>
              </div>

              {!calculation.special && (
                <>
                  <div className="bridge-cost-row">
                    <span>
                      {calculation.crossSide
                        ? "FSM / 15 Temmuz geçişi"
                        : "Köprü geçişi"}
                    </span>
                    <b data-testid="bridge-toll">
                      {formatCurrencyDetailed(
                        calculation.profitability.bridgeToll,
                      )}
                    </b>
                    <small>
                      Biz yaparsak maliyete eklenir; taşeronda kurye payına
                      dahildir.
                    </small>
                  </div>

                  <div className="profit-detail-grid">
                    <article>
                      <h3>Venturo operasyonu</h3>
                      <dl>
                        <div>
                          <dt>Satış fiyatı</dt>
                          <dd>{formatCurrencyDetailed(calculation.finalPrice!)}</dd>
                        </div>
                        <div>
                          <dt>Araç + sürücü + operasyon</dt>
                          <dd>
                            −{" "}
                            {formatCurrencyDetailed(
                              calculation.profitability
                                .operatingCostBeforeBridge!,
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Köprü</dt>
                          <dd>
                            −{" "}
                            {formatCurrencyDetailed(
                              calculation.profitability.bridgeToll,
                            )}
                          </dd>
                        </div>
                        <div className="subtotal">
                          <dt>Vergi öncesi kâr</dt>
                          <dd>
                            {formatCurrencyDetailed(
                              calculation.profitability.ownGrossProfit!,
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Gelir vergisi · %20</dt>
                          <dd>
                            −{" "}
                            {formatCurrencyDetailed(
                              calculation.profitability.ownIncomeTax!,
                            )}
                          </dd>
                        </div>
                      </dl>
                    </article>

                    <article>
                      <h3>Taşeron operasyonu</h3>
                      <dl>
                        <div>
                          <dt>Kurye hakedişi · %60</dt>
                          <dd>
                            −{" "}
                            {formatCurrencyDetailed(
                              calculation.profitability.courierShare!,
                            )}
                          </dd>
                        </div>
                        <div className="subtotal">
                          <dt>Venturo payı · %40</dt>
                          <dd>
                            {formatCurrencyDetailed(
                              calculation.profitability.venturoGrossShare!,
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Gelir vergisi · %20</dt>
                          <dd>
                            −{" "}
                            {formatCurrencyDetailed(
                              calculation.profitability
                                .outsourcedIncomeTax!,
                            )}
                          </dd>
                        </div>
                      </dl>
                    </article>
                  </div>
                </>
              )}

              <p className="profit-formula">
                Taşeron neti = satış fiyatı × %40 Venturo payı × %80 vergi
                sonrası. Köprü, kuryenin %60 hakedişi içinde kabul edilmiştir.
              </p>
            </section>

            <p className="formula-note">
              (Baz tarife + 10–20 km normal ek mesafe bedeli + yalnızca 20 km
              üzerindeki bölümün 2× ek km bedeli) × öncelik × yüksek olan
              paket/desi katsayısı. Acil 1,35×; Express 1,6×; Gece ve VIP 2×.
              Sonuç üst 10 TL’ye yuvarlanır.
            </p>
          </aside>
        </section>
      )}

      {activeTab === "jobs" && <JobLedger />}

      {activeTab === "bulk" && (
        <section
          className="content-section bulk-section"
          data-testid="bulk-pricing-section"
        >
          <div className="content-heading">
            <div>
              <span className="section-index">02</span>
              <p>Excel ile toplu fiyatlandırma</p>
              <h2>Firma ve ay bazında kesilecek hizmet tutarı</h2>
            </div>
            <span className="model-badge">Tamamı yerel tarayıcıda</span>
          </div>

          <div className="bulk-onboarding-grid">
            <article className="panel bulk-upload-card">
              <div className="bulk-card-heading">
                <span>01</span>
                <div>
                  <p>Önce şablonu alın</p>
                  <h3>Doldurun, sonra buraya yükleyin</h3>
                </div>
              </div>
              <p className="bulk-card-copy">
                Başlıkları değiştirmeden “İş Listesi” sayfasını doldurun.
                Birden çok firma ve ayı tek dosyada yükleyebilirsiniz.
              </p>
              <div className="bulk-actions">
                <a
                  className="secondary-action"
                  href="/venturo-toplu-is-fiyatlandirma-sablonu.xlsx"
                  download
                >
                  Excel şablonunu indir
                </a>
                <label className="primary-action">
                  <input
                    data-testid="bulk-file-input"
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={handleBulkUpload}
                    disabled={bulkReading}
                  />
                  {bulkReading ? "Dosya okunuyor…" : "Doldurulmuş Excel’i yükle"}
                </label>
              </div>
              <small className="local-note">
                Dosya sunucuya gönderilmez; tarayıcı belleğinde işlenir. Yalnızca
                .xlsx kabul edilir.
              </small>
            </article>

            <article className="panel bulk-schema-card">
              <div className="bulk-card-heading">
                <span>02</span>
                <div>
                  <p>Şablonda neler var?</p>
                  <h3>7 zorunlu, 3 isteğe bağlı alan</h3>
                </div>
              </div>
              <div className="bulk-field-groups">
                <div>
                  <b>Zorunlu</b>
                  <p>
                    Firma · İş Tarihi · Çıkış İlçesi · Varış İlçesi · Araç Tipi
                    · Öncelik · Gönderi Profili
                  </p>
                </div>
                <div>
                  <b>İsteğe bağlı</b>
                  <p>Sipariş No · Gerçek Desi · Açıklama</p>
                </div>
                <div>
                  <b>Hesap sonucu</b>
                  <p>
                    Firma toplamı · Aylık KDV hariç hizmet tutarı · Satır
                    fiyatları · Hata ve özel teklif kontrolü
                  </p>
                </div>
              </div>
            </article>
          </div>

          {bulkError && (
            <div className="bulk-alert error" role="alert">
              <b>Dosya işlenemedi</b>
              <span>{bulkError}</span>
            </div>
          )}

          {bulkRows.length > 0 && (
            <>
              <div className="panel bulk-file-status" aria-live="polite">
                <div>
                  <span className="file-mark" aria-hidden="true">XL</span>
                  <p>
                    <strong>{bulkFileName}</strong>
                    <small>{bulkRows.length} iş satırı okundu</small>
                  </p>
                </div>
                <div className="file-checks">
                  <span className="ok">
                    {bulkRows.filter((row) => row.status === "priced").length}{" "}
                    fiyatlandı
                  </span>
                  <span>
                    {bulkRows.filter((row) => row.status === "special").length}{" "}
                    özel teklif
                  </span>
                  <span className={bulkInvalidCount > 0 ? "error" : ""}>
                    {bulkInvalidCount} hatalı
                  </span>
                </div>
              </div>

              <div className="panel bulk-toolbar">
                <label>
                  <span>Fatura ayı</span>
                  <select
                    data-testid="bulk-month-select"
                    value={bulkMonth}
                    onChange={(event) => setBulkMonth(event.target.value)}
                  >
                    {bulkMonthOptions.map((month) => (
                      <option value={month} key={month}>
                        {formatMonth(month)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Firma</span>
                  <select
                    data-testid="bulk-firm-select"
                    value={bulkFirm}
                    onChange={(event) => setBulkFirm(event.target.value)}
                  >
                    <option value="Tüm firmalar">Tüm firmalar</option>
                    {bulkFirmOptions.map((firm) => (
                      <option value={firm} key={firm}>
                        {firm}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="secondary-action export-action"
                  onClick={downloadBulkResults}
                  disabled={filteredBulkRows.length === 0}
                >
                  Fiyatlanan listeyi CSV indir
                </button>
              </div>

              <div className="bulk-summary-grid">
                <article className="bulk-total-card">
                  <span>{formatMonth(bulkMonth)}</span>
                  <small>
                    {bulkFirm === "Tüm firmalar" ? "Tüm firmalar" : bulkFirm}
                  </small>
                  <strong data-testid="bulk-invoice-total">
                    {formatCurrencyDetailed(bulkInvoiceTotal)}
                  </strong>
                  <p>KDV hariç kesilecek hizmet tutarı</p>
                </article>
                <article className="bulk-metric-card">
                  <span>Fiyatlanan iş</span>
                  <strong>{pricedBulkRows.length}</strong>
                  <small>Faturaya dahil satır</small>
                </article>
                <article className="bulk-metric-card">
                  <span>Firma</span>
                  <strong>{bulkFirmSummary.length}</strong>
                  <small>Seçili filtrede</small>
                </article>
                <article className="bulk-metric-card warning">
                  <span>Kontrol bekleyen</span>
                  <strong>
                    {bulkSpecialCount +
                      filteredBulkRows.filter(
                        (row) => row.status === "invalid",
                      ).length}
                  </strong>
                  <small>Özel teklif veya hatalı</small>
                </article>
              </div>

              <div className="bulk-report-grid">
                <article className="panel bulk-report-card">
                  <div className="table-title">
                    <div>
                      <span>Firma özeti</span>
                      <small>Seçili ayın KDV hariç hizmet toplamları</small>
                    </div>
                  </div>
                  <div className="table-shell compact-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Firma</th>
                          <th>İş</th>
                          <th>Özel</th>
                          <th>Hatalı</th>
                          <th>Toplam</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkFirmSummary.map((summary) => (
                          <tr key={summary.firm}>
                            <td><b>{summary.firm}</b></td>
                            <td>{summary.jobs}</td>
                            <td>{summary.special}</td>
                            <td>{summary.invalid}</td>
                            <td><b>{formatCurrencyDetailed(summary.total)}</b></td>
                          </tr>
                        ))}
                        {bulkFirmSummary.length === 0 && (
                          <tr>
                            <td colSpan={5}>Seçili ay ve firma için kayıt yok.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </article>

                <article className="panel bulk-report-card bulk-detail-card">
                  <div className="table-title">
                    <div>
                      <span>İş detayı</span>
                      <small>
                        10–20 km normal ek bedel, 20 km üzerindeki bölüm 2×;
                        ardından öncelik × paket/desi uygulanır
                      </small>
                    </div>
                  </div>
                  <div className="table-shell bulk-detail-shell">
                    <table>
                      <thead>
                        <tr>
                          <th>Tarih</th>
                          <th>Firma / Sipariş</th>
                          <th>Rota</th>
                          <th>Hizmet</th>
                          <th>Fiyat / Durum</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredBulkRows.slice(0, 250).map((row) => (
                          <tr key={`${row.rowNumber}-${row.orderNo}`}>
                            <td>
                              {formatJobDate(row.jobDate)}
                              <small>Satır {row.rowNumber}</small>
                            </td>
                            <td>
                              <b>{row.firm || "—"}</b>
                              <small>{row.orderNo || "Sipariş no yok"}</small>
                            </td>
                            <td>
                              <b>{row.departure || "—"} → {row.arrival || "—"}</b>
                              <small>
                                {row.departureZone && row.arrivalZone
                                  ? `${row.departureZone} → ${row.arrivalZone}`
                                  : "Bölge belirlenemedi"}
                              </small>
                            </td>
                            <td>
                              <b>{row.vehicle || "—"} · {row.priority || "—"}</b>
                              <small>
                                {row.packageProfile || "—"}
                                {row.appliedDesi !== null
                                  ? ` · ${formatNumber(row.appliedDesi)} desi`
                                  : ""}
                                {row.extraKm > 0
                                  ? ` · +${formatNumber(row.standardExtraKm, 1)} km × ${formatCurrencyDetailed(row.extraKmRate)}${row.longDistanceExtraKm > 0 ? ` + ${formatNumber(row.longDistanceExtraKm, 1)} km × ${formatCurrencyDetailed(row.longDistanceExtraKmRate)}` : ""}`
                                  : ""}
                                {row.serviceFactor > 0
                                  ? ` · öncelik ${formatNumber(row.serviceFactor)}×`
                                  : ""}
                              </small>
                            </td>
                            <td>
                              {row.status === "priced" ? (
                                <>
                                  <b className="row-price">
                                    {formatCurrencyDetailed(row.price!)}
                                  </b>
                                  <small className="status-ok">Fiyatlandı</small>
                                </>
                              ) : (
                                <>
                                  <b
                                    className={
                                      row.status === "special"
                                        ? "status-special"
                                        : "status-error"
                                    }
                                  >
                                    {row.status === "special"
                                      ? "Özel teklif"
                                      : "Hatalı satır"}
                                  </b>
                                  <small>{row.message}</small>
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                        {filteredBulkRows.length === 0 && (
                          <tr>
                            <td colSpan={5}>Seçili filtrede iş bulunamadı.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {filteredBulkRows.length > 250 && (
                    <p className="table-limit-note">
                      Ekranda ilk 250 satır gösteriliyor; CSV dışa aktarımı tüm
                      satırları içerir.
                    </p>
                  )}
                </article>
              </div>

              <div className="invoice-note">
                <b>Fatura notu</b>
                <span>
                  Bu toplam hizmet bedelidir ve KDV hariçtir. KDV dahil fatura
                  toplamı, muhasebede uygulanacak güncel KDV oranına göre ayrıca
                  oluşturulmalıdır.
                </span>
              </div>
            </>
          )}
        </section>
      )}

      {activeTab === "regions" && (
        <section className="content-section">
          <div className="content-heading">
            <div>
              <span className="section-index">03</span>
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
                <b style={{ background: calculation.departureZone.color }}>
                  {calculation.departureZone.code}
                </b>
                <p>
                  <strong>{departureName}</strong>
                  <small>{calculation.departureZone.name}</small>
                </p>
                <i>→</i>
                <b style={{ background: calculation.arrivalZone.color }}>
                  {calculation.arrivalZone.code}
                </b>
                <p>
                  <strong>{arrivalName}</strong>
                  <small>{calculation.arrivalZone.name}</small>
                </p>
              </div>
              <button type="button" onClick={() => setActiveTab("calculate")}>
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
                  <div>
                    <dt>Merkez</dt>
                    <dd>{zone.hub}</dd>
                  </div>
                  <div>
                    <dt>İç rota</dt>
                    <dd>
                      {zone.internalKm === null
                        ? "Özel"
                        : `${zone.internalKm} km · ${zone.internalMin} dk`}
                    </dd>
                  </div>
                </dl>
                <small className="zone-note">{zone.note}</small>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === "prices" && (
        <section className="content-section">
          <div className="content-heading matrix-heading">
            <div>
              <span className="section-index">04</span>
              <p>17 × 17 bölge tarifesi</p>
              <h2>Motor ve arabalı kurye fiyat matrisleri</h2>
            </div>
            <div
              className="segmented-control"
              aria-label="Fiyat matrisi araç tipi"
            >
              {(["Motor Kurye", "Arabalı Kurye"] as Vehicle[]).map((item) => (
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
            <span
              style={{ background: calculation.departureZone.color }}
            >
              {calculation.departure.zoneCode}
            </span>
            <b>{departureName}</b>
            <i>satırından</i>
            <span style={{ background: calculation.arrivalZone.color }}>
              {calculation.arrival.zoneCode}
            </span>
            <b>{arrivalName}</b>
            <i>sütununa bakılır.</i>
          </div>

          <div className="table-shell matrix-shell">
            <table className="price-matrix">
              <thead>
                <tr>
                  <th>Çıkış ↓ / Varış →</th>
                  {pricingData.zoneCodes.map((code) => (
                    <th
                      key={code}
                      className={
                        calculation.arrival.zoneCode === code
                          ? "selected-axis"
                          : ""
                      }
                    >
                      {code}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleMatrix.map((row, rowIndex) => (
                  <tr key={pricingData.zoneCodes[rowIndex]}>
                    <th
                      className={
                        calculation.departure.zoneCode ===
                        pricingData.zoneCodes[rowIndex]
                          ? "selected-axis"
                          : ""
                      }
                    >
                      {pricingData.zoneCodes[rowIndex]}
                    </th>
                    {row.map((cell, columnIndex) => {
                      const selected =
                        calculation.departure.zoneCode ===
                          pricingData.zoneCodes[rowIndex] &&
                        calculation.arrival.zoneCode ===
                          pricingData.zoneCodes[columnIndex];
                      return (
                        <td
                          key={pricingData.zoneCodes[columnIndex]}
                          className={`${priceHeat(cell)} ${selected ? "selected-cell" : ""}`}
                        >
                          {typeof cell === "number"
                            ? formatNumber(cell, 0)
                            : "Özel"}
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
        <section className="content-section model-section">
          <div className="content-heading">
            <div>
              <span className="section-index">05</span>
              <p>Şeffaf fiyat modeli</p>
              <h2>Katsayılar, maliyet girdileri ve kaynaklar</h2>
            </div>
            <span className="model-badge">Excel modeliyle birebir</span>
          </div>

          <div className="rule-grid">
            <article className="rule-card priority-card">
              <div className="rule-title">
                <span>Öncelik</span>
                <small>Motor ve arabada aynı katsayı</small>
              </div>
              {pricingData.priorities.map((item) => (
                <div className="rule-row" key={item.name}>
                  <span>
                    <b>{item.name}</b>
                    <small>{item.description}</small>
                  </span>
                  <strong>{formatNumber(item.factor)}×</strong>
                </div>
              ))}
              <div className="rule-row distance-trigger">
                <span>
                  <b>{pricingData.meta.longDistanceThresholdKm} km üzeri ek km</b>
                  <small>Yalnızca eşiği aşan kilometre bölümüne uygulanır</small>
                </span>
                <strong>
                  {formatNumber(pricingData.meta.longDistanceExtraKmFactor)}× km
                </strong>
              </div>
            </article>

            <article className="rule-card package-card">
              <div className="rule-title">
                <span>Gönderi profili</span>
                <small>Paket veya desinin yükseği</small>
              </div>
              {pricingData.packages.map((item) => (
                <div className="rule-row" key={item.name}>
                  <span>
                    <b>{item.name}</b>
                    <small>
                      {formatNumber(item.defaultDesi)} desi · {item.description}
                    </small>
                  </span>
                  <strong>{formatNumber(item.factor)}×</strong>
                </div>
              ))}
            </article>
          </div>

          <div className="model-panels">
            <article className="panel data-panel">
              <div className="table-title">
                <div>
                  <span>Desi kuralları</span>
                  <small>Araç tipine göre hacim katsayısı</small>
                </div>
              </div>
              <div className="table-shell compact-table">
                <table>
                  <thead>
                    <tr>
                      <th>Araç</th>
                      <th>Asgari desi</th>
                      <th>Katsayı</th>
                      <th>Not</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pricingData.desiRules.map((item) => (
                      <tr key={`${item.vehicle}-${item.minDesi}`}>
                        <td>{item.vehicle}</td>
                        <td>{formatNumber(item.minDesi)}</td>
                        <td><b>{formatNumber(item.factor)}×</b></td>
                        <td>{item.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="panel data-panel">
              <div className="table-title">
                <div>
                  <span>Maliyet parametreleri</span>
                  <small>Motor ve kompakt dizel otomobil varsayımı</small>
                </div>
              </div>
              <div className="table-shell compact-table parameter-table">
                <table>
                  <thead>
                    <tr>
                      <th>Parametre</th>
                      <th>Motor</th>
                      <th>Arabalı</th>
                      <th>Birim</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pricingData.parameters.map((item) => (
                      <tr key={item.name} title={item.note}>
                        <td>{item.name}</td>
                        <td>{formatNumber(item.motor, 5)}</td>
                        <td>{formatNumber(item.car, 5)}</td>
                        <td>{item.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </div>

          <article className="sources-panel">
            <div className="sources-intro">
              <span>Kaynaklar ve model sınırları</span>
              <p>
                Geçiş ücretleri, yakıt girdileri, piyasa referansları ve rota
                verisinin dayanakları Excel’deki kaynak tablosundan aktarılmıştır.
              </p>
            </div>
            <div className="source-list">
              {pricingData.sources.map((source, index) => (
                <div className="source-item" key={source.name}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <b>{source.name}</b>
                    <small>{source.date}</small>
                    <p>{source.data}</p>
                  </div>
                  {source.url.startsWith("http") ? (
                    <a href={source.url} target="_blank" rel="noreferrer">
                      Kaynak ↗
                    </a>
                  ) : (
                    <em>Yerel dosya</em>
                  )}
                </div>
              ))}
            </div>
            <div className="limitations">
              {pricingData.limitations.map((item, index) => (
                <p key={item}>
                  <span>{index + 1}</span>
                  {item}
                </p>
              ))}
            </div>
          </article>
        </section>
      )}

      <footer>
        <div className="brand-lockup footer-brand">
          <span className="brand-mark" aria-hidden="true">V</span>
          <div>
            <strong>VENTURO EXPRESS</strong>
            <span>İstanbul kurye fiyat modeli</span>
          </div>
        </div>
        <p>
          Öneri satış tarifesidir · KDV hariç · Tek yön · Son güncelleme{" "}
          {pricingData.meta.updatedAt}
        </p>
      </footer>
    </main>
  );
}
