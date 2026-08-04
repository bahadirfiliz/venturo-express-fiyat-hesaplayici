import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ensureAuthSchema, getSql } from "../../../db";
import { verifyPassword } from "./password";
import { seedInitialAccess } from "./seed";

export type AppRole = "admin" | "customer";

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  role: AppRole;
  customerId: string | null;
  mustChangePassword: boolean;
  customer: null | {
    code: string;
    shortName: string;
    legalTitle: string;
    jobFirm: string;
  };
};

const SESSION_COOKIE = "venturo_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FAILED_LOGINS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

function normalizeUsername(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, "")
    .slice(0, 120);
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function serializeUser(row: Record<string, unknown>): SessionUser {
  const customerId = row.customer_id ? String(row.customer_id) : null;
  return {
    id: String(row.id),
    username: String(row.username),
    displayName: String(row.display_name),
    role: String(row.role) as AppRole,
    customerId,
    mustChangePassword: Number(row.must_change_password) === 1,
    customer: customerId
      ? {
          code: String(row.customer_code),
          shortName: String(row.customer_short_name),
          legalTitle: String(row.customer_legal_title),
          jobFirm: String(row.customer_job_firm),
        }
      : null,
  };
}

const userSelectSql = `
  SELECT
    u.*,
    c.code AS customer_code,
    c.short_name AS customer_short_name,
    c.legal_title AS customer_legal_title,
    c.job_firm AS customer_job_firm,
    c.active AS customer_active
  FROM app_users u
  LEFT JOIN customer_accounts c ON c.id = u.customer_id
`;

export async function authenticateCredentials(
  usernameValue: unknown,
  passwordValue: unknown,
) {
  const database = getSql();
  await seedInitialAccess(database);
  const username = normalizeUsername(usernameValue);
  const password = String(passwordValue ?? "");
  if (!username || !password) {
    return { ok: false as const, error: "Kullanıcı adı ve şifre zorunludur." };
  }

  const rows = (await database.unsafe(
    `${userSelectSql} WHERE u.username = $1 LIMIT 1`,
    [username],
  )) as unknown as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row || Number(row.active) !== 1) {
    return { ok: false as const, error: "Kullanıcı adı veya şifre hatalı." };
  }
  if (row.customer_id && Number(row.customer_active) !== 1) {
    return { ok: false as const, error: "Müşteri hesabı kullanım dışı." };
  }

  const lockedUntil = row.locked_until ? new Date(String(row.locked_until)) : null;
  if (lockedUntil && lockedUntil.getTime() > Date.now()) {
    return {
      ok: false as const,
      error: "Çok fazla hatalı deneme yapıldı. 15 dakika sonra tekrar deneyin.",
    };
  }

  const valid = await verifyPassword(
    password,
    String(row.password_salt),
    String(row.password_hash),
  );
  const now = new Date().toISOString();
  if (!valid) {
    const attempts = Number(row.failed_login_attempts ?? 0) + 1;
    const nextLock =
      attempts >= MAX_FAILED_LOGINS
        ? new Date(Date.now() + LOCK_DURATION_MS).toISOString()
        : null;
    await database.unsafe(
      `UPDATE app_users
       SET failed_login_attempts = $1, locked_until = $2, updated_at = $3
       WHERE id = $4`,
      [attempts >= MAX_FAILED_LOGINS ? 0 : attempts, nextLock, now, String(row.id)],
    );
    return { ok: false as const, error: "Kullanıcı adı veya şifre hatalı." };
  }

  await database.unsafe(
    `UPDATE app_users
     SET failed_login_attempts = 0, locked_until = NULL,
         last_login_at = $1, updated_at = $1
     WHERE id = $2`,
    [now, String(row.id)],
  );
  return { ok: true as const, user: serializeUser(row) };
}

export async function createSession(userId: string) {
  const database = getSql();
  await ensureAuthSchema(database);
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);
  await database.unsafe(
    `INSERT INTO auth_sessions (
      token_hash, user_id, created_at, expires_at, last_seen_at
    ) VALUES ($1, $2, $3, $4, $3)`,
    [tokenHash(token), userId, now.toISOString(), expiresAt.toISOString()],
  );
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroyCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    const database = getSql();
    await ensureAuthSchema(database);
    await database.unsafe("DELETE FROM auth_sessions WHERE token_hash = $1", [
      tokenHash(token),
    ]);
  }
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const database = getSql();
  await ensureAuthSchema(database);
  const rows = (await database.unsafe(
    `${userSelectSql}
     INNER JOIN auth_sessions s ON s.user_id = u.id
     WHERE s.token_hash = $1 AND s.expires_at > $2
     LIMIT 1`,
    [tokenHash(token), new Date().toISOString()],
  )) as unknown as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row || Number(row.active) !== 1) return null;
  if (row.customer_id && Number(row.customer_active) !== 1) return null;
  return serializeUser(row);
}

export async function requirePageUser(
  roles: AppRole[],
  returnTo: string,
) {
  const user = await getCurrentUser();
  if (!user) redirect(`/giris?next=${encodeURIComponent(returnTo)}`);
  if (user.mustChangePassword && returnTo !== "/sifre-degistir") {
    redirect("/sifre-degistir");
  }
  if (!roles.includes(user.role)) {
    redirect(user.role === "admin" ? "/" : "/musteri");
  }
  return user;
}

export function safeDestination(value: unknown, role: AppRole) {
  const fallback = role === "admin" ? "/" : "/musteri";
  const text = String(value ?? "");
  if (!text.startsWith("/") || text.startsWith("//")) return fallback;
  if (role === "customer" && !text.startsWith("/musteri")) return fallback;
  if (role === "admin" && text.startsWith("/musteri")) return fallback;
  return text;
}

export async function apiAccessError(roles: AppRole[]) {
  const user = await getCurrentUser();
  if (!user) {
    return { user: null, response: Response.json({ error: "Oturum gerekli." }, { status: 401 }) };
  }
  if (user.mustChangePassword) {
    return {
      user: null,
      response: Response.json({ error: "Önce geçici şifrenizi değiştirin." }, { status: 403 }),
    };
  }
  if (!roles.includes(user.role)) {
    return { user: null, response: Response.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 }) };
  }
  return { user, response: null };
}
