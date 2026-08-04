import { authenticateCredentials, createSession, safeDestination } from "../../../lib/auth/session";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const result = await authenticateCredentials(body.username, body.password);
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 401 });
    }
    await createSession(result.user.id);
    const redirectTo = result.user.mustChangePassword
      ? "/sifre-degistir"
      : safeDestination(body.next, result.user.role);
    return Response.json({ redirectTo, role: result.user.role });
  } catch {
    return Response.json({ error: "Giriş işlemi tamamlanamadı." }, { status: 500 });
  }
}
