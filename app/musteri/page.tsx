import { requirePageUser } from "../lib/auth/session";
import { getCustomerJobs } from "../lib/customer/jobs";
import { getCustomerPricingOptions } from "../lib/customer/pricing";
import CustomerPortal from "./customer-portal";

export const dynamic = "force-dynamic";

export default async function CustomerPage() {
  const user = await requirePageUser(["customer"], "/musteri");
  if (!user.customer || !user.customerId) throw new Error("Müşteri hesabı bulunamadı.");
  const jobs = await getCustomerJobs(user.customerId);
  const options = getCustomerPricingOptions();

  return (
    <CustomerPortal
      user={{ username: user.username, displayName: user.displayName }}
      customer={user.customer}
      jobs={jobs}
      options={options}
    />
  );
}
