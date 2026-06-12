"use client";

import type { ChestModality } from "./chest-zone-map";
import type { ThreeStateValue } from "./exam-kit";
import type { AddedSound, RespExam, RespZone } from "@/lib/clerkship/exam/respiratory";
import type { ExamFinding, ExamObservation, FindingState } from "@/lib/clerkship/exam/types";
import { useMemo, useState } from "react";
import { AlertTriangleIcon, CircleDashedIcon, ShieldAlertIcon } from "lucide-react";

import {
  ADDED_OPTS,
  BREATH_OPTS,
  matchRespPatterns,
  normalRespExam,
  PERCUSSION_OPTS,
  renderRespProse,
  RESP_FINDINGS,
  RESP_ZONES,
  VR_OPTS,
} from "@/lib/clerkship/exam/respiratory";
import { cn } from "@/lib/utils";
import { ChestZoneMap } from "./chest-zone-map";
import { ChipRow, NormalExamButton, StageCard, ThreeState, ValueChip } from "./exam-kit";

/**
 * Respiratory examination — REWORKED PRESENTATION onto the shared Examination kit.
 * Same RespExam data, handlers, value-sets and behaviour as before; restructured
 * into the clinical IPPA sequence as numbered StageCards, with the chest zonal
 * map as the signature spatial control (percussion / breath sounds / vocal
 * resonance / added sounds per zone & side). The sign-cluster → pattern
 * suggestion is surfaced transparently (multiple on ambiguity, must-not-miss /
 * emergency flagged) as DECISION-SUPPORT — never an auto-diagnosis. not-examined
 * ≠ normal. Peripheral signs (clubbing/cyanosis/nodes/JVP) reused from the
 * general exam.
 */

const seg = (active: boolean, tone: "muted" | "teal" = "muted") =>
  `tap inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset transition-colors duration-150 ${
    active
      ? tone === "teal"
        ? "bg-teal-50 text-teal-700 ring-teal-500/40 dark:bg-teal-950/40 dark:text-teal-200"
        : "bg-slate-100 text-slate-700 ring-slate-400/50 dark:bg-slate-800 dark:text-slate-200"
      : "text-muted-foreground ring-border hover:bg-muted/60"
  }`;

type Modality = "percussion" | "breathSounds" | "vocalResonance" | "added";
const MOD_OPTS = {
  percussion: PERCUSSION_OPTS,
  breathSounds: BREATH_OPTS,
  vocalResonance: VR_OPTS,
} as const;
const MOD_LABEL: Record<Modality, string> = {
  percussion: "Percussion",
  breathSounds: "Breath sounds",
  vocalResonance: "Vocal resonance",
  added: "Added sounds",
};

export function RespiratoryExam({
  value,
  onChange,
}: {
  value: RespExam;
  onChange: (next: RespExam) => void;
}) {
  const [modality, setModality] = useState<Modality>("percussion");
  const [activeZone, setActiveZone] = useState<RespZone | null>(null);

  const findings = value.findings ?? [];
  const byCode = useMemo(() => new Map(findings.map((o) => [o.code, o])), [findings]);
  const patterns = useMemo(() => matchRespPatterns(value), [value]);

  const setFinding = (code: string, patch: Partial<ExamObservation> | null) => {
    const fd = RESP_FINDINGS.find((x) => x.code === code);
    if (!fd) return;
    const others = findings.filter((o) => o.code !== code);
    if (patch === null) return onChange({ ...value, findings: others });
    const prev = byCode.get(code) ?? {
      code,
      group: fd.group,
      display: fd.display,
      state: "not_examined" as FindingState,
    };
    onChange({ ...value, findings: [...others, { ...prev, ...patch }] });
  };

  // cycle a zone value through [unset, ...options] for percussion/breath/VR
  const cycleZone = (zone: RespZone) => {
    if (modality === "added") return;
    const opts = MOD_OPTS[modality];
    const rec = { ...((value[modality] as Partial<Record<RespZone, string>>) ?? {}) };
    const cur = rec[zone];
    const idx = cur ? opts.findIndex((o) => o.value === cur) : -1;
    const next = opts[idx + 1]?.value; // undefined wraps back to unset
    if (next) rec[zone] = next;
    else delete rec[zone];
    onChange({ ...value, [modality]: rec });
  };

  const toggleAdded = (zone: RespZone, sound: AddedSound) => {
    const rec = { ...(value.addedSounds ?? {}) };
    const cur = rec[zone] ?? [];
    const next = cur.includes(sound) ? cur.filter((s) => s !== sound) : [...cur, sound];
    if (next.length) rec[zone] = next;
    else delete rec[zone];
    onChange({ ...value, addedSounds: rec });
  };

  // ── render a catalog finding with the kit (select = chip pick; panel = three-state + chips) ──
  const renderFinding = (x: ExamFinding) => {
    const o = byCode.get(x.code);
    if (x.kind === "select") {
      return (
        <ChipRow key={x.code} label={x.display}>
          {x.options.map((opt) => (
            <ValueChip
              key={opt}
              active={o?.values?.[0] === opt}
              onClick={() =>
                setFinding(
                  x.code,
                  o?.values?.[0] === opt ? null : { state: "present", values: [opt] },
                )
              }
            >
              {opt}
            </ValueChip>
          ))}
        </ChipRow>
      );
    }
    const state: ThreeStateValue = o?.state ?? "not_examined";
    return (
      <div key={x.code} className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="text-foreground text-[12.5px]">{x.display}</span>
            {x.mustNotMiss ? (
              <AlertTriangleIcon className="size-3 text-amber-500" aria-label="must-not-miss" />
            ) : null}
            {x.ugandaFlag ? (
              <span className="text-muted-foreground bg-muted rounded px-1 text-[9px] uppercase">
                {x.ugandaFlag}
              </span>
            ) : null}
          </span>
          <ThreeState
            value={state}
            findingsLabel={x.options.length ? "Findings" : "Present"}
            onChange={(v) =>
              setFinding(
                x.code,
                v === "not_examined"
                  ? null
                  : { state: v, values: v === "absent" ? [] : (o?.values ?? []) },
              )
            }
          />
        </div>
        {state === "present" && x.options.length ? (
          <div className="flex flex-wrap gap-1 pl-1">
            {x.options.map((opt) => {
              const on = o?.values?.includes(opt);
              return (
                <ValueChip
                  key={opt}
                  active={!!on}
                  onClick={() =>
                    setFinding(x.code, {
                      values: on
                        ? (o?.values ?? []).filter((v) => v !== opt)
                        : [...(o?.values ?? []), opt],
                    })
                  }
                >
                  {opt}
                </ValueChip>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  };

  const group = (key: string) => RESP_FINDINGS.filter((x) => x.group === key);
  const presentInGroups = (keys: string[]) =>
    findings.filter((o) => o.state === "present" && keys.includes(o.group)).length;
  const touched = (x: ExamFinding) =>
    byCode.get(x.code)?.state && byCode.get(x.code)?.state !== "not_examined";

  // ── stage-completion hints (presentation only) ──
  const inspectionDone = [...group("resp_peripheral"), ...group("resp_inspection")].every(touched);
  const palpationDone =
    value.trachea !== undefined &&
    value.expansion?.left !== undefined &&
    value.expansion?.right !== undefined &&
    group("resp_palpation").every(touched);
  const zonesSet = (rec: Partial<Record<RespZone, unknown>> | undefined) =>
    RESP_ZONES.every((z) => rec?.[z.zone] !== undefined);
  const percussionDone =
    zonesSet(value.percussion) && zonesSet(value.breathSounds) && zonesSet(value.vocalResonance);
  const completionDone = group("resp_completion").every(touched);

  const zonalCount =
    Object.values(value.percussion ?? {}).filter(
      (v) => MOD_OPTS.percussion.find((o) => o.value === v)?.abnormal,
    ).length +
    Object.values(value.breathSounds ?? {}).filter(
      (v) => MOD_OPTS.breathSounds.find((o) => o.value === v)?.abnormal,
    ).length +
    Object.values(value.vocalResonance ?? {}).filter(
      (v) => MOD_OPTS.vocalResonance.find((o) => o.value === v)?.abnormal,
    ).length +
    Object.values(value.addedSounds ?? {}).filter((arr) => (arr ?? []).length).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-foreground text-[15px] font-medium tracking-[-0.015em]">
          Respiratory examination
        </h3>
        {patterns.length ? (
          <span
            key={patterns.length}
            className={cn(
              "scale-in inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
              patterns.some((p) => p.emergency)
                ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                : patterns.some((p) => p.mustNotMiss)
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                  : "bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300",
            )}
          >
            {patterns.some((p) => p.emergency) ? (
              <ShieldAlertIcon className="size-3" aria-hidden />
            ) : patterns.some((p) => p.mustNotMiss) ? (
              <AlertTriangleIcon className="size-3" aria-hidden />
            ) : null}
            {patterns.length} pattern{patterns.length > 1 ? "s" : ""}
          </span>
        ) : null}
        <span className="ml-auto">
          <NormalExamButton
            onClick={() => onChange(normalRespExam())}
            label="Normal respiratory exam"
          />
        </span>
      </div>

      <div className="flex flex-col gap-3.5">
        {/* ── Stage 1 — Inspection & peripheral ── */}
        <StageCard
          index={1}
          title="Inspection & peripheral"
          complete={inspectionDone}
          count={presentInGroups(["resp_peripheral", "resp_inspection"])}
          hint="end of bed → hands → chest"
        >
          {[...group("resp_peripheral"), ...group("resp_inspection")].map(renderFinding)}
          <p className="text-muted-foreground border-border/60 mt-1 border-t pt-2 text-[10px]">
            Clubbing, cyanosis, lymph nodes &amp; JVP are captured in the general examination.
          </p>
        </StageCard>

        {/* ── Stage 2 — Palpation ── */}
        <StageCard
          index={2}
          title="Palpation"
          complete={palpationDone}
          hint="trachea → expansion → chest wall"
        >
          <ChipRow label="Trachea">
            {(
              [
                ["deviated_left", "← L"],
                ["central", "central"],
                ["deviated_right", "R →"],
              ] as const
            ).map(([v, lbl]) => (
              <ValueChip
                key={v}
                active={value.trachea === v}
                onClick={() => onChange({ ...value, trachea: value.trachea === v ? undefined : v })}
              >
                {lbl}
              </ValueChip>
            ))}
          </ChipRow>
          <ChipRow label="Expansion">
            {(["left", "right"] as const).map((side) => {
              const reduced = value.expansion?.[side] === "reduced";
              return (
                <ValueChip
                  key={side}
                  active={reduced}
                  tone="amber"
                  onClick={() =>
                    onChange({
                      ...value,
                      expansion: { ...value.expansion, [side]: reduced ? "normal" : "reduced" },
                    })
                  }
                >
                  {side === "left" ? "L" : "R"} {reduced ? "reduced" : "normal"}
                </ValueChip>
              );
            })}
          </ChipRow>
          {group("resp_palpation").map(renderFinding)}
        </StageCard>

        {/* ── Stage 3 — Percussion & auscultation (chest zonal map) ── */}
        <StageCard
          index={3}
          title="Percussion & auscultation"
          complete={percussionDone}
          count={zonalCount}
          hint="per zone · L vs R"
        >
          <div className="flex flex-wrap items-center gap-1">
            {(Object.keys(MOD_LABEL) as Modality[]).map((m) => (
              <button
                key={m}
                type="button"
                className={seg(modality === m, "teal")}
                onClick={() => setModality(m)}
              >
                {MOD_LABEL[m]}
              </button>
            ))}
            <span className="text-muted-foreground ml-auto text-[10px]">
              {modality === "added"
                ? "tap a zone, then tap sounds"
                : `tap a zone to cycle: ${MOD_OPTS[modality].map((o) => o.label).join(" → ")} → unset`}
            </span>
          </div>

          <ChestZoneMap
            value={value}
            modality={modality as ChestModality}
            options={modality === "added" ? [] : [...MOD_OPTS[modality]]}
            activeZone={activeZone}
            onCycle={cycleZone}
            onSelectZone={setActiveZone}
          />

          {modality === "added" ? (
            activeZone ? (
              <div className="scale-in flex flex-col gap-1.5">
                <span className="text-muted-foreground text-[10px]">
                  Added sounds at:{" "}
                  <span className="text-foreground font-medium">
                    {RESP_ZONES.find((z) => z.zone === activeZone)?.level}{" "}
                    {RESP_ZONES.find((z) => z.zone === activeZone)?.side}
                  </span>
                </span>
                <div className="flex flex-wrap gap-1">
                  {ADDED_OPTS.map((o) => {
                    const on = (value.addedSounds?.[activeZone] ?? []).includes(o.value);
                    return (
                      <ValueChip
                        key={o.value}
                        active={on}
                        tone={o.emergency ? "alarm" : "default"}
                        onClick={() => toggleAdded(activeZone, o.value)}
                      >
                        {o.label}
                      </ValueChip>
                    );
                  })}
                </div>
              </div>
            ) : (
              <span className="text-muted-foreground text-[10px]">
                Tap a zone on the map to add sounds there.
              </span>
            )
          ) : null}
        </StageCard>

        {/* ── Stage 4 — Completion ── */}
        <StageCard
          index={4}
          title="Completion"
          complete={completionDone}
          count={presentInGroups(["resp_completion"])}
          hint="sputum · peak flow"
        >
          {group("resp_completion").map(renderFinding)}
        </StageCard>
      </div>

      {/* Cluster → pattern (decision-support) */}
      {patterns.length ? (
        <div
          className={cn(
            "flex flex-col gap-1 rounded-xl border p-3",
            patterns.some((p) => p.emergency)
              ? "border-red-300 bg-red-50/60 dark:border-red-900/50 dark:bg-red-950/20"
              : "border-border/70 bg-muted/20",
          )}
        >
          <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
            Pattern(s) to consider — decision support
          </span>
          {patterns.map((p) => (
            <div key={p.key} className="scale-in flex items-start gap-1.5">
              {p.emergency ? (
                <ShieldAlertIcon
                  className="mt-0.5 size-3.5 shrink-0 text-red-600 dark:text-red-400"
                  aria-hidden
                />
              ) : p.mustNotMiss ? (
                <AlertTriangleIcon
                  className="mt-0.5 size-3.5 shrink-0 text-amber-500"
                  aria-hidden
                />
              ) : (
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-teal-500" aria-hidden />
              )}
              <span className="text-[11.5px]">
                <span
                  className={`font-semibold ${p.emergency ? "text-red-700 dark:text-red-300" : "text-foreground"}`}
                >
                  {p.label}
                </span>
                <span className="text-muted-foreground"> — {p.signature}</span>
              </span>
            </div>
          ))}
          <span className="text-muted-foreground/80 text-[10px] italic">
            Surfaced from the recorded signs — you interpret + decide; never auto-diagnosed.
          </span>
        </div>
      ) : null}

      {renderRespProse(value) ? (
        <div className="fade-in-slow rounded-xl border border-teal-200/70 bg-teal-50/60 px-3 py-2 dark:border-teal-900/50 dark:bg-teal-950/20">
          <span className="inline-flex items-center gap-1 text-[10px] font-medium tracking-wide text-teal-700 uppercase dark:text-teal-400">
            <CircleDashedIcon className="size-3" aria-hidden /> Auto-generated summary
          </span>
          <p className="mt-0.5 text-[12px] leading-relaxed text-teal-900/90 italic dark:text-teal-100/80">
            {renderRespProse(value)}
          </p>
        </div>
      ) : null}
    </div>
  );
}
