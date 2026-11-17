import type { Metadata } from "next";

import { REQUESTS } from "@/content/hospital-admin/admin-nav";
import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { RequestsView } from "./_components/requests-view";
import { loadCopyRequests } from "./_lib/copies";
import { loadPendingRows } from "./_lib/pending-rows";

export const metadata: Metadata = { title: REQUESTS.title };
export const dynamic = "force-dynamic";

/**
 * Requests (ADR 0520): what is waiting on someone. Booking requests waiting for a clinician (moved from Reports'
 * Pending) and patients' copies of results (moved from the unlisted records-requests page). `?tab=copies` opens
 * the second. Ages are measured on the server, once, so the list is the same on every screen.
 */
export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const scope = await requireHospitalAdminScope();
  const [pending, copies] = await Promise.all([
    loadPendingRows(scope.hospitalId),
    loadCopyRequests(scope.hospitalId),
  ]);
  const tab = (await searchParams).tab === "copies" ? "copies" : "clinician";
  return <RequestsView tab={tab} pending={pending.rows} cut={pending.cut} copies={copies} />;
}
