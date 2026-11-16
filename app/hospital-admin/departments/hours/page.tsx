import { permanentRedirect } from "next/navigation";

/** Hours & places is the Departments page's "Hours and places" view (ADR 0516 phase 2); closures are in Clinics & schedule. */
export default function HoursPage() {
  permanentRedirect("/hospital-admin/departments?view=hours");
}
