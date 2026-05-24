import type { Metadata } from "next";
import { asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { hospitals } from "@/db/schema/hospitals";
import { userRoles } from "@/db/schema/user-roles";
import { users } from "@/db/schema/users";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ActivateHospitalButton } from "./_activate-button";

export const metadata: Metadata = {
  title: "Tenants · Superadmin · MedSync",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * GATE D — Tenants. List every hospital with its state and basic
 * shape (admin count, staff count via affiliations).
 *
 * MVP actions:
 *   - Activate a pending hospital (via sa-activate-hospital Edge
 *     Function; not four-eyes-class because activation is forward-
 *     direction and reversible via the deferred suspend flow).
 *
 * Deferred behind safeguards:
 *   - Suspend / deactivate (four-eyes-class, lands once the wiring
 *     is exercised + the confirm-friction UI is added).
 *   - Per-tenant configuration.
 */
export default async function TenantsPage() {
  // Re-gate at the page level.
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

  // Count hospital_admin holders per hospital (one round-trip, group-by).
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
            inArray(userRoles.hospitalId, hospitalIds) /* eq role hospital_admin: */ &&
              eq(userRoles.role, "hospital_admin"),
          )
          .groupBy(userRoles.hospitalId);
  const adminCountById = new Map(adminCountRows.map((r) => [r.hospitalId, r.count]));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-7 px-5 py-10 sm:px-8 sm:py-14">
      <header className="flex flex-col gap-2">
        <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
          <span className="size-1 rounded-full bg-teal-500" />
          Area 2 · Tenant management
        </span>
        <h1
          className="font-display text-foreground text-[28px] leading-[1.1] tracking-[-0.02em] sm:text-[36px]"
          style={{ fontWeight: 400 }}
        >
          Tenants
        </h1>
        <p className="text-muted-foreground text-[13.5px]">
          {allHospitals.length} hospital{allHospitals.length === 1 ? "" : "s"} on the platform.
          Suspend / deactivate is four-eyes-class and currently deferred.
        </p>
      </header>

      <section className="border-border bg-card overflow-hidden rounded-lg border">
        <table className="w-full text-left text-[13px]">
          <thead className="border-border bg-muted/30 border-b">
            <tr className="text-muted-foreground font-mono text-[10px] tracking-[0.16em] uppercase">
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Slug</th>
              <th className="px-4 py-2.5">Level</th>
              <th className="px-4 py-2.5">State</th>
              <th className="px-4 py-2.5">Admins</th>
              <th className="px-4 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {allHospitals.map((h) => (
              <tr key={h.id}>
                <td className="text-foreground px-4 py-3 font-medium">{h.name}</td>
                <td className="text-muted-foreground px-4 py-3 font-mono text-[11.5px]">
                  {h.slug}
                </td>
                <td className="text-muted-foreground px-4 py-3 font-mono text-[11px]">{h.level}</td>
                <td className="px-4 py-3">
                  <StateChip state={h.state} />
                </td>
                <td className="text-muted-foreground px-4 py-3 tabular-nums">
                  {adminCountById.get(h.id) ?? 0}
                </td>
                <td className="px-4 py-3">
                  {h.state !== "active" ? (
                    <ActivateHospitalButton hospitalId={h.id} name={h.name} />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function StateChip({ state }: { state: string }) {
  const tone =
    state === "active"
      ? "bg-teal-100/60 text-teal-800 dark:bg-teal-50/15 dark:text-teal-200"
      : state === "pending_approval" || state === "pending"
        ? "bg-amber-100/60 text-amber-800 dark:bg-amber-100/10 dark:text-amber-200"
        : state === "suspended" || state === "deactivated"
          ? "bg-red-100/60 text-red-800 dark:bg-red-100/10 dark:text-red-200"
          : "bg-muted text-muted-foreground";
  return (
    <span
      className={`rounded-full px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] uppercase ${tone}`}
    >
      {state}
    </span>
  );
}

// Touch users to keep the import in case of future joins.
void users;
