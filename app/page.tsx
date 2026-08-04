import AdminDashboard from "./admin-dashboard";
import { requirePageUser } from "./lib/auth/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requirePageUser(["admin"], "/");

  return <AdminDashboard displayName={user.displayName} />;
}
