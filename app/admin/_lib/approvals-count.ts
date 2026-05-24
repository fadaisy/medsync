import { createServiceClient } from "@/lib/supabase/service";

/**
 * Live count for the Approvals badge in the sidebar.
 *
 * Sums the two queues the operator triages from the landing surface:
 *   - hospital_applications.state = 'pending_approval'
 *   - staff_affiliations.state    = 'pending_approval'
 *
 * Best-effort: any query failure returns 0 so the chrome never breaks
 * the shell render. The Approvals page itself is the source of truth
 * and will show the precise breakdown.
 */
export async function getApprovalsCount(): Promise<number> {
  const service = createServiceClient();
  try {
    const [hospitalsRes, staffRes] = await Promise.all([
      service
        .from("hospital_applications")
        .select("id", { count: "exact", head: true })
        .eq("state", "pending_approval"),
      service
        .from("staff_affiliations")
        .select("id", { count: "exact", head: true })
        .eq("state", "pending_approval"),
    ]);
    const hospitals = hospitalsRes.count ?? 0;
    const staff = staffRes.count ?? 0;
    return hospitals + staff;
  } catch {
    return 0;
  }
}
