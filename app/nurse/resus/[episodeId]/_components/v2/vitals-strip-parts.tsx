"use client";

import type { GraphPoints } from "./vitals-cells";
import type { TimelineEvent } from "@/lib/resus/types";
import type { ResusVitalsView } from "@/lib/resus/vitals";
import type { DerivedMetrics } from "@/lib/triage/types";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";

import { annotateVitalV2 } from "@/app/nurse/resus/_v2/actions-survey";
import { Button } from "@/components/ui/button";
import { gcsTrend } from "@/lib/resus/disability";
import { artefactFields, FRESH_WINDOW_MIN } from "@/lib/resus/survey/vitals-bands";
import { buildResusVitals } from "@/lib/resus/vitals";
import { QSOFA } from "@/lib/triage/constants";
import { cn } from "@/lib/utils";
import { useDeskCtx } from "./desk-context";
import { toOutcome, useNow } from "./use-desk";

/** Resus Desk v2 — the vitals strip's model and small parts (vitals-strip.tsx). */

export const NUM_KEYS = [
  "hr",
  "rr",
  "spo2",
  "systolicBp",
  "diastolicBp",
  "temperature",
  "glucose",
  "gcs",
  "etco2",
] as const;
export type NumKey = (typeof NUM_KEYS)[number];

interface StripModel {
  /** buildResusVitals over the vitals with artefact values removed. */
  view: ResusVitalsView;
  /** The vital event holding the latest usable value per field. */
  source: Partial<Record<NumKey, string>>;
  /** Newer of vitals GCS and the D components total (one GCS, Q9). */
  gcs: { value: number; points: GraphPoints[]; fromVitals: boolean } | null;
  /** O₂ status recorded with the latest SpO₂ ("air", "O₂ 15 L"). */
  spo2Oxygen: string | null;
}

function o2Status(s: Record<string, unknown>): string | null {
  if (s.oxygen === "air") return "air";
  if (s.oxygen !== "oxygen") return null;
  return typeof s.o2FlowLpm === "number" ? `O₂ ${s.o2FlowLpm} L` : "O₂";
}

export function buildStrip(events: readonly TimelineEvent[]): StripModel {
  const art = artefactFields(events);
  const source: StripModel["source"] = {};
  const gcsPts: (GraphPoints & { vital: boolean })[] = [];
  const vitals: TimelineEvent[] = [];
  let spo2Oxygen: string | null = null;
  for (const e of events) {
    if (e.kind !== "vital") continue;
    const snap = { ...((e.payload.snapshot ?? {}) as Record<string, unknown>) };
    for (const k of Object.keys(snap)) if (art.has(`${e.id}:${k}`)) delete snap[k];
    for (const k of NUM_KEYS) if (typeof snap[k] === "number") source[k] = e.id;
    if (typeof snap.gcs === "number")
      gcsPts.push({ t: e.recordedAt, value: snap.gcs, vital: true });
    if (typeof snap.spo2 === "number") spo2Oxygen = o2Status(snap);
    vitals.push({ ...e, payload: { ...e.payload, snapshot: snap } });
  }
  for (const d of gcsTrend(events)) gcsPts.push({ t: d.at, value: d.total, vital: false });
  gcsPts.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  const last = gcsPts.at(-1);
  return {
    view: buildResusVitals(vitals),
    source,
    gcs: last
      ? {
          value: last.value,
          points: gcsPts.map(({ t, value }) => ({ t, value })),
          fromVitals: last.vital,
        }
      : null,
    spo2Oxygen,
  };
}

/** Mark one cell's latest reading as artefact (reason required). */
export function ArtefactMenu({
  label,
  eventId,
  fields,
  close,
}: {
  label: string;
  eventId: string;
  fields: string[];
  close: () => void;
}) {
  const { store, ui } = useDeskCtx();
  const [reason, setReason] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const markRef = useRef<HTMLButtonElement>(null);
  const wasExpanded = useRef(false);
  const expanded = reason !== null;
  // Cancel unmounts the focused button: hand focus back to "Mark … as artefact" (R3).
  useEffect(() => {
    if (expanded) inputRef.current?.focus();
    else if (wasExpanded.current) markRef.current?.focus();
    wasExpanded.current = expanded;
  }, [expanded]);

  if (eventId.startsWith("pending:"))
    return (
      <p className="text-caption text-muted-foreground mt-2 px-1">
        Saving this reading. Mark it as artefact once it is saved.
      </p>
    );
  if (reason === null)
    return (
      <Button
        ref={markRef}
        variant="secondary"
        className="mt-2 min-h-11 w-full"
        onClick={() => setReason("")}
      >
        Mark {label} as artefact…
      </Button>
    );

  const why = reason.trim();
  function submit(e: FormEvent) {
    e.preventDefault();
    if (why.length < 2) return;
    const episodeId = store.episode.id;
    store.submit({
      label: `Artefact: ${label}`,
      optimistic: () => [
        {
          kind: "note",
          step: null,
          payload: {
            noteKind: "vital_annotation",
            vitalEventId: eventId,
            fields,
            artefact: true,
            reason: why,
            label: `Artefact: ${fields.join(", ")} — ${why}`,
          },
        },
      ],
      run: async ({ clientEventId, recordedAt }) =>
        toOutcome(
          await annotateVitalV2({
            episodeId,
            clientEventId,
            recordedAt,
            vitalEventId: eventId,
            fields,
            reason: why,
          }),
        ),
    });
    ui.toast({ message: `${label} marked as artefact` });
    close();
  }
  return (
    <form onSubmit={submit} className="border-border mt-2 flex flex-col gap-2 border-t pt-2">
      <label className="flex flex-col gap-1">
        <span className="text-caption text-muted-foreground">Why is this reading an artefact?</span>
        <input
          ref={inputRef}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="border-border bg-background text-body-l focus:shadow-focus sm:text-body-s h-11 rounded-md border px-2.5 outline-none focus:border-teal-500"
        />
      </label>
      <p className="text-caption text-muted-foreground">
        It stays in the record and stops driving findings.
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" className="min-h-11" onClick={() => setReason(null)}>
          Cancel
        </Button>
        <Button type="submit" className="min-h-11" disabled={why.length < 2}>
          Mark artefact
        </Button>
      </div>
    </form>
  );
}
/** SI · PP · qSOFA — compact; a flagged one is amber with a ▲ and a word. */
export function DerivedFlags({ d }: { d: DerivedMetrics }) {
  const flags = [
    d.shockIndex != null && {
      k: "SI",
      name: "Shock index",
      v: d.shockIndex.toFixed(2),
      flag: d.shockIndexFlag === "shock" || d.shockIndexFlag === "occult_shock",
    },
    d.pulsePressure != null && {
      k: "PP",
      name: "Pulse pressure",
      v: String(d.pulsePressure),
      flag: d.pulsePressureFlag === "narrow",
    },
    d.qsofa && {
      k: "qSOFA",
      name: "qSOFA",
      v: String(d.qsofa.score),
      flag: d.qsofa.score >= QSOFA.POSITIVE_THRESHOLD,
    },
  ].filter((f) => f !== false && f !== null);
  if (flags.length === 0) return null;
  return (
    <ul
      aria-label="Derived"
      className="border-border text-body-s relative flex shrink-0 items-center gap-2 self-center rounded-lg border px-2.5 py-1.5 font-mono tabular-nums"
    >
      {flags.map((f) => (
        <li
          key={f.k}
          className={cn(
            "whitespace-nowrap",
            f.flag ? "font-medium text-amber-800 dark:text-amber-200" : "text-muted-foreground",
          )}
        >
          {f.flag ? <span aria-hidden>▲ </span> : null}
          <span className="sr-only">
            {f.name} {f.v}
            {f.flag ? ", flagged" : ""}
          </span>
          <span aria-hidden>
            {f.k} {f.v}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** "3 min ago" — ticks every 30 s; amber once past the fresh window (D18). */
export function Freshness({ lastAt, nowMs }: { lastAt: string | null; nowMs: () => number }) {
  const now = useNow(nowMs, 30_000);
  if (!lastAt)
    return (
      <span className="text-caption text-muted-foreground whitespace-nowrap">No vitals yet</span>
    );
  const min = Math.max(0, Math.floor((now - Date.parse(lastAt)) / 60_000));
  const old = min > FRESH_WINDOW_MIN;
  const text =
    min < 1
      ? "just now"
      : min < 60
        ? `${min} min ago`
        : `${Math.floor(min / 60)} h ${min % 60} min ago`;
  return (
    <span
      suppressHydrationWarning
      title={old ? `Older than ${FRESH_WINDOW_MIN} min: no longer drives findings` : undefined}
      className={cn(
        "text-caption min-w-16 text-right whitespace-nowrap tabular-nums",
        old ? "text-amber-800 dark:text-amber-200" : "text-muted-foreground",
      )}
    >
      {text}
    </span>
  );
}
