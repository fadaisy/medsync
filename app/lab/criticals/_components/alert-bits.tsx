import type { ResponseTimes } from "@/lib/lab/criticals/escalation";
import type { AlertSummary } from "@/lib/lab/criticals/read";
import { TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { alertCell } from "@/lib/lab/criticals/words";

/**
 * Small pieces the lab's Criticals screens share. The values are the patient's numbers as released,
 * in plain type: the critical tint belongs to the doctor's pinned alert and the Critical pill only
 * (D-LAB1-18). Every state is a word (Law 10).
 */

export function MarkedValues({ alert }: { alert: Pick<AlertSummary, "marked" | "test"> }) {
  if (alert.marked.length === 0) return <span>{alert.test}</span>;
  return (
    <span className="inline-flex flex-col">
      {alert.marked.map((m) => (
        <span key={m.conceptId}>
          {m.display}{" "}
          <span className="font-mono font-medium tabular-nums">
            {m.value}
            {m.unit ? ` ${m.unit}` : ""}
          </span>
          {m.direction ? <span className="text-muted-foreground">, {m.direction}</span> : null}
        </span>
      ))}
    </span>
  );
}

export function AlertCell({
  alert,
  now,
  times,
  time,
}: {
  alert: AlertSummary;
  now: Date;
  times: ResponseTimes | null;
  time: (d: Date) => string;
}) {
  const c = alertCell(alert, now, times, time);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <StatusWord tone={c.tone}>{c.text}</StatusWord>
      {alert.correctionOf ? <StatusWord>Correction</StatusWord> : null}
    </span>
  );
}

/** A standing notice in words: amber, a triangle and the sentence (Law 4, Law 10). */
export function Caution({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="bg-status-caution-bg border-status-caution-bg text-body-s dark:text-status-caution-fg flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-amber-800"
    >
      <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <p>{children}</p>
    </div>
  );
}
