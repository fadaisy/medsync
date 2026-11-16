import { permanentRedirect } from "next/navigation";

/** Booking policy moved into each department's panel, under Booking rules (ADR 0516 phase 2). */
export default function BookingPolicyPage() {
  permanentRedirect("/hospital-admin/departments");
}
