import { ensureJobsSchema, getSql } from "../../../db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const database = getSql();
    await ensureJobsSchema(database);
    await database.unsafe("SELECT 1");
    return Response.json({ status: "ok", database: "connected" });
  } catch {
    return Response.json(
      { status: "unavailable", database: "disconnected" },
      { status: 503 },
    );
  }
}
