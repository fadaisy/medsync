import { permanentRedirect } from "next/navigation";

/** The Audit placeholder became Activity (ADR 0521); the old address keeps working. */
export default function AuditPage() {
  permanentRedirect("/hospital-admin/activity");
}
