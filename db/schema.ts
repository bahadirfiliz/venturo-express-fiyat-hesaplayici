import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const courierJobs = sqliteTable(
  "courier_jobs",
  {
    id: text("id").primaryKey(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    jobDate: text("job_date").notNull(),
    monthKey: text("month_key").notNull(),
    firm: text("firm").notNull(),
    customerTitle: text("customer_title").notNull(),
    taxOffice: text("tax_office").notNull().default(""),
    taxNumber: text("tax_number").notNull().default(""),
    customerAddress: text("customer_address").notNull().default(""),
    contactName: text("contact_name").notNull().default(""),
    contactPhone: text("contact_phone").notNull().default(""),
    orderNo: text("order_no").notNull().default(""),
    departure: text("departure").notNull(),
    departureZone: text("departure_zone").notNull(),
    arrival: text("arrival").notNull(),
    arrivalZone: text("arrival_zone").notNull(),
    vehicle: text("vehicle").notNull(),
    priority: text("priority").notNull(),
    packageProfile: text("package_profile").notNull(),
    actualDesi: real("actual_desi"),
    appliedDesi: real("applied_desi").notNull(),
    distanceKm: real("distance_km"),
    note: text("note").notNull().default(""),
    netPrice: real("net_price").notNull(),
    vatRate: real("vat_rate").notNull().default(0.2),
    priceDate: text("price_date").notNull(),
    proformaIncluded: integer("proforma_included", { mode: "boolean" })
      .notNull()
      .default(false),
    proformaAddedAt: text("proforma_added_at"),
  },
  (table) => [
    index("courier_jobs_month_idx").on(table.monthKey),
    index("courier_jobs_firm_month_idx").on(table.firm, table.monthKey),
    index("courier_jobs_proforma_idx").on(table.proformaIncluded),
  ],
);
