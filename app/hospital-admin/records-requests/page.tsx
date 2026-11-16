import { permanentRedirect } from "next/navigation";

/** Copy requests moved into Requests (ADR 0515); the old address keeps working. */
export default function RecordsRequestsPage() {
  permanentRedirect("/hospital-admin/requests?tab=copies");
}
