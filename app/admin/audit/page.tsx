import type { AuditFiltersState } from "./_filters";
import type { Metadata } from "next";
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";

import { db } from "@/db";
import { saAuditLog } from "@/db/schema/sa-audit-log";
import { users } from "@/db/schema/users";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { AuditExportButton } from "./_export-button";
import { AuditFilters } from "./_filters";

export const metadata: Metadata = {
  title: "Audit · Superadmin · MedSync",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * GATE C — superadmin audit console.
 *
 * First-class view of sa_audit_log: every cross-tenant read,
 * approval, admin creation, catalog change, break-glass event.
 *
 * URL parameter contract (search params drive the filter so the
 * console URL is shareable and the back button works):
 *   - from / to:    ISO YYYY-MM-DD (inclusive); both optional
 *   - actor:        UUID of the acting user (optional)
 *   - action:       one sa_audit_log.action enum value (optional)
 *   - target:       one sa_audit_log.target_kind enum value (optional)
 *
 * Display:
 *   - Reverse-chrono table, most recent first.
 *   - Break-glass events get a teal/destructive accent so they jump
 *     out at any scroll position.
 *   - Export button (right column) hits the sa-export-audit-log
 *     Edge Function which records the export itself before returning
 *     the data; the client wraps the response in a CSV download.
 */
interface SearchParams {
  from?: string;
  to?: string;
  actor?: string;
  action?: string;
  target?: string;
}

const PAGE_LIMIT = 200;

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  // Re-gate at the page level on top of the layout. Hospital admins
  // never reach this surface — but we belt-and-suspenders here so an
  // accidental nav change can't leak the page.
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const service = createServiceClient();
  const { data: rolesData } = await service
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id);
  const isSuperadmin = !!rolesData?.some((r) => r.role === "superadmin");
  if (!isSuperadmin) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-12">
        <h1 className="text-foreground text-xl">Superadmin only.</h1>
      </div>
    );
  }

  // Build the where chain from the search params. Empty inputs are
  // simply omitted — partial filters are valid.
  const wheres = [];
  if (sp.from) wheres.push(gte(saAuditLog.timestamp, new Date(`${sp.from}T00:00:00Z`)));
  if (sp.to) wheres.push(lt(saAuditLog.timestamp, new Date(`${sp.to}T23:59:59.999Z`)));
  if (sp.actor && /^[0-9a-f-]{36}$/i.test(sp.actor)) {
    wheres.push(eq(saAuditLog.actorId, sp.actor));
  }
  if (sp.action) wheres.push(eq(saAuditLog.action, sp.action));
  if (sp.target) wheres.push(eq(saAuditLog.targetKind, sp.target));

  const rows = await db
    .select()
    .from(saAuditLog)
    .where(wheres.length === 0 ? undefined : wheres.length === 1 ? wheres[0] : and(...wheres))
    .orderBy(desc(saAuditLog.timestamp))
    .limit(PAGE_LIMIT);

  // Resolve actor → email + full_name in one batched lookup.
  const actorIds = [...new Set(rows.map((r) => r.actorId))];
  const actorRows =
    actorIds.length > 0
      ? await db
          .select({
            id: users.id,
            email: users.email,
            fullName: users.fullName,
          })
          .from(users)
          .where(inArray(users.id, actorIds))
      : [];
  const actorById = new Map(actorRows.map((u) => [u.id, u]));

  const initialFilters: AuditFiltersState = {
    from: sp.from ?? "",
    to: sp.to ?? "",
    actor: sp.actor ?? "",
    action: sp.action ?? "",
    target: sp.target ?? "",
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-5 py-10 sm:px-8 sm:py-14">
      <header className="flex flex-col gap-3">
        <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
          <span className="size-1 rounded-full bg-teal-500" />
          Audit &amp; oversight · sa_audit_log
        </span>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1
              className="font-display text-foreground text-[28px] leading-[1.1] tracking-[-0.02em] sm:text-[36px]"
              style={{ fontWeight: 400 }}
            >
              Audit console
            </h1>
            <p className="text-muted-foreground text-[13.5px]">
              Every superadmin action is recorded. Break-glass events are highlighted. Export is
              itself an audited action.
            </p>
          </div>
          <AuditExportButton currentFilters={initialFilters} />
        </div>
      </header>

      <AuditFilters initial={initialFilters} />

      <section className="border-border bg-card overflow-hidden rounded-lg border">
        <div className="border-border bg-muted/30 flex items-center justify-between border-b px-4 py-2.5">
          <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
            Showing {rows.length} {rows.length === PAGE_LIMIT ? `(capped at ${PAGE_LIMIT})` : ""}
          </span>
        </div>
        {rows.length === 0 ? (
          <div className="text-muted-foreground p-6 text-center text-[13.5px]">
            No audit rows match the current filter.
          </div>
        ) : (
          <ul className="divide-border divide-y">
            {rows.map((r) => {
              const actor = actorById.get(r.actorId);
              const isBreakGlass = r.action.startsWith("break_glass_");
              return (
                <li
                  key={r.id}
                  className={
                    "grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-12 sm:gap-3" +
                    (isBreakGlass
                      ? " border-l-2 border-teal-500 bg-teal-50/30 dark:bg-teal-50/5"
                      : "")
                  }
                >
                  <span className="text-muted-foreground text-[11.5px] tabular-nums sm:col-span-2">
                    {r.timestamp.toISOString().replace("T", " ").slice(0, 19)}
                  </span>
                  <span className="text-[12.5px] sm:col-span-3">
                    <span className="text-foreground">{actor?.fullName ?? "(unknown)"}</span>
                    <span className="text-muted-foreground"> · {actor?.email ?? "—"}</span>
                  </span>
                  <span className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.01em] sm:col-span-3">
                    <span
                      className={
                        "rounded-sm px-1.5 py-0.5 " +
                        (isBreakGlass
                          ? "bg-teal-500/15 text-teal-800 dark:text-teal-200"
                          : "bg-muted text-muted-foreground")
                      }
                    >
                      {r.action}
                    </span>
                    <span className="text-muted-foreground">→ {r.targetKind}</span>
                  </span>
                  <span className="text-muted-foreground truncate text-[11.5px] sm:col-span-2">
                    {r.targetId}
                  </span>
                  <span
                    className="text-foreground/80 truncate text-[12px] sm:col-span-2"
                    title={r.reason}
                  >
                    {r.reason}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
