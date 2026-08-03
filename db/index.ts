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

const globalForDatabase = globalThis as typeof globalThis & {
  venturoSql?: SqlClient;
};

let schemaPromise: Promise<void> | null = null;

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
