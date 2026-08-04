import "server-only";

import { ensureApplicationSchema, getSql } from "../../../db";

export type CustomerJob = {
  id: string;
  jobDate: string;
  monthKey: string;
  orderNo: string;
  departure: string;
  departureZone: string;
  arrival: string;
  arrivalZone: string;
  vehicle: string;
  priority: string;
  packageProfile: string;
  appliedDesi: number;
  distanceKm: number | null;
  note: string;
  netPrice: number;
  vatRate: number;
  priceDate: string;
  proformaIncluded: boolean;
};

export async function getCustomerJobs(customerId: string) {
  const database = getSql();
  await ensureApplicationSchema(database);
  const rows = (await database.unsafe(
    `SELECT
       j.id, j.job_date, j.month_key, j.order_no,
       j.departure, j.departure_zone, j.arrival, j.arrival_zone,
       j.vehicle, j.priority, j.package_profile, j.applied_desi,
       j.distance_km, j.note, j.net_price, j.vat_rate,
       j.price_date, j.proforma_included
     FROM courier_jobs j
     INNER JOIN customer_accounts c ON c.job_firm = j.firm
     WHERE c.id = $1 AND c.active = 1
     ORDER BY j.job_date DESC, j.created_at DESC`,
    [customerId],
  )) as unknown as Array<Record<string, unknown>>;

  return rows.map((row): CustomerJob => ({
    id: String(row.id),
    jobDate: String(row.job_date),
    monthKey: String(row.month_key),
    orderNo: String(row.order_no ?? ""),
    departure: String(row.departure),
    departureZone: String(row.departure_zone),
    arrival: String(row.arrival),
    arrivalZone: String(row.arrival_zone),
    vehicle: String(row.vehicle),
    priority: String(row.priority),
    packageProfile: String(row.package_profile),
    appliedDesi: Number(row.applied_desi),
    distanceKm:
      row.distance_km === null || row.distance_km === undefined
        ? null
        : Number(row.distance_km),
    note: String(row.note ?? ""),
    netPrice: Number(row.net_price),
    vatRate: Number(row.vat_rate),
    priceDate: String(row.price_date),
    proformaIncluded: Number(row.proforma_included) === 1,
  }));
}
