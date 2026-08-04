import { redirect } from "next/navigation";
import { getCurrentUser } from "../lib/auth/session";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) {
    if (user.mustChangePassword) redirect("/sifre-degistir");
    redirect(user.role === "admin" ? "/" : "/musteri");
  }
  const params = await searchParams;
  return <LoginForm next={params.next ?? ""} />;
}
