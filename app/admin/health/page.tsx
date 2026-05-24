import type { Metadata } from "next";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { staffAffiliations } from "@/db/schema/clinician-profiles";
import { hospitalApplications } from "@/db/schema/hospital-applications";
import { hospitals } from "@/db/schema/hospitals";
import { saAuditLog } from "@/db/schema/sa-audit-log";
import { saBreakGlassGrants } from "@/db/schema/sa-break-glass-grants";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Health · Superadmin · MedSync",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * GATE E — Platform health.
 *
 * Glanceable strip — "is the platform okay right now?" Aggregate /
 * operational metrics only; no patient-level data. Full dashboards,
 * Sentry trends, SMS analytics deferred.
 */
export default async function HealthPage() {
  // Re-gate at the page level (hospital_admins can also see this surface,
  // but the queries below run via the shared db client which obeys RLS).
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const service = createServiceClient();
  const { data: rolesData } = await service
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id);
  if (!rolesData || rolesData.length === 0) {
    return <div className="mx-auto max-w-2xl px-5 py-12">Admin only.</div>;
  }

  const [[hospitalCounts], pendingAppRows, pendingStaffRows, [auditCounts], activeBreakGlassRows] =
    await Promise.all([
      db
        .select({
          active: sql<number>`count(*) FILTER (WHERE ${hospitals.state} = 'active')::int`,
          pending: sql<number>`count(*) FILTER (WHERE ${hospitals.state} <> 'active')::int`,
        })
        .from(hospitals),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(hospitalApplications)
        .where(eq(hospitalApplications.state, "pending_approval")),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(staffAffiliations)
        .where(eq(staffAffiliations.state, "pending_approval")),
      db
        .select({
          last24h: sql<number>`count(*) FILTER (WHERE ${saAuditLog.timestamp} > now() - interval '24 hours')::int`,
          breakGlass: sql<number>`count(*) FILTER (WHERE ${saAuditLog.action} = 'break_glass_open' AND ${saAuditLog.timestamp} > now() - interval '7 days')::int`,
        })
        .from(saAuditLog),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(saBreakGlassGrants)
        .where(
          sql`${saBreakGlassGrants.revokedAt} IS NULL AND ${saBreakGlassGrants.expiresAt} > now()`,
        ),
    ]);

  const stats = [
    {
      label: "Active tenants",
      value: hospitalCounts?.active ?? 0,
      hint: `${hospitalCounts?.pending ?? 0} pending`,
    },
    {
      label: "Hospital apps pending",
      value: pendingAppRows[0]?.count ?? 0,
      hint: "in your approvals queue",
    },
    {
      label: "Staff approvals pending",
      value: pendingStaffRows[0]?.count ?? 0,
      hint: "across all hospitals",
    },
    {
      label: "Audit events · 24h",
      value: auditCounts?.last24h ?? 0,
      hint: "all sa_audit_log writes",
    },
    {
      label: "Break-glass · 7d",
      value: auditCounts?.breakGlass ?? 0,
      hint: `${activeBreakGlassRows[0]?.count ?? 0} grants live now`,
      accent: (auditCounts?.breakGlass ?? 0) > 0,
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-7 px-5 py-10 sm:px-8 sm:py-14">
      <header className="flex flex-col gap-2">
        <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
          <span className="size-1 rounded-full bg-teal-500" />
          Area 6 · Platform health
        </span>
        <h1
          className="font-display text-foreground text-[28px] leading-[1.1] tracking-[-0.02em] sm:text-[36px]"
          style={{ fontWeight: 400 }}
        >
          Platform health
        </h1>
        <p className="text-muted-foreground text-[13.5px]">
          Aggregate, operational only. Patient-level data never appears here.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((s) => (
          <div
            key={s.label}
            className={
              "border-border bg-card flex flex-col gap-1.5 rounded-lg border p-5" +
              (s.accent ? " border-l-2 border-l-teal-500" : "")
            }
          >
            <span className="text-muted-foreground font-mono text-[10px] tracking-[0.16em] uppercase">
              {s.label}
            </span>
            <span className="text-foreground text-[28px] leading-none tabular-nums">{s.value}</span>
            <span className="text-muted-foreground text-[11.5px]">{s.hint}</span>
          </div>
        ))}
      </section>

      <p className="text-muted-foreground text-[11.5px] italic">
        Sentry counts, SMS-delivery analytics, trend charts and auto-alerting ship in a later gate
        (per kickoff Area 6 deferred list).
      </p>
    </div>
  );
}
