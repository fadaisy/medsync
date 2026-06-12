"use client";

import type { ChestModality } from "./chest-zone-map";
import type { SectionStatus, ThreeStateValue } from "./exam-kit";
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
import {
  ChipRow,
  CompactField,
  FindingGrid,
  NormalExamButton,
  PresentCluster,
  SectionCard,
  ThreeState,
  ValueChip,
} from "./exam-kit";

/**
 * Respiratory examination — EXAMINATION UI v2 (progressive disclosure). Same
 * RespExam data, handlers, value-sets and behaviour as before; presentation only.
 * The clinical IPPA sequence is now four COLLAPSIBLE SectionCards (collapsed by
 * default) summarised to one line (status pill + inline positives + on-row "mark
 * normal"); a fully-normal exam reads as a tidy stack of "All normal" cards. The
 * chest zonal map stays the signature spatial control inside Percussion &
 * auscultation (percussion / breath sounds / vocal resonance / added sounds per
 * zone & side). Peripheral / inspection binary signs collapse to "tap any
 * present" PresentClusters (explicit examined / not-examined ⇒ not-examined ≠
 * all-negative). The sign-cluster → pattern suggestion is preserved transparently
 * (multiple on ambiguity, must-not-miss / emergency flagged) as DECISION-SUPPORT
 * — never an auto-diagnosis. not-examined ≠ normal. Peripheral general signs
 * (clubbing / cyanosis / nodes / JVP) remain in the general exam.
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

/** Graded select values that are not, in themselves, a positive finding. */
const NORMAL_SELECT = new Set(["none", "normal", "symmetrical"]);

/** A non-normal positive: present, and not a select sitting on a normal value. */
function isFinding(o: ExamObservation | undefined): boolean {
  if (!o || o.state !== "present") return false;
  if ((o.values ?? []).length && (o.values ?? []).every((v) => NORMAL_SELECT.has(v))) return false;
  return true;
}

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

  const group = (key: string) => RESP_FINDINGS.filter((x) => x.group === key);

  // ── compact select renderer (graded single-select; e.g. distress / pattern) ──
  const renderSelect = (x: ExamFinding) => {
    const o = byCode.get(x.code);
    return (
      <ChipRow key={x.code} label={x.display}>
        {x.options.map((opt) => (
          <ValueChip
            key={opt}
            active={o?.values?.[0] === opt}
            tone={
              x.mustNotMiss && o?.values?.[0] === opt && !NORMAL_SELECT.has(opt)
                ? "amber"
                : "default"
            }
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
  };

  // ── compact panel renderer (three-state; value-set chips revealed when present) ──
  const renderPanel = (x: ExamFinding) => {
    const o = byCode.get(x.code);
    const state: ThreeStateValue = o?.state ?? "not_examined";
    return (
      <CompactField
        key={x.code}
        label={x.display}
        mustNotMiss={x.mustNotMiss}
        flag={x.ugandaFlag}
        control={
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
        }
        detail={
          state === "present" && x.options.length
            ? x.options.map((opt) => {
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
              })
            : undefined
        }
      />
    );
  };

  // ── PresentCluster wiring for a set of no-option binary panels (peripheral /
  //    inspection / palpation stigmata) — mirrors the General spot-diagnosis pattern.
  const clusterFor = (binary: ExamFinding[]) => {
    const present = binary
      .filter((x) => byCode.get(x.code)?.state === "present")
      .map((x) => x.code);
    const examined =
      binary.length > 0 &&
      binary.every((x) => (byCode.get(x.code)?.state ?? "not_examined") !== "not_examined");
    const toggle = (code: string) => {
      const cur = byCode.get(code)?.state;
      if (cur === "present") setFinding(code, examined ? { state: "absent", values: [] } : null);
      else setFinding(code, { state: "present", values: [] });
    };
    const setExamined = (ex: boolean) => {
      const codes = new Set(binary.map((x) => x.code));
      const others = findings.filter((o) => !codes.has(o.code));
      if (!ex) return onChange({ ...value, findings: others });
      const forCluster: ExamObservation[] = binary.map((x) => {
        const cur = byCode.get(x.code);
        if (cur?.state === "present") return cur;
        return { code: x.code, group: x.group, display: x.display, state: "absent", values: [] };
      });
      onChange({ ...value, findings: [...others, ...forCluster] });
    };
    return { present, examined, toggle, setExamined };
  };

  const presentBlock = (binary: ExamFinding[], label?: string) => {
    if (!binary.length) return null;
    const { present, examined, toggle, setExamined } = clusterFor(binary);
    return (
      <PresentCluster
        label={label ?? "tap any that are present"}
        options={binary.map((x) => ({
          value: x.code,
          label: x.display,
          mustNotMiss: x.mustNotMiss,
        }))}
        present={present}
        examined={examined}
        onToggle={toggle}
        onSetExamined={setExamined}
      />
    );
  };

  // ── per-section status / count / inline-positive summary for the collapsed row ──
  const findingMeta = (
    items: ExamFinding[],
    extraPositives: string[] = [],
    extraTouched: boolean[] = [],
  ): { status: SectionStatus; count: number; summary: string } => {
    const obs = items.map((x) => ({ x, o: byCode.get(x.code) }));
    const positives = obs.filter(({ o }) => isFinding(o));
    const mnm = positives.filter(({ x }) => x.mustNotMiss);
    const touched = obs.filter(({ o }) => o && o.state !== "not_examined");
    const summary = [
      ...positives.map(({ x, o }) =>
        o?.values?.length && !o.values.every((v) => NORMAL_SELECT.has(v))
          ? `${x.display} (${o.values.filter((v) => !NORMAL_SELECT.has(v)).join(", ")})`
          : x.display,
      ),
      ...extraPositives,
    ].join(" · ");
    const positiveCount = positives.length + extraPositives.length;
    const touchedCount = touched.length + extraTouched.filter(Boolean).length;
    const totalCount = items.length + extraTouched.length;
    if (mnm.length) return { status: "must_not_miss", count: mnm.length, summary };
    if (positiveCount) return { status: "findings", count: positiveCount, summary };
    if (totalCount > 0 && touchedCount === totalCount)
      return { status: "normal", count: 0, summary: "" };
    if (touchedCount > 0) return { status: "partial", count: 0, summary: "" };
    return { status: "not_examined", count: 0, summary: "" };
  };

  // ── per-section "mark normal" reusing the whole-exam normal, scoped ──
  // 1 · Inspection & peripheral — set this section's panels absent (selects, which
  //     normalRespExam does NOT set, are left untouched ⇒ honest not-examined).
  const inspectionFindings = [...group("resp_peripheral"), ...group("resp_inspection")];
  const markInspectionNormal = () => {
    const normal = normalRespExam();
    const codes = new Set(inspectionFindings.map((x) => x.code));
    const others = findings.filter((o) => !codes.has(o.code));
    const forSection = (normal.findings ?? []).filter((o) => codes.has(o.code));
    onChange({ ...value, findings: [...others, ...forSection] });
  };

  // 2 · Palpation — trachea central, expansion normal, non-zonal panels absent.
  const palpationFindings = group("resp_palpation");
  const markPalpationNormal = () => {
    const normal = normalRespExam();
    const codes = new Set(palpationFindings.map((x) => x.code));
    const others = findings.filter((o) => !codes.has(o.code));
    const forSection = (normal.findings ?? []).filter((o) => codes.has(o.code));
    onChange({
      ...value,
      trachea: normal.trachea,
      expansion: normal.expansion,
      findings: [...others, ...forSection],
    });
  };

  // 3 · Percussion & auscultation — all zones to their normal scalar, no added sounds.
  const markZonalNormal = () => {
    const normal = normalRespExam();
    onChange({
      ...value,
      percussion: normal.percussion,
      breathSounds: normal.breathSounds,
      vocalResonance: normal.vocalResonance,
      addedSounds: {},
    });
  };

  // 4 · Completion — set this section's panels absent.
  const completionFindings = group("resp_completion");
  const markCompletionNormal = () => {
    const normal = normalRespExam();
    const codes = new Set(completionFindings.map((x) => x.code));
    const others = findings.filter((o) => !codes.has(o.code));
    const forSection = (normal.findings ?? []).filter((o) => codes.has(o.code));
    onChange({ ...value, findings: [...others, ...forSection] });
  };

  // ── palpation structured-control meta (trachea + expansion) for status/summary ──
  const trachDeviated = !!value.trachea && value.trachea !== "central";
  const expReducedSides = (["left", "right"] as const).filter(
    (s) => value.expansion?.[s] === "reduced",
  );
  const trachTouched = value.trachea !== undefined;
  const expTouched = value.expansion?.left !== undefined || value.expansion?.right !== undefined;
  const palpExtraPositives = [
    ...(trachDeviated ? [`Trachea ${value.trachea!.replace("_", " ")}`] : []),
    ...(expReducedSides.length
      ? [`Reduced expansion ${expReducedSides.map((s) => (s === "left" ? "L" : "R")).join(" + ")}`]
      : []),
  ];

  // ── zonal section meta (status / abnormal-count / inline summary) ──
  const zonalAbnormal = (
    rec: Partial<Record<RespZone, string>> | undefined,
    opts: readonly { value: string; abnormal: boolean }[],
  ) => Object.values(rec ?? {}).filter((v) => opts.find((o) => o.value === v)?.abnormal).length;
  const zonalAddedCount = Object.values(value.addedSounds ?? {}).filter(
    (arr) => (arr ?? []).length,
  ).length;
  const zonalCount =
    zonalAbnormal(value.percussion, MOD_OPTS.percussion) +
    zonalAbnormal(value.breathSounds, MOD_OPTS.breathSounds) +
    zonalAbnormal(value.vocalResonance, MOD_OPTS.vocalResonance) +
    zonalAddedCount;
  const zonesSet = (rec: Partial<Record<RespZone, unknown>> | undefined) =>
    RESP_ZONES.every((z) => rec?.[z.zone] !== undefined);
  const zonalTouched =
    Object.keys(value.percussion ?? {}).length > 0 ||
    Object.keys(value.breathSounds ?? {}).length > 0 ||
    Object.keys(value.vocalResonance ?? {}).length > 0 ||
    zonalAddedCount > 0;
  const zonalAllSet =
    zonesSet(value.percussion) && zonesSet(value.breathSounds) && zonesSet(value.vocalResonance);
  const hasStridor = Object.values(value.addedSounds ?? {}).some((arr) =>
    (arr ?? []).includes("stridor"),
  );
  const zonalStatus: SectionStatus = hasStridor
    ? "must_not_miss"
    : zonalCount > 0
      ? "findings"
      : zonalAllSet
        ? "normal"
        : zonalTouched
          ? "partial"
          : "not_examined";
  const zonalSummary = (() => {
    const parts: string[] = [];
    const ZONE = Object.fromEntries(RESP_ZONES.map((z) => [z.zone, z.short]));
    const collect = (
      rec: Partial<Record<RespZone, string>> | undefined,
      opts: readonly { value: string; label: string; abnormal: boolean }[],
    ) =>
      Object.entries(rec ?? {})
        .filter(([, v]) => opts.find((o) => o.value === v)?.abnormal)
        .map(([z, v]) => `${ZONE[z]} ${opts.find((o) => o.value === v)?.label.toLowerCase()}`);
    parts.push(...collect(value.percussion, MOD_OPTS.percussion));
    parts.push(...collect(value.breathSounds, MOD_OPTS.breathSounds));
    parts.push(...collect(value.vocalResonance, MOD_OPTS.vocalResonance));
    if (zonalAddedCount)
      parts.push(`${zonalAddedCount} zone${zonalAddedCount > 1 ? "s" : ""} added sounds`);
    return parts.join(" · ");
  })();

  // ── section metas (binary-panel selects + panels handled by findingMeta) ──
  const inspectionMeta = findingMeta(inspectionFindings);
  const palpationMeta = findingMeta(palpationFindings, palpExtraPositives, [
    trachTouched,
    expTouched,
  ]);
  const completionMeta = findingMeta(completionFindings);

  // partition Stage-1 catalog by render mode
  const inspSelects = inspectionFindings.filter((x) => x.kind === "select");
  const inspBinary = inspectionFindings.filter((x) => x.kind === "panel" && x.options.length === 0);
  const inspPanels = inspectionFindings.filter((x) => x.kind === "panel" && x.options.length > 0);
  const palpBinary = palpationFindings.filter((x) => x.kind === "panel" && x.options.length === 0);
  const palpPanels = palpationFindings.filter((x) => x.kind === "panel" && x.options.length > 0);

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

      {/* Clinical sequence — collapsible SectionCards (collapsed by default) */}
      <div className="flex flex-col gap-2.5">
        {/* ── 1 · Inspection & peripheral ── */}
        <SectionCard
          index={1}
          title="Inspection & peripheral"
          status={inspectionMeta.status}
          count={inspectionMeta.count}
          summary={inspectionMeta.summary}
          onMarkNormal={markInspectionNormal}
        >
          {inspSelects.length ? (
            <div className="flex flex-col gap-2.5">{inspSelects.map(renderSelect)}</div>
          ) : null}
          {inspPanels.length ? <FindingGrid>{inspPanels.map(renderPanel)}</FindingGrid> : null}
          {presentBlock(inspBinary, "tap any present sign")}
          <p className="text-muted-foreground border-border/60 mt-1 border-t pt-2 text-[10px]">
            Clubbing, cyanosis, lymph nodes &amp; JVP are captured in the general examination.
          </p>
        </SectionCard>

        {/* ── 2 · Palpation ── */}
        <SectionCard
          index={2}
          title="Palpation"
          status={palpationMeta.status}
          count={palpationMeta.count}
          summary={palpationMeta.summary}
          onMarkNormal={markPalpationNormal}
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
                tone={v !== "central" && value.trachea === v ? "amber" : "default"}
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
          {palpPanels.length ? <FindingGrid>{palpPanels.map(renderPanel)}</FindingGrid> : null}
          {presentBlock(palpBinary, "tap any present sign")}
        </SectionCard>

        {/* ── 3 · Percussion & auscultation (chest zonal map) ── */}
        <SectionCard
          index={3}
          title="Percussion & auscultation"
          status={zonalStatus}
          count={zonalStatus === "must_not_miss" ? 1 : zonalCount}
          summary={zonalSummary}
          onMarkNormal={markZonalNormal}
        >
          <div className="flex flex-wrap items-center gap-1">
            {(Object.keys(MOD_LABEL) as Modality[]).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={modality === m}
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
        </SectionCard>

        {/* ── 4 · Completion ── */}
        <SectionCard
          index={4}
          title="Completion"
          status={completionMeta.status}
          count={completionMeta.count}
          summary={completionMeta.summary}
          onMarkNormal={markCompletionNormal}
        >
          <FindingGrid>{completionFindings.map(renderPanel)}</FindingGrid>
        </SectionCard>
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
