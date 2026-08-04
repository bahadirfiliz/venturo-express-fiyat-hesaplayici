import { redirect } from "next/navigation";
import { getCurrentUser } from "../lib/auth/session";
import ChangePasswordForm from "./change-password-form";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/giris");
  if (!user.mustChangePassword) redirect(user.role === "admin" ? "/" : "/musteri");
  return <ChangePasswordForm displayName={user.displayName} />;
}
