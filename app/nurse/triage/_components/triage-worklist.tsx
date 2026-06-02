import type { TriageWorklistRow } from "@/lib/triage/worklist";
import Link from "next/link";
import { AlertTriangleIcon, DoorOpenIcon, RotateCwIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { OpenResusButton } from "./open-resus-button";
import { RapidRedButton } from "./rapid-red-button";

/**
 * The triage worklist. Each patient shows by NAME (audited reveal) +
 * code + auto-age, and navigates to the full-page triage desk at
 * /nurse/triage/[intakeId]. Already-triaged patients stay listed with
 * their acuity for re-triage.
 */

const ACUITY: Record<number, { label: string; dot: string; text: string }> = {
  1: { label: "L1", dot: "bg-rose-600", text: "text-rose-700 dark:text-rose-300" },
  2: { label: "L2", dot: "bg-orange-500", text: "text-orange-700 dark:text-orange-300" },
  3: { label: "L3", dot: "bg-amber-400", text: "text-amber-700 dark:text-amber-300" },
  4: { label: "L4", dot: "bg-teal-600", text: "text-teal-700 dark:text-teal-300" },
  5: { label: "L5", dot: "bg-slate-400", text: "text-slate-600 dark:text-slate-300" },
};

export function TriageWorklist({
  rows,
  departmentName,
}: {
  rows: ReadonlyArray<TriageWorklistRow>;
  departmentName: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="border-border bg-card flex flex-col items-center gap-2 rounded-xl border p-12 text-center">
        <DoorOpenIcon className="text-muted-foreground size-5" strokeWidth={1.5} aria-hidden />
        <p className="text-foreground text-[13.5px] font-medium">No one to triage</p>
        <p className="text-muted-foreground text-[12px]">
          When a patient arrives in {departmentName}, they appear here to be assessed.
        </p>
      </div>
    );
  }

  return (
    <ul className="border-border bg-card divide-border/60 flex flex-col divide-y overflow-hidden rounded-xl border">
      {rows.map((r) => {
        const name = r.displayName ?? r.patientUnknownLabel ?? "Unidentified patient";
        const triaged = r.priorLevel != null;
        const acuity = triaged ? ACUITY[r.priorLevel!] : null;
        const meta = [
          r.patientCode,
          r.ageYears != null ? `${r.ageYears}y` : null,
          r.sex ? sexShort(r.sex) : null,
        ]
          .filter(Boolean)
          .join(" · ");

        return (
          <li
            key={r.intakeId}
            className={cn(
              "flex items-stretch",
              r.isEmergency && "bg-rose-50/40 dark:bg-rose-950/15",
            )}
          >
            <Link
              href={`/nurse/triage/${r.intakeId}`}
              className="group flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-teal-50/40 dark:hover:bg-teal-50/[0.04]"
            >
              {/* Acuity dot rail */}
              <span
                aria-hidden
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  acuity ? acuity.dot : "bg-border ring-border ring-2",
                )}
              />

              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-foreground flex items-center gap-1.5 truncate text-[13.5px] font-medium">
                  {name}
                  {r.isEmergency ? (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-100 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                      <AlertTriangleIcon className="size-2.5" aria-hidden />
                      ALERT
                    </span>
                  ) : null}
                </span>
                <span className="text-muted-foreground truncate font-mono text-[11px] tabular-nums">
                  {meta}
                  {r.presentingComplaint ? (
                    <span className="font-sans"> · {r.presentingComplaint}</span>
                  ) : null}
                </span>
              </div>

              {acuity ? (
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 font-mono text-[10.5px] font-semibold tabular-nums",
                    acuity.text,
                  )}
                >
                  <RotateCwIcon className="size-3" aria-hidden />
                  {acuity.label} · re-triage
                </span>
              ) : (
                <span className="text-muted-foreground shrink-0 font-mono text-[10.5px] tabular-nums">
                  {waitedFor(r.arrivedAtIso)}
                </span>
              )}
            </Link>

            {r.priorLevel === 1 ? (
              <OpenResusButton intakeId={r.intakeId} />
            ) : (
              <RapidRedButton
                intakeId={r.intakeId}
                patientUserId={r.patientUserId}
                patientLabel={name}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function sexShort(sex: string): string {
  const s = sex.toLowerCase();
  if (s.startsWith("m")) return "M";
  if (s.startsWith("f")) return "F";
  return sex;
}

function waitedFor(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return `${h}h${mins % 60 ? ` ${mins % 60}m` : ""}`;
}
