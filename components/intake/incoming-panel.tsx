import type { IntakeRow } from "@/lib/intake/queries";
import Link from "next/link";
import { AlertTriangleIcon, DoorOpenIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Shared incoming-intakes panel for the nurse + doctor home pages.
 *
 * Renders the awaiting-triage list scoped to the caller's department
 * (the caller's page filters by departmentId when fetching). Emergency
 * rows get the rose ring + ALERT pill; the list orders emergency-first
 * already via fetchHospitalIncomingIntakes.
 *
 * The panel is read-only — triage doesn't exist yet, so there's no
 * "start triage" action. Tapping a row opens the hospital-admin intake
 * surface scrolled to that row (the awaiting list there is the
 * canonical detail view today; per-intake routes land with triage).
 */
export function IncomingIntakesPanel({
  rows,
  departmentName,
}: {
  rows: ReadonlyArray<IntakeRow>;
  departmentName: string;
}) {
  return (
    <section
      aria-label="Incoming intakes — awaiting triage"
      className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4"
    >
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10.5px] tracking-[0.14em] uppercase">
          <DoorOpenIcon className="size-3.5" aria-hidden />
          Awaiting triage · {departmentName}
        </h2>
        <span className="text-muted-foreground font-mono text-[10.5px] tabular-nums">
          {rows.length}
        </span>
      </header>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-[12.5px]">
          No one awaiting triage in {departmentName} right now.
        </p>
      ) : (
        <ul className="divide-border/60 -mx-2 flex flex-col divide-y">
          {rows.map((r) => (
            <li key={r.id} className="px-2 py-2.5">
              <IntakeRowItem row={r} />
            </li>
          ))}
        </ul>
      )}

      <p className="text-muted-foreground/80 text-[11px] leading-relaxed">
        Triage is the next build. Today these arrivals sit in{" "}
        <span className="font-mono">awaiting_triage</span> until the triage surface ships.
      </p>
    </section>
  );
}

function IntakeRowItem({ row }: { row: IntakeRow }) {
  const who = row.patientCode ?? row.patientUnknownLabel ?? "Unknown patient";
  const referrer = row.referringHospitalName ?? row.referringFacilityOther;

  return (
    <div
      className={cn(
        "-mx-2 flex flex-col gap-1 rounded-md p-2",
        row.isEmergency && "bg-rose-50/30 ring-1 ring-rose-500/40 dark:bg-rose-950/15",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-foreground inline-flex items-center gap-1.5 text-[12.5px] font-medium">
          {who}
          {row.isEmergency ? (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-100 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              <AlertTriangleIcon className="size-2.5" aria-hidden />
              ALERT
            </span>
          ) : null}
        </span>
        <span className="text-muted-foreground font-mono text-[10.5px] tabular-nums">
          {formatRelative(row.arrivedAtIso)}
        </span>
      </div>
      <span className="text-muted-foreground text-[11.5px] leading-snug">
        {row.entryTypeName}
        {referrer ? ` · from ${referrer}` : ""}
        {row.broughtBy ? ` · brought by ${row.broughtBy}` : ""}
      </span>
      {row.presentingComplaint ? (
        <span className="text-foreground/90 text-[12px] leading-snug">
          {truncate(row.presentingComplaint, 140)}
        </span>
      ) : null}
    </div>
  );
}

function formatRelative(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…";
}

// Reserved for the next iteration when we add a per-intake detail
// route — link to that destination then. Today the hospital-admin
// intake page is the canonical view of the awaiting list.
void Link;
