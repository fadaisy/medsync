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
 * REUSES the triage NEWS2 scorer (no new thresholds) and COLOUR-CODES each vital
 * by its NEWS2 parameter points (0 normal · 1–2 borderline · 3 critical). The
 * "scores 0 ≠ normal" discipline holds. Recorded sets attach to the encounter;
 * the monitoring engine isn't built (honest state). Decision-support.
 */

/** Per-NEWS2-points colour (value text). */
function tone(points: number | undefined): string {
  if (points == null) return "text-foreground/80";
  if (points >= 3) return "text-red-700 dark:text-red-400";
  if (points >= 1) return "text-amber-700 dark:text-amber-400";
  return "text-teal-700 dark:text-teal-400";
}
function inputTone(points: number | undefined): string {
  if (points == null) return "border-input";
  if (points >= 3) return "border-red-400 dark:border-red-700";
  if (points >= 1) return "border-amber-400 dark:border-amber-600";
  return "border-teal-400 dark:border-teal-700";
}

/** RecordedVitals → AdultVitals for the NEWS2 scorer (defaults: scale 1, air). */
function toAdult(v: RecordedVitals): AdultVitals {
  return {
    respiratoryRate: v.rr ?? null,
    spo2: v.spo2 ?? null,
    spo2Scale: "scale1",
    oxygen: "air",
    systolicBp: v.sbp ?? null,
    pulse: v.hr ?? null,
    consciousness: v.gcs == null ? null : v.gcs >= 15 ? "A" : "V",
    temperature: v.tempC ?? null,
  };
}

/** parameter-key → points from a NEWS2 result. */
function pointsMap(adult: AdultVitals): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of scoreNews2(adult).parameters) if (p.present) out[p.parameter] = p.points;
  return out;
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
  const pts = useMemo(() => (hasNew ? pointsMap(toAdult(value)) : {}), [value, hasNew]);
  const carriedPts = useMemo(() => (carried?.vitals ? pointsMap(carried.vitals) : {}), [carried]);
  const set = (patch: Partial<RecordedVitals>) => onChange({ ...value, ...patch });

  const totalTone = !news
    ? "bg-muted text-foreground"
    : news.hasSingleParameterThree || news.total >= 7
      ? "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300"
      : news.total >= 5
        ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
        : "bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300";

  return (
    <div className="border-border/70 flex flex-col gap-2.5 rounded-xl border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-foreground inline-flex items-center gap-1.5 text-[13px] font-semibold">
          <ActivityIcon className="size-4 text-teal-600 dark:text-teal-400" aria-hidden />
          Vital signs
        </span>
        {news ? (
          <span
            className={`rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold ${totalTone}`}
          >
            NEWS2 {news.total}
            {news.hasSingleParameterThree ? " · red" : ""}
            {news.provisional ? " · prov" : ""}
          </span>
        ) : null}
        <span className="text-muted-foreground text-[10px]">a low/0 score ≠ “normal”</span>
      </div>

      {/* Carried from triage — colour-coded */}
      {carried?.vitals ? (
        <div className="bg-muted/30 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2.5 py-1.5 font-mono text-[11px] tabular-nums">
          <span className="text-muted-foreground mr-1 font-sans text-[10px] tracking-wide uppercase">
            Triage
            {carried.triagedAtIso ? ` ${carried.triagedAtIso.slice(5, 16).replace("T", " ")}` : ""}
          </span>
          <Carried
            label="RR"
            v={carried.vitals.respiratoryRate}
            cur={value.rr}
            pts={carriedPts.respiratory_rate}
          />
          <Carried
            label="SpO₂"
            v={carried.vitals.spo2}
            cur={value.spo2}
            pts={carriedPts.spo2}
            suffix="%"
          />
          <Carried label="HR" v={carried.vitals.pulse} cur={value.hr} pts={carriedPts.pulse} />
          <Carried
            label="SBP"
            v={carried.vitals.systolicBp}
            cur={value.sbp}
            pts={carriedPts.systolic_bp}
          />
          <Carried
            label="T"
            v={carried.vitals.temperature}
            cur={value.tempC}
            pts={carriedPts.temperature}
            suffix="°"
          />
          {carried.vitals.consciousness ? (
            <span className={tone(carriedPts.consciousness)}>{carried.vitals.consciousness}</span>
          ) : null}
        </div>
      ) : null}

      {/* Record new — colour-coded inputs */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span className="text-muted-foreground text-[10px] tracking-wide uppercase">New set</span>
        <Field label="HR" v={value.hr} onV={(n) => set({ hr: n })} pts={pts.pulse} />
        <Field label="RR" v={value.rr} onV={(n) => set({ rr: n })} pts={pts.respiratory_rate} />
        <Field label="SpO₂" v={value.spo2} onV={(n) => set({ spo2: n })} pts={pts.spo2} />
        <Field label="SBP" v={value.sbp} onV={(n) => set({ sbp: n })} pts={pts.systolic_bp} />
        <Field label="DBP" v={value.dbp} onV={(n) => set({ dbp: n })} />
        <Field
          label="T°"
          v={value.tempC}
          onV={(n) => set({ tempC: n })}
          pts={pts.temperature}
          step="0.1"
        />
        <Field
          label="Gluc"
          v={value.glucose}
          onV={(n) => set({ glucose: n })}
          step="0.1"
          tone={
            value.glucose != null && (value.glucose < 4 || value.glucose > 11) ? "amber" : undefined
          }
        />
        <Field label="GCS" v={value.gcs} onV={(n) => set({ gcs: n })} pts={pts.consciousness} />
      </div>
      <p className="text-muted-foreground text-[10px]">
        Recorded on the encounter; monitoring engine not attached yet.
      </p>
    </div>
  );
}

function Carried({
  label,
  v,
  cur,
  pts,
  suffix,
}: {
  label: string;
  v: number | null;
  cur?: number;
  pts?: number;
  suffix?: string;
}) {
  if (v == null) return null;
  const Arrow = cur == null ? null : cur > v ? ArrowUpIcon : cur < v ? ArrowDownIcon : null;
  return (
    <span className={tone(pts)}>
      {label} {v}
      {suffix ?? ""}
      {Arrow ? <Arrow className="ml-0.5 inline size-3 opacity-70" aria-hidden /> : null}
    </span>
  );
}

function Field({
  label,
  v,
  onV,
  pts,
  step,
  tone: toneOverride,
}: {
  label: string;
  v: number | undefined;
  onV: (n: number | undefined) => void;
  pts?: number;
  step?: string;
  tone?: "amber";
}) {
  const border =
    toneOverride === "amber" ? "border-amber-400 dark:border-amber-600" : inputTone(pts);
  return (
    <label className="inline-flex items-center gap-1">
      <span className="text-muted-foreground text-[10px]">{label}</span>
      <input
        type="number"
        step={step}
        className={`bg-card w-14 rounded border px-1.5 py-1 text-[12px] tabular-nums outline-none focus-visible:border-teal-500 ${border}`}
        value={v ?? ""}
        onChange={(e) => {
          const n = Number(e.target.value);
          onV(e.target.value === "" || !Number.isFinite(n) ? undefined : n);
        }}
      />
    </label>
  );
}
