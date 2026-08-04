import { destroyCurrentSession } from "../../../lib/auth/session";

export async function POST(request: Request) {
  await destroyCurrentSession();
  return Response.redirect(new URL("/giris", request.url), 303);
}
