import { redirect } from "next/navigation";

/** The admin's home is Today on both domains (ADR 0521; it replaces Get ready as the landing, ADR 0512/0520). */
export default function HospitalAdminIndexPage() {
  redirect("/hospital-admin/today");
}
