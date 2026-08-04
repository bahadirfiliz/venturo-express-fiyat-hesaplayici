import { ensureApplicationSchema, getSql } from "../../../db";
import { seedInitialAccess } from "../../lib/auth/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const database = getSql();
    await ensureApplicationSchema(database);
    await seedInitialAccess(database);
    await database.unsafe("SELECT 1");
    return Response.json({ status: "ok", database: "connected" });
  } catch {
    return Response.json(
      { status: "unavailable", database: "disconnected" },
      { status: 503 },
    );
  }
}
