import { apiAccessError } from "../../../lib/auth/session";
import { calculateCustomerQuote, type CustomerVehicle } from "../../../lib/customer/pricing";

export async function POST(request: Request) {
  const access = await apiAccessError(["customer"]);
  if (access.response) return access.response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const actualDesi =
      body.actualDesi === null || body.actualDesi === undefined || body.actualDesi === ""
        ? null
        : Number(body.actualDesi);
    const quote = calculateCustomerQuote({
      departure: String(body.departure ?? ""),
      arrival: String(body.arrival ?? ""),
      vehicle: String(body.vehicle ?? "") as CustomerVehicle,
      priority: String(body.priority ?? ""),
      packageProfile: String(body.packageProfile ?? ""),
      actualDesi,
    });
    return Response.json({ quote });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Fiyat hesaplanamadı." },
      { status: 400 },
    );
  }
}
