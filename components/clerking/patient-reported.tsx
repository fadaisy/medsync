"use client";

import type { History } from "@/lib/clerking/answers";
import { LockIcon } from "lucide-react";

import { Tag } from "@/components/medsync/tag";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * What the patient wrote on their phone (ADR 0414), at the top of the history step it belongs to:
 * patient-reported, not yet confirmed. Confirm puts it in this note (or, for an allergy, on the
 * allergy record with the patient as source); Dismiss hides it for this visit. Nothing is taken
 * as true on its own. Hook-free, so the tests press it.
 */

export interface ReportedRow {
  key: string;
  label: string;
  line: string | null;
  sensitive: boolean;
  /** Absent: the patient's own words, which have no catalogue entry to confirm into. */
  onConfirm?: () => void;
  /** The ids this row stands for (a family condition in two relatives is two rows). */
  ids: readonly string[];
}

export function PatientReported({
  rows,
  confirmLabel = "Confirm",
  editable,
  onHistory,
  footnote,
}: {
  rows: readonly ReportedRow[];
  confirmLabel?: string;
  editable: boolean;
  onHistory: (update: (h: History) => History) => void;
  footnote?: string;
}) {
  if (!rows.length) return null;
  const dismiss = (ids: readonly string[]) =>
    onHistory((h) => ({
      ...h,
      reportedDismissed: [...new Set([...(h.reportedDismissed ?? []), ...ids])],
    }));
  return (
    <div
      data-patient-reported
      className="border-ink-300 dark:border-ink-600 flex flex-col gap-2 rounded-md border border-dashed p-3"
    >
      <Tag hue="sky">Patient-reported, not yet confirmed</Tag>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-body-s text-foreground inline-flex items-center gap-1.5 font-medium">
                {r.label}
                {r.sensitive ? (
                  <span title="Restricted" className="text-muted-foreground inline-flex">
                    <LockIcon aria-hidden className="size-3" />
                    <span className="sr-only">Restricted</span>
                  </span>
                ) : null}
              </span>
              {r.line ? <span className="text-caption text-muted-foreground">{r.line}</span> : null}
            </span>
            {editable ? (
              <span className={cn("flex gap-1.5")}>
                {r.onConfirm ? (
                  <Button size="sm" variant="secondary" onClick={r.onConfirm}>
                    {confirmLabel}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Dismiss ${r.label}`}
                  onClick={() => dismiss(r.ids)}
                >
                  Dismiss
                </Button>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="text-caption text-muted-foreground">
        {footnote ??
          "From the patient's phone. Ask before you confirm; their own words are not on the list, so add them yourself if right."}
      </p>
    </div>
  );
}
