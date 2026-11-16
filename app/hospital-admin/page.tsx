import { redirect } from "next/navigation";

/** The admin's home is Today on both domains (ADR 0517; it replaces Get ready as the landing, ADR 0512/0516). */
export default function HospitalAdminIndexPage() {
  redirect("/hospital-admin/today");
}
