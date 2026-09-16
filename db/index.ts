import postgres from "postgres";

type SqlClient = ReturnType<typeof postgres>;

const createJobsTableSql = `
  CREATE TABLE IF NOT EXISTS courier_jobs (
    id TEXT PRIMARY KEY NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    job_date TEXT NOT NULL,
    month_key TEXT NOT NULL,
    firm TEXT NOT NULL,
    customer_title TEXT NOT NULL,
    tax_office TEXT NOT NULL DEFAULT '',
    tax_number TEXT NOT NULL DEFAULT '',
    customer_address TEXT NOT NULL DEFAULT '',
    contact_name TEXT NOT NULL DEFAULT '',
    contact_phone TEXT NOT NULL DEFAULT '',
    order_no TEXT NOT NULL DEFAULT '',
    departure TEXT NOT NULL,
    departure_zone TEXT NOT NULL,
    arrival TEXT NOT NULL,
    arrival_zone TEXT NOT NULL,
    vehicle TEXT NOT NULL,
    priority TEXT NOT NULL,
    package_profile TEXT NOT NULL,
    actual_desi DOUBLE PRECISION,
    applied_desi DOUBLE PRECISION NOT NULL,
    distance_km DOUBLE PRECISION,
    note TEXT NOT NULL DEFAULT '',
    net_price DOUBLE PRECISION NOT NULL,
    vat_rate DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    price_date TEXT NOT NULL,
    proforma_included INTEGER NOT NULL DEFAULT 0,
    proforma_added_at TEXT
  )
`;

const createExternalTransportDaysTableSql = `
  CREATE TABLE IF NOT EXISTS external_transport_days (
    id TEXT PRIMARY KEY NOT NULL,
    entry_date TEXT UNIQUE NOT NULL,
    month_key TEXT NOT NULL,
    income_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    income_note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;

const createExternalTransportExpensesTableSql = `
  CREATE TABLE IF NOT EXISTS external_transport_expenses (
    id TEXT PRIMARY KEY NOT NULL,
    day_id TEXT NOT NULL REFERENCES external_transport_days(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;

const createExternalTransportDriverPaymentsTableSql = `
  CREATE TABLE IF NOT EXISTS external_transport_driver_payments (
    id TEXT PRIMARY KEY NOT NULL,
    payment_date DATE NOT NULL,
    amount NUMERIC(12, 2) NOT NULL CONSTRAINT external_transport_driver_payments_amount_positive CHECK (amount > 0),
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    voided_at TIMESTAMPTZ
  )
`;

const createCustomerAccountsTableSql = `
  CREATE TABLE IF NOT EXISTS customer_accounts (
    id TEXT PRIMARY KEY NOT NULL,
    code TEXT UNIQUE NOT NULL,
    short_name TEXT NOT NULL,
    legal_title TEXT NOT NULL,
    job_firm TEXT UNIQUE NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;

const createAppUsersTableSql = `
  CREATE TABLE IF NOT EXISTS app_users (
    id TEXT PRIMARY KEY NOT NULL,
    customer_id TEXT REFERENCES customer_accounts(id) ON DELETE RESTRICT,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'customer')),
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    must_change_password INTEGER NOT NULL DEFAULT 1,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    last_login_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CONSTRAINT customer_role_scope CHECK (
      (role = 'customer' AND customer_id IS NOT NULL) OR
      (role = 'admin' AND customer_id IS NULL)
    )
  )
`;

const createAuthSessionsTableSql = `
  CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  )
`;

const globalForDatabase = globalThis as typeof globalThis & {
  venturoSql?: SqlClient;
};

let schemaPromise: Promise<void> | null = null;
let authSchemaPromise: Promise<void> | null = null;
let externalTransportSchemaPromise: Promise<void> | null = null;

export function getSql() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Kalıcı PostgreSQL bağlantısı yapılandırılmamış.");
  }

  globalForDatabase.venturoSql ??= postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });

  return globalForDatabase.venturoSql;
}

export function ensureJobsSchema(database = getSql()) {
  schemaPromise ??= (async () => {
    await database.unsafe(createJobsTableSql);
    await Promise.all([
      database.unsafe(
        "CREATE INDEX IF NOT EXISTS courier_jobs_month_idx ON courier_jobs (month_key)",
      ),
      database.unsafe(
        "CREATE INDEX IF NOT EXISTS courier_jobs_firm_month_idx ON courier_jobs (firm, month_key)",
      ),
      database.unsafe(
        "CREATE INDEX IF NOT EXISTS courier_jobs_proforma_idx ON courier_jobs (proforma_included)",
      ),
    ]);
  })()
    .catch((error) => {
      schemaPromise = null;
      throw error;
    });

  return schemaPromise;
}

export function ensureAuthSchema(database = getSql()) {
  authSchemaPromise ??= (async () => {
    await database.unsafe(createCustomerAccountsTableSql);
    await database.unsafe(createAppUsersTableSql);
    await database.unsafe(createAuthSessionsTableSql);
    await Promise.all([
      database.unsafe(
        "CREATE INDEX IF NOT EXISTS app_users_customer_idx ON app_users (customer_id)",
      ),
      database.unsafe(
        "CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions (user_id)",
      ),
      database.unsafe(
        "CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions (expires_at)",
      ),
    ]);
  })().catch((error) => {
    authSchemaPromise = null;
    throw error;
  });

  return authSchemaPromise;
}

export function ensureExternalTransportSchema(database = getSql()) {
  externalTransportSchemaPromise ??= (async () => {
    await database.unsafe(createExternalTransportDaysTableSql);
    await database.unsafe(createExternalTransportExpensesTableSql);
    await database.unsafe(createExternalTransportDriverPaymentsTableSql);
    await Promise.all([
      database.unsafe(
        "CREATE INDEX IF NOT EXISTS external_transport_days_month_idx ON external_transport_days (month_key)",
      ),
      database.unsafe(
        "CREATE INDEX IF NOT EXISTS external_transport_expenses_day_idx ON external_transport_expenses (day_id)",
      ),
      database.unsafe(
        "CREATE INDEX IF NOT EXISTS external_transport_driver_payments_date_idx ON external_transport_driver_payments (payment_date)",
      ),
    ]);
  })().catch((error) => {
    externalTransportSchemaPromise = null;
    throw error;
  });

  return externalTransportSchemaPromise;
}

export async function ensureApplicationSchema(database = getSql()) {
  await Promise.all([
    ensureJobsSchema(database),
    ensureAuthSchema(database),
    ensureExternalTransportSchema(database),
  ]);
}
