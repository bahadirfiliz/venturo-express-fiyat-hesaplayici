import "server-only";

import { ensureAuthSchema, getSql } from "../../../db";
import { createPasswordDigest } from "./password";

const TERA_ACCOUNT_ID = "customer-tera";

type SqlClient = ReturnType<typeof getSql>;

async function insertInitialUser({
  database,
  username,
  displayName,
  role,
  customerId,
  password,
}: {
  database: SqlClient;
  username: string;
  displayName: string;
  role: "admin" | "customer";
  customerId: string | null;
  password: string | undefined;
}) {
  if (!password) return;
  const existing = (await database.unsafe(
    "SELECT id FROM app_users WHERE username = $1 LIMIT 1",
    [username],
  )) as unknown as Array<{ id: string }>;
  if (existing.length > 0) return;

  const digest = await createPasswordDigest(password);
  const now = new Date().toISOString();
  await database.unsafe(
    `INSERT INTO app_users (
      id, customer_id, username, display_name, role, password_hash,
      password_salt, active, must_change_password, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, 1, $8, $8)
    ON CONFLICT (username) DO NOTHING`,
    [
      crypto.randomUUID(),
      customerId,
      username,
      displayName,
      role,
      digest.hash,
      digest.salt,
      now,
    ],
  );
}

export async function seedInitialAccess(database = getSql()) {
  await ensureAuthSchema(database);
  const now = new Date().toISOString();
  await database.unsafe(
    `INSERT INTO customer_accounts (
      id, code, short_name, legal_title, job_firm, active, created_at, updated_at
    ) VALUES ($1, 'TERA', 'Tera', 'Tera Bank A.Ş.', 'Tera Bank', 1, $2, $2)
    ON CONFLICT (code) DO UPDATE SET
      short_name = EXCLUDED.short_name,
      legal_title = EXCLUDED.legal_title,
      job_firm = EXCLUDED.job_firm,
      active = 1,
      updated_at = EXCLUDED.updated_at`,
    [TERA_ACCOUNT_ID, now],
  );

  await insertInitialUser({
    database,
    username: "venturo.admin",
    displayName: "Venturo Yönetici",
    role: "admin",
    customerId: null,
    password: process.env.INITIAL_ADMIN_PASSWORD,
  });
  await insertInitialUser({
    database,
    username: "nazife.vural",
    displayName: "Nazife Vural",
    role: "customer",
    customerId: TERA_ACCOUNT_ID,
    password: process.env.INITIAL_TERA_PASSWORD,
  });
}
