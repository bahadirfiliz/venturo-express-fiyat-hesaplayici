import { ensureAuthSchema, getSql } from "../../../../db";
import { createPasswordDigest, validateNewPassword, verifyPassword } from "../../../lib/auth/password";
import { getCurrentUser } from "../../../lib/auth/session";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Oturum gerekli." }, { status: 401 });
    const body = (await request.json()) as Record<string, unknown>;
    const currentPassword = String(body.currentPassword ?? "");
    const newPassword = String(body.newPassword ?? "");
    const validationError = validateNewPassword(newPassword);
    if (validationError) return Response.json({ error: validationError }, { status: 400 });
    if (currentPassword === newPassword) {
      return Response.json({ error: "Yeni şifre geçici şifreden farklı olmalıdır." }, { status: 400 });
    }

    const database = getSql();
    await ensureAuthSchema(database);
    const rows = (await database.unsafe(
      "SELECT password_hash, password_salt FROM app_users WHERE id = $1 LIMIT 1",
      [user.id],
    )) as unknown as Array<Record<string, unknown>>;
    const row = rows[0];
    const valid = row
      ? await verifyPassword(currentPassword, String(row.password_salt), String(row.password_hash))
      : false;
    if (!valid) {
      return Response.json({ error: "Geçici/mevcut şifre hatalı." }, { status: 400 });
    }

    const digest = await createPasswordDigest(newPassword);
    const now = new Date().toISOString();
    await database.unsafe(
      `UPDATE app_users
       SET password_hash = $1, password_salt = $2,
           must_change_password = 0, updated_at = $3
       WHERE id = $4`,
      [digest.hash, digest.salt, now, user.id],
    );
    return Response.json({ redirectTo: user.role === "admin" ? "/" : "/musteri" });
  } catch {
    return Response.json({ error: "Şifre değiştirilemedi." }, { status: 500 });
  }
}
