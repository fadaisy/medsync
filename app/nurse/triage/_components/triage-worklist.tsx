"use client";

import type { TriageWorklistRow } from "@/lib/triage/worklist";
import { useState } from "react";
import { AlertTriangleIcon, ChevronRightIcon, DoorOpenIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { TriagePanel } from "./triage-panel";

/**
 * The waiting list. Dense rows → slide-out triage panel (the Attio-grade
 * pattern the rest of the workspace uses). Emergency rows are visually
 * prominent; already-triaged-this-visit rows show their prior level.
 */
export function TriageWorklist({
  rows,
  mayDownTriage,
  departmentName,
}: {
  rows: ReadonlyArray<TriageWorklistRow>;
  mayDownTriage: boolean;
  departmentName: string;
}) {
  const [active, setActive] = useState<TriageWorklistRow | null>(null);

  if (rows.length === 0) {
    return (
      <div className="border-border bg-card flex flex-col items-center gap-2 rounded-xl border p-10 text-center">
        <DoorOpenIcon className="text-muted-foreground size-5" strokeWidth={1.5} aria-hidden />
        <p className="text-foreground text-[13.5px] font-medium">No one awaiting triage</p>
        <p className="text-muted-foreground text-[12px]">
          When a patient arrives in {departmentName}, they appear here to be assessed.
        </p>
      </div>
    );
  }

  return (
    <>
      <ul className="border-border bg-card divide-border/60 flex flex-col divide-y overflow-hidden rounded-xl border">
        {rows.map((r) => {
          const who = r.patientCode ?? r.patientUnknownLabel ?? "Unknown patient";
          return (
            <li key={r.intakeId}>
              <button
                type="button"
                onClick={() => setActive(r)}
                className={cn(
                  "hover:bg-mu/30 group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-teal-50/30 dark:hover:bg-teal-50/[0.04]",
                  r.isEmergency && "bg-rose-50/30 dark:bg-rose-950/15",
                )}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-foreground inline-flex items-center gap-1.5 font-mono text-[13px] font-medium tabular-nums">
                    {who}
                    {r.isEmergency ? (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-100 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                        <AlertTriangleIcon className="size-2.5" aria-hidden />
                        ALERT
                      </span>
                    ) : null}
                    {r.priorLevel ? (
                      <span className="text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 font-mono text-[9px]">
                        prev L{r.priorLevel}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground truncate text-[11.5px]">
                    {r.entryTypeName}
                    {r.presentingComplaint ? ` · ${r.presentingComplaint}` : ""}
                  </span>
                </div>
                <span className="text-muted-foreground shrink-0 font-mono text-[10.5px] tabular-nums">
                  {waitedFor(r.arrivedAtIso)}
                </span>
                <ChevronRightIcon
                  className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </button>
            </li>
          );
        })}
      </ul>

      <TriagePanel row={active} mayDownTriage={mayDownTriage} onClose={() => setActive(null)} />
    </>
  );
}

function waitedFor(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return `${h}h${mins % 60 ? ` ${mins % 60}m` : ""}`;
}
