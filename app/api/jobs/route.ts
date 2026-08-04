import { ensureJobsSchema, getSql } from "../../../db";
import { apiAccessError } from "../../lib/auth/session";

function cleanText(value: unknown, maxLength = 500) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function requiredNumber(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label} geçersiz.`);
  }
  return number;
}

function requiredText(value: unknown, label: string, maxLength = 160) {
  const text = cleanText(value, maxLength);
  if (!text) throw new Error(`${label} zorunludur.`);
  return text;
}

function serializeJob(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    jobDate: String(row.job_date),
    monthKey: String(row.month_key),
    firm: String(row.firm),
    customerTitle: String(row.customer_title),
    taxOffice: String(row.tax_office ?? ""),
    taxNumber: String(row.tax_number ?? ""),
    customerAddress: String(row.customer_address ?? ""),
    contactName: String(row.contact_name ?? ""),
    contactPhone: String(row.contact_phone ?? ""),
    orderNo: String(row.order_no ?? ""),
    departure: String(row.departure),
    departureZone: String(row.departure_zone),
    arrival: String(row.arrival),
    arrivalZone: String(row.arrival_zone),
    vehicle: String(row.vehicle),
    priority: String(row.priority),
    packageProfile: String(row.package_profile),
    actualDesi: optionalNumber(row.actual_desi),
    appliedDesi: Number(row.applied_desi),
    distanceKm: optionalNumber(row.distance_km),
    note: String(row.note ?? ""),
    netPrice: Number(row.net_price),
    vatRate: Number(row.vat_rate),
    priceDate: String(row.price_date),
    proformaIncluded: Number(row.proforma_included) === 1,
    proformaAddedAt:
      row.proforma_added_at === null ? null : String(row.proforma_added_at),
  };
}

function errorResponse(error: unknown, status = 400) {
  return Response.json(
    { error: error instanceof Error ? error.message : "İşlem tamamlanamadı." },
    { status },
  );
}

export async function GET() {
  const access = await apiAccessError(["admin"]);
  if (access.response) return access.response;
  try {
    const database = getSql();
    await ensureJobsSchema(database);
    const rows = (await database.unsafe(
      "SELECT * FROM courier_jobs ORDER BY job_date DESC, created_at DESC",
    )) as unknown as Array<Record<string, unknown>>;
    return Response.json({ jobs: rows.map(serializeJob) });
  } catch (error) {
    return errorResponse(error, 500);
  }
}

export async function POST(request: Request) {
  const access = await apiAccessError(["admin"]);
  if (access.response) return access.response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const database = getSql();
    await ensureJobsSchema(database);

    const jobDate = requiredText(body.jobDate, "İş tarihi", 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(jobDate)) {
      throw new Error("İş tarihi geçersiz.");
    }
    const monthKey = jobDate.slice(0, 7);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const vatRate = requiredNumber(body.vatRate ?? 0.2, "KDV oranı");

    const rows = (await database.unsafe(
      `INSERT INTO courier_jobs (
        id, created_at, updated_at, job_date, month_key, firm,
        customer_title, tax_office, tax_number, customer_address,
        contact_name, contact_phone, order_no, departure, departure_zone,
        arrival, arrival_zone, vehicle, priority, package_profile,
        actual_desi, applied_desi, distance_km, note, net_price, vat_rate,
        price_date, proforma_included, proforma_added_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26,
        $27, 0, NULL
      ) RETURNING *`,
      [
        id,
        now,
        now,
        jobDate,
        monthKey,
        requiredText(body.firm, "Firma kısa adı"),
        requiredText(body.customerTitle, "Yasal müşteri unvanı", 240),
        cleanText(body.taxOffice, 120),
        cleanText(body.taxNumber, 40),
        cleanText(body.customerAddress, 500),
        cleanText(body.contactName, 120),
        cleanText(body.contactPhone, 60),
        cleanText(body.orderNo, 80),
        requiredText(body.departure, "Çıkış ilçesi"),
        requiredText(body.departureZone, "Çıkış bölgesi", 8),
        requiredText(body.arrival, "Varış ilçesi"),
        requiredText(body.arrivalZone, "Varış bölgesi", 8),
        requiredText(body.vehicle, "Araç tipi"),
        requiredText(body.priority, "Öncelik"),
        requiredText(body.packageProfile, "Gönderi profili"),
        optionalNumber(body.actualDesi),
        requiredNumber(body.appliedDesi, "Uygulanan desi"),
        optionalNumber(body.distanceKm),
        cleanText(body.note, 500),
        requiredNumber(body.netPrice, "KDV hariç fiyat"),
        vatRate,
        requiredText(body.priceDate, "Fiyat tarihi", 16),
      ],
    )) as unknown as Array<Record<string, unknown>>;

    return Response.json(
      { job: rows[0] ? serializeJob(rows[0]) : null },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const access = await apiAccessError(["admin"]);
  if (access.response) return access.response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const ids = Array.isArray(body.ids)
      ? body.ids.map((id) => cleanText(id, 80)).filter(Boolean)
      : [];
    if (ids.length === 0 || ids.length > 500) {
      throw new Error("Güncellenecek iş seçilmedi.");
    }
    const included = Boolean(body.proformaIncluded);
    const now = new Date().toISOString();
    const database = getSql();
    await ensureJobsSchema(database);
    const result = await database.unsafe(
      `UPDATE courier_jobs
       SET proforma_included = $1, proforma_added_at = $2, updated_at = $3
       WHERE id = ANY($4::text[])`,
      [included ? 1 : 0, included ? now : null, now, ids],
    );
    return Response.json({ updated: result.count });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const access = await apiAccessError(["admin"]);
  if (access.response) return access.response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const ids = Array.isArray(body.ids)
      ? body.ids.map((id) => cleanText(id, 80)).filter(Boolean)
      : [];
    if (ids.length === 0 || ids.length > 100) {
      throw new Error("Silinecek iş seçilmedi.");
    }
    const database = getSql();
    await ensureJobsSchema(database);
    const result = await database.unsafe(
      "DELETE FROM courier_jobs WHERE id = ANY($1::text[])",
      [ids],
    );
    return Response.json({ deleted: result.count });
  } catch (error) {
    return errorResponse(error);
  }
}
