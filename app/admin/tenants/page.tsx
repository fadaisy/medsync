import type { TenantItem } from "../_components/tenants/types";
import type { Metadata } from "next";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { hospitals } from "@/db/schema/hospitals";
import { userRoles } from "@/db/schema/user-roles";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { TenantsTable } from "../_components/tenants/table";

export const metadata: Metadata = {
  title: "Tenants · Superadmin · MedSync",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Tenants — all hospitals + lifecycle state. Server fetches +
 * normalises into TenantItem[], hands off to the client TenantsTable
 * (DataTable + slide-out detail panel + activate action).
 *
 * MVP actions: activate a pending hospital. Suspend / deactivate
 * are four-eyes-class and deferred per the kickoff.
 */
export default async function TenantsPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const service = createServiceClient();
  const { data: rolesData } = await service
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id);
  if (!rolesData?.some((r) => r.role === "superadmin")) {
    return <div className="mx-auto max-w-2xl px-5 py-12">Superadmin only.</div>;
  }

  const allHospitals = await db.select().from(hospitals).orderBy(asc(hospitals.name));
  const hospitalIds = allHospitals.map((h) => h.id);

  const adminCountRows =
    hospitalIds.length === 0
      ? []
      : await db
          .select({
            hospitalId: userRoles.hospitalId,
            count: sql<number>`count(*)::int`.as("count"),
          })
          .from(userRoles)
          .where(
            and(inArray(userRoles.hospitalId, hospitalIds), eq(userRoles.role, "hospital_admin")),
          )
          .groupBy(userRoles.hospitalId);
  const adminCountById = new Map(adminCountRows.map((r) => [r.hospitalId, r.count]));

  const items: TenantItem[] = allHospitals.map((h) => ({
    id: h.id,
    name: h.name,
    slug: h.slug,
    level: h.level,
    state: h.state,
    adminCount: adminCountById.get(h.id) ?? 0,
    createdAtIso: h.createdAt.toISOString(),
  }));

  return <TenantsTable items={items} />;
}
