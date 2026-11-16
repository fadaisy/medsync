import { redirect } from "next/navigation";

/**
 * The admin's home is Get ready in Clinics & schedule on both domains (ADR 0512 on Tether, ADR 0515 here) until
 * the Today page replaces it. The old Overview was a placeholder with two counts; Today will reuse those counts
 * (`staff-overview-card`, `scheduling-overview-card`).
 */
export default function HospitalAdminIndexPage() {
  redirect("/hospital-admin/clinics");
}
