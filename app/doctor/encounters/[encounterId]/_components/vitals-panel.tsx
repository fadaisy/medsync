"use client";

import type { CarriedVitals } from "../actions";
import type { BpStandard } from "@/lib/clerkship/exam/bp";
import type { RecordedVitals } from "@/lib/clerkship/exam/types";
import type { AdultVitals } from "@/lib/triage/types";
import { useEffect, useMemo, useState } from "react";
import { ActivityIcon, ArrowDownIcon, ArrowUpIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { BP_BORDER_TONE, BP_STANDARDS, BP_TEXT_TONE, bpCategory } from "@/lib/clerkship/exam/bp";
import { gcsTotal } from "@/lib/clerkship/exam/types";
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
    // NEWS2 only distinguishes Alert vs not — GCS total <15 → non-alert (3 pts).
    consciousness: (() => {
      const t = gcsTotal(v);
      return t == null ? null : t >= 15 ? "A" : "V";
    })(),
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
  // BP reference standard the clinician reads against (chronic-disease context).
  const [bpStandard, setBpStandard] = useState<BpStandard>("who_esc");
  const bpCat = bpCategory(value.sbp, value.dbp, bpStandard);

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
            key={totalTone}
            className={`scale-in rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums ${totalTone}`}
          >
            NEWS2 {news.total}
            {news.hasSingleParameterThree ? " · red" : ""}
            {news.provisional ? " · prov" : ""}
          </span>
        ) : null}
        <span className="text-muted-foreground text-[10px]">a low/0 score ≠ “normal”</span>
      </div>

      {/* Carried from triage — colour-coded */}
      {carried === null ? <Skeleton className="h-8 rounded-lg" /> : null}
      {carried?.vitals ? (
        <div className="bg-muted/30 ring-border/50 fade-in-slow flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2.5 py-1.5 font-mono text-[11px] tabular-nums ring-1 ring-inset">
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
        {/* BP — interpreted by hypertension reference category (not NEWS2). */}
        <Field
          label="SBP"
          v={value.sbp}
          onV={(n) => set({ sbp: n })}
          borderClass={bpCat ? BP_BORDER_TONE[bpCat.severity] : undefined}
        />
        <Field
          label="DBP"
          v={value.dbp}
          onV={(n) => set({ dbp: n })}
          borderClass={bpCat ? BP_BORDER_TONE[bpCat.severity] : undefined}
        />
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
      </div>

      {/* BP reference category — clinician selects the standard (WHO/ESC default) */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-muted-foreground text-[10px] tracking-wide uppercase">BP</span>
        <div className="border-border inline-flex overflow-hidden rounded-md border">
          {BP_STANDARDS.map((s, i) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={bpStandard === s.value}
              onClick={() => setBpStandard(s.value)}
              className={`tap px-2 py-0.5 text-[10.5px] font-medium transition-colors ${i > 0 ? "border-border border-l" : ""} ${
                bpStandard === s.value
                  ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  : "text-muted-foreground/70 hover:bg-muted/60"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {bpCat ? (
          <span
            key={bpCat.label}
            className={`scale-in text-[11px] font-medium ${BP_TEXT_TONE[bpCat.severity]}`}
          >
            {bpCat.label}
          </span>
        ) : (
          <span className="text-muted-foreground text-[10px]">enter SBP / DBP</span>
        )}
      </div>

      {/* GCS by component (Eye / Verbal / Motor) → total */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="text-muted-foreground text-[10px] tracking-wide uppercase">GCS</span>
        <GcsSelect label="E" v={value.gcsE} max={4} onV={(n) => set({ gcsE: n })} />
        <GcsSelect label="V" v={value.gcsV} max={5} onV={(n) => set({ gcsV: n })} />
        <GcsSelect label="M" v={value.gcsM} max={6} onV={(n) => set({ gcsM: n })} />
        {gcsTotal(value) != null ? (
          <span
            key={gcsTotal(value)! <= 8 ? "crit" : gcsTotal(value)! < 15 ? "caution" : "full"}
            className={`scale-in rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums ${
              gcsTotal(value)! <= 8
                ? "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300"
                : gcsTotal(value)! < 15
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                  : "bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300"
            }`}
          >
            GCS {gcsTotal(value)}/15
          </span>
        ) : (
          <span className="text-muted-foreground text-[10px]">/15</span>
        )}
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

function GcsSelect({
  label,
  v,
  max,
  onV,
}: {
  label: string;
  v: number | undefined;
  max: number;
  onV: (n: number | undefined) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1">
      <span className="text-muted-foreground text-[10px]">{label}</span>
      <select
        className="tap border-input bg-card rounded border px-1 py-1 text-[12px] tabular-nums transition-colors outline-none hover:border-gray-300 focus-visible:border-teal-500"
        value={v ?? ""}
        onChange={(e) => onV(e.target.value === "" ? undefined : Number(e.target.value))}
        aria-label={`GCS ${label}`}
      >
        <option value="">–</option>
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}

function Field({
  label,
  v,
  onV,
  pts,
  step,
  tone: toneOverride,
  borderClass,
}: {
  label: string;
  v: number | undefined;
  onV: (n: number | undefined) => void;
  pts?: number;
  step?: string;
  tone?: "amber";
  /** Explicit border colour override (e.g. BP hypertension category). */
  borderClass?: string;
}) {
  const border =
    borderClass ??
    (toneOverride === "amber" ? "border-amber-400 dark:border-amber-600" : inputTone(pts));
  return (
    <label className="inline-flex items-center gap-1">
      <span className="text-muted-foreground text-[10px]">{label}</span>
      <input
        type="number"
        step={step}
        className={`bg-card w-14 rounded border px-1.5 py-1 text-[12px] tabular-nums transition-colors duration-300 outline-none focus-visible:border-teal-500 ${border}`}
        value={v ?? ""}
        onChange={(e) => {
          const n = Number(e.target.value);
          onV(e.target.value === "" || !Number.isFinite(n) ? undefined : n);
        }}
      />
    </label>
  );
}
