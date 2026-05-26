import { redirect } from "next/navigation";

// The clinician workspace currently has one page — the availability
// editor. Index redirects there. When more features ship (today's
// schedule, encounters, etc.) this becomes a real overview.
export default function ClinicianIndex() {
  redirect("/clinician/availability");
}
