"use client";

import type { GraphPoints, VitalTone } from "./vitals-cells";
import type { NumKey } from "./vitals-strip-parts";
import { useMemo } from "react";
import { PlusIcon, RotateCcwIcon, XIcon } from "lucide-react";

import { ADULT_MIN_AGE_YEARS } from "@/lib/resus/survey/vitals-bands";
import { vitalBand, vitalTrend, vitalTrendLabel } from "@/lib/resus/vital-trend";
import { cn } from "@/lib/utils";
import { useDeskCtx } from "./desk-context";
import { VitalsCapture } from "./vitals-capture";
import { VitalCell } from "./vitals-cells";
import { ArtefactMenu, buildStrip, DerivedFlags, Freshness } from "./vitals-strip-parts";

/**
 * Resus Desk v2 — the vitals strip (prompt §5.6, GATE A §2/§5). Latest value per
 * vital with its trend, the derived flags, the age of the set and the amber
 * re-check nudge (E7). A value marked artefact stays in the record and leaves
 * the strip, the derived flags and the findings (SV-VIT-16).
 */

const BAND_WORD: Partial<Record<VitalTone, string>> = {
  critical: "critical",
  abnormal: "out of range",
  borderline: "borderline",
};

/** One strip cell: the shared VitalCell + the artefact menu. */
function StripCell({
  label,
  unit,
  bandKey,
  value,
  points,
  secondary,
  decimals,
  display,
  sub,
  tone,
  artefact,
}: {
  label: string;
  unit: string;
  /** The vitalBand / reference key ("" for children — no adult bands). */
  bandKey: string;
  value: number | null | undefined;
  points: GraphPoints[];
  secondary?: { label: string; points: GraphPoints[] } | null;
  decimals?: number;
  display?: string;
  sub?: string | null;
  tone?: VitalTone;
  artefact: { eventId: string; fields: string[] } | null;
}) {
  const { store } = useDeskCtx();
  const t = tone ?? vitalBand(bandKey, value);
  const trend = points.length > 0 ? vitalTrend(bandKey, points) : null;
  const base =
    display != null
      ? `${label} ${display} ${unit}`.trim()
      : trend
        ? vitalTrendLabel(label, unit, trend)
        : `${label} not recorded`;
  const word = BAND_WORD[t];
  return (
    <VitalCell
      tile={{ key: bandKey, label, unit }}
      value={value}
      tone={t}
      trend={trend}
      points={points}
      secondary={secondary}
      decimals={decimals}
      display={display}
      sub={sub ?? null}
      ariaLabel={`${base}${sub ? `, ${sub}` : ""}${word ? `, ${word}` : ""}`}
      menu={
        artefact && !store.readOnly
          ? (close) => <ArtefactMenu label={label} close={close} {...artefact} />
          : undefined
      }
    />
  );
}

const PLAIN_CELLS = [
  { key: "rr", label: "RR", unit: "/min" },
  { key: "temperature", label: "Temp", unit: "°C", decimals: 1 },
  { key: "glucose", label: "Glucose", unit: "mmol/L", decimals: 1 },
] as const;

export function VitalsStrip() {
  const { store, ui, survey, ageYears } = useDeskCtx();
  const capture = ui.vitalsCapture;
  const m = useMemo(() => buildStrip(store.activeEvents), [store.activeEvents]);
  const { view, source } = m;
  // Law 7: a child (< 16) never sees an adult band, score or reference line.
  const child = ageYears != null && ageYears < ADULT_MIN_AGE_YEARS;
  const band = (k: string) => (child ? "" : k);
  const pts = (k: string) => view.series.find((s) => s.key === k)?.points ?? [];
  const art = (k: NumKey, fields: string[] = [k]) =>
    source[k] ? { eventId: source[k]!, fields } : null;
  const stale = survey.signals.vitalsStale;
  const { latest } = view;
  const sbp = latest.systolicBp;
  const map = view.derived.meanArterialPressure;
  const acvpu = latest.consciousness ?? null;
  const etco2 = pts("etco2");

  return (
    <section id="vitals-strip" aria-label="Vitals" className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        {/* Spec §5.1 lets the strip scroll sideways on phones; this build wraps
            instead, in the fixed clinical order, so a critical value is never
            off-screen (S2). `relative` holds the sr-only text inside the strip. */}
        <div className="relative flex min-w-0 flex-1 flex-wrap items-stretch gap-2 px-px py-1">
          <StripCell
            label="HR"
            unit="/min"
            bandKey={band("hr")}
            value={latest.hr}
            points={pts("hr")}
            artefact={art("hr")}
          />
          <StripCell
            label="BP"
            unit="mmHg"
            bandKey={band("systolicBp")}
            value={sbp}
            display={sbp != null ? `${sbp}/${latest.diastolicBp ?? "—"}` : undefined}
            sub={map != null && sbp != null ? `MAP ${Math.round(map)}` : null}
            points={pts("systolicBp")}
            secondary={{ label: "DBP", points: pts("diastolicBp") }}
            artefact={art(
              "systolicBp",
              source.diastolicBp === source.systolicBp
                ? ["systolicBp", "diastolicBp"]
                : ["systolicBp"],
            )}
          />
          <StripCell
            label="SpO₂"
            unit="%"
            bandKey={band("spo2")}
            value={latest.spo2}
            sub={latest.spo2 != null ? m.spo2Oxygen : null}
            points={pts("spo2")}
            artefact={art("spo2")}
          />
          {PLAIN_CELLS.map((c) => (
            <StripCell
              key={c.key}
              label={c.label}
              unit={c.unit}
              bandKey={band(c.key)}
              value={latest[c.key]}
              decimals={"decimals" in c ? c.decimals : undefined}
              points={pts(c.key)}
              artefact={art(c.key)}
            />
          ))}
          <StripCell
            label={m.gcs || !acvpu ? "GCS" : "ACVPU"}
            unit=""
            bandKey="gcs"
            value={m.gcs?.value ?? null}
            display={!m.gcs && acvpu ? acvpu : undefined}
            tone={!m.gcs && acvpu ? "normal" : undefined}
            sub={m.gcs && acvpu ? `ACVPU ${acvpu}` : null}
            points={m.gcs?.points ?? []}
            artefact={m.gcs?.fromVitals ? art("gcs") : null}
          />
          {etco2.length > 0 ? (
            <StripCell
              label="EtCO₂"
              unit="kPa"
              bandKey={band("etco2")}
              value={latest.etco2}
              decimals={1}
              points={etco2}
              artefact={art("etco2")}
            />
          ) : !store.readOnly ? (
            <button
              type="button"
              aria-label="Record EtCO₂"
              onClick={() => ui.openVitals({ focus: "etco2" })}
              className="tap border-border text-body-s text-muted-foreground hover:bg-muted flex min-h-19 shrink-0 items-center gap-1 rounded-lg border border-dashed px-3 whitespace-nowrap"
            >
              <PlusIcon className="size-4" aria-hidden />
              EtCO₂
            </button>
          ) : null}
          {child ? null : <DerivedFlags d={view.derived} />}
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 sm:min-h-21 sm:py-1">
          <Freshness lastAt={view.lastAt} nowMs={store.nowMs} />
          {store.readOnly ? null : (
            <button
              id="record-vitals"
              type="button"
              aria-expanded={capture !== null}
              onClick={() => (capture ? ui.closeVitals() : ui.openVitals())}
              className={cn(
                "tap text-body-s inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 font-medium whitespace-nowrap",
                stale && !capture
                  ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-500/50 dark:bg-amber-950/30 dark:text-amber-100"
                  : "border-border bg-card text-foreground hover:bg-muted",
              )}
            >
              {capture ? (
                <XIcon className="size-4" aria-hidden />
              ) : stale ? (
                <RotateCcwIcon className="size-4" aria-hidden />
              ) : (
                <PlusIcon className="size-4" aria-hidden />
              )}
              {capture ? "Close" : stale ? "Re-check vitals" : "Record vitals"}
            </button>
          )}
        </div>
      </div>
      {capture && !store.readOnly ? (
        <VitalsCapture focusField={capture.focus} onClose={ui.closeVitals} />
      ) : null}
    </section>
  );
}
