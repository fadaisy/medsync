"use client";

import type { CarriedVitals } from "../actions";
import type { RecordedVitals } from "@/lib/clerkship/exam/types";
import type { AdultVitals } from "@/lib/triage/types";
import { useEffect, useMemo, useState } from "react";
import { ActivityIcon, ArrowDownIcon, ArrowUpIcon } from "lucide-react";

import { scoreNews2 } from "@/lib/triage/scoring/news2";
import { loadTriageVitalsAction } from "../actions";

/**
 * Vitals — carry the triage set forward (read-only) + record a new set. Interp
 * REUSES the triage NEWS2 scorer (no new thresholds); the "scores 0 ≠ normal"
 * discipline is held (the score is shown, never conflated with "clinically
 * well"). Recorded sets attach to the encounter; the monitoring engine isn't
 * built yet (honest state). Decision-support, not autonomous.
 */

const NUM =
  "border-input bg-card w-16 rounded px-1.5 py-1 text-[12px] tabular-nums outline-none focus-visible:border-teal-500";

/** RecordedVitals → AdultVitals for the NEWS2 scorer (defaults: scale 1, air). */
function toAdult(v: RecordedVitals): AdultVitals {
  return {
    respiratoryRate: v.rr ?? null,
    spo2: v.spo2 ?? null,
    spo2Scale: "scale1",
    oxygen: "air",
    systolicBp: v.sbp ?? null,
    pulse: v.hr ?? null,
    // NEWS2 only distinguishes Alert vs not — map GCS<15 → non-alert (3 pts).
    consciousness: v.gcs == null ? null : v.gcs >= 15 ? "A" : "V",
    temperature: v.tempC ?? null,
  };
}

export function VitalsPanel({
  encounterId,
  value,
  onChange,
}: {
  encounterId: string;
  value: RecordedVitals;
  onChange: (v: RecordedVitals) => void;
}) {
  const [carried, setCarried] = useState<CarriedVitals | null>(null);
  useEffect(() => {
    loadTriageVitalsAction(encounterId)
      .then(setCarried)
      .catch(() => setCarried({ vitals: null, triagedAtIso: null }));
  }, [encounterId]);

  const hasNew = Object.values(value).some((x) => x !== undefined && x !== "");
  const news = useMemo(() => (hasNew ? scoreNews2(toAdult(value)) : null), [value, hasNew]);
  const num = (v: number | undefined) => (v == null ? undefined : v);
  const set = (patch: Partial<RecordedVitals>) => onChange({ ...value, ...patch });

  return (
    <div className="border-border/70 flex flex-col gap-3 rounded-xl border p-3.5">
      <span className="text-foreground inline-flex items-center gap-1.5 text-[13px] font-semibold">
        <ActivityIcon className="size-4 text-teal-600 dark:text-teal-400" aria-hidden />
        Vital signs
      </span>

      {/* Carried from triage */}
      {carried?.vitals ? (
        <div className="bg-muted/30 rounded-lg px-3 py-2">
          <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
            Carried from triage
            {carried.triagedAtIso
              ? ` · ${carried.triagedAtIso.slice(0, 16).replace("T", " ")}`
              : ""}
          </span>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11.5px] tabular-nums">
            <Carried label="RR" v={carried.vitals.respiratoryRate} cur={value.rr} />
            <Carried label="SpO₂" v={carried.vitals.spo2} cur={value.spo2} suffix="%" />
            <Carried label="HR" v={carried.vitals.pulse} cur={value.hr} />
            <Carried label="SBP" v={carried.vitals.systolicBp} cur={value.sbp} />
            <Carried label="Temp" v={carried.vitals.temperature} cur={value.tempC} suffix="°C" />
            {carried.vitals.consciousness ? (
              <span className="text-muted-foreground">ACVPU {carried.vitals.consciousness}</span>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-[11.5px]">No triage vitals to carry forward.</p>
      )}

      {/* Record new */}
      <div className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
          Record new set
        </span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Field label="HR" v={value.hr} onV={(n) => set({ hr: n })} />
          <Field label="RR" v={value.rr} onV={(n) => set({ rr: n })} />
          <Field label="SpO₂" v={value.spo2} onV={(n) => set({ spo2: n })} />
          <Field label="SBP" v={value.sbp} onV={(n) => set({ sbp: n })} />
          <Field label="DBP" v={value.dbp} onV={(n) => set({ dbp: n })} />
          <Field label="Temp" v={value.tempC} onV={(n) => set({ tempC: n })} step="0.1" />
          <Field label="Glucose" v={value.glucose} onV={(n) => set({ glucose: n })} step="0.1" />
          <Field label="GCS" v={value.gcs} onV={(n) => set({ gcs: n })} />
        </div>
      </div>

      {/* NEWS2 — score shown; a low score is NOT "normal" */}
      {news ? (
        <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
          <span
            className={`rounded px-1.5 py-0.5 font-mono font-semibold ${news.total >= 5 || news.hasSingleParameterThree ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" : "bg-muted text-foreground"}`}
          >
            NEWS2 {news.total}
            {news.hasSingleParameterThree ? " · red score" : ""}
            {news.provisional ? " · provisional" : ""}
          </span>
          <span className="text-muted-foreground text-[10.5px]">
            a low/0 score is not “normal” — interpret clinically.
          </span>
          {num(value.glucose) != null && (value.glucose! < 4 || value.glucose! > 11) ? (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10.5px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              glucose {value.glucose} — check
            </span>
          ) : null}
        </div>
      ) : null}

      <p className="text-muted-foreground text-[10px]">
        Recorded on the encounter; the monitoring engine isn’t attached yet.
      </p>
    </div>
  );
}

function Carried({
  label,
  v,
  cur,
  suffix,
}: {
  label: string;
  v: number | null;
  cur?: number;
  suffix?: string;
}) {
  if (v == null) return null;
  const Arrow = cur == null ? null : cur > v ? ArrowUpIcon : cur < v ? ArrowDownIcon : null;
  return (
    <span className="text-foreground/80">
      {label} {v}
      {suffix ?? ""}
      {Arrow ? <Arrow className="text-muted-foreground ml-0.5 inline size-3" aria-hidden /> : null}
    </span>
  );
}

function Field({
  label,
  v,
  onV,
  step,
}: {
  label: string;
  v: number | undefined;
  onV: (n: number | undefined) => void;
  step?: string;
}) {
  return (
    <label className="inline-flex items-center gap-1">
      <span className="text-muted-foreground text-[10px]">{label}</span>
      <input
        type="number"
        step={step}
        className={NUM}
        value={v ?? ""}
        onChange={(e) => {
          const n = Number(e.target.value);
          onV(e.target.value === "" || !Number.isFinite(n) ? undefined : n);
        }}
      />
    </label>
  );
}
