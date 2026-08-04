import {
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
} from "drizzle-orm/pg-core";

export const courierJobs = pgTable(
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
    actualDesi: doublePrecision("actual_desi"),
    appliedDesi: doublePrecision("applied_desi").notNull(),
    distanceKm: doublePrecision("distance_km"),
    note: text("note").notNull().default(""),
    netPrice: doublePrecision("net_price").notNull(),
    vatRate: doublePrecision("vat_rate").notNull().default(0.2),
    priceDate: text("price_date").notNull(),
    proformaIncluded: integer("proforma_included").notNull().default(0),
    proformaAddedAt: text("proforma_added_at"),
  },
  (table) => [
    index("courier_jobs_month_idx").on(table.monthKey),
    index("courier_jobs_firm_month_idx").on(table.firm, table.monthKey),
    index("courier_jobs_proforma_idx").on(table.proformaIncluded),
  ],
);

export const customerAccounts = pgTable(
  "customer_accounts",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull().unique(),
    shortName: text("short_name").notNull(),
    legalTitle: text("legal_title").notNull(),
    jobFirm: text("job_firm").notNull().unique(),
    active: integer("active").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
);

export const appUsers = pgTable(
  "app_users",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").references(() => customerAccounts.id),
    username: text("username").notNull().unique(),
    displayName: text("display_name").notNull(),
    role: text("role").notNull(),
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),
    active: integer("active").notNull().default(1),
    mustChangePassword: integer("must_change_password").notNull().default(1),
    failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
    lockedUntil: text("locked_until"),
    lastLoginAt: text("last_login_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("app_users_customer_idx").on(table.customerId)],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => appUsers.id),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
  },
  (table) => [
    index("auth_sessions_user_idx").on(table.userId),
    index("auth_sessions_expiry_idx").on(table.expiresAt),
  ],
);
