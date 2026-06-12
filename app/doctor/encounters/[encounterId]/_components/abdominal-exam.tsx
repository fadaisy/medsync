"use client";

import type { SectionStatus, ThreeStateValue } from "./exam-kit";
import type {
  AbdoExam,
  AbdoGuarding,
  AbdoLiver,
  AbdoMass,
  AbdoRegion,
  AbdoSpleen,
  AbdoTenderness,
} from "@/lib/clerkship/exam/abdominal";
import type { ExamFinding, ExamObservation, FindingState } from "@/lib/clerkship/exam/types";
import { useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  CircleDashedIcon,
  PlusIcon,
  ShieldAlertIcon,
  XIcon,
} from "lucide-react";

import {
  ABDO_FINDINGS,
  ABDO_REGIONS,
  BRUIT_OPTS,
  LIVER_EDGE_OPTS,
  LIVER_SPAN_OPTS,
  MASS_CONSISTENCY_OPTS,
  MASS_EDGE_OPTS,
  MASS_MOBILITY_OPTS,
  MASS_SIZE_OPTS,
  MASS_SURFACE_OPTS,
  matchAbdoPatterns,
  normalAbdoExam,
  PR_FINDING_OPTS,
  renderAbdoProse,
  SPLEEN_EXTENT_OPTS,
} from "@/lib/clerkship/exam/abdominal";
import { cn } from "@/lib/utils";
import { AbdoRegionMap } from "./abdo-region-map";
import {
  ChipRow,
  NormalExamButton,
  PresentCluster,
  SectionCard,
  ThreeState,
  ValueChip,
} from "./exam-kit";

/**
 * Abdominal examination — EXAMINATION UI v2 (progressive disclosure). Same
 * AbdoExam data, handlers and value-sets as before; presentation only. The four
 * I-P-P-A stages are now COLLAPSIBLE SectionCards summarised to one line (status
 * pill + inline positives + on-row "mark normal"); a fully-normal exam is a tidy
 * stack of "All normal" cards. Inside the sections every structured control is
 * preserved unchanged: the 9-region AbdoRegionMap, the structured liver/spleen/
 * kidney organ builders, the mass builder, and the PR-as-completion honesty
 * control. The binary peripheral/inspection stigmata and the named-sign panels
 * collapse to "tap any present" clusters (explicit examined / not-examined so
 * not-examined ≠ all-negative). The constellation → pattern panel and the
 * auto-generated prose summary are preserved. Nothing auto-recorded.
 */

const seg = (active: boolean, tone: "muted" | "teal" = "muted") =>
  `tap inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset transition-colors duration-150 ${
    active
      ? tone === "teal"
        ? "bg-teal-50 text-teal-700 ring-teal-500/40 dark:bg-teal-950/40 dark:text-teal-200"
        : "bg-slate-100 text-slate-700 ring-slate-400/50 dark:bg-slate-800 dark:text-slate-200"
      : "text-muted-foreground ring-border hover:bg-muted/60"
  }`;

function Row({
  title,
  options,
  value,
  onPick,
}: {
  title: string;
  options: readonly string[] | { value: string; label: string }[];
  value: string | undefined;
  onPick: (v: string | undefined) => void;
}) {
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <ChipRow label={title}>
      {opts.map((o) => (
        <ValueChip
          key={o.value}
          active={value === o.value}
          onClick={() => onPick(value === o.value ? undefined : o.value)}
        >
          {o.label}
        </ValueChip>
      ))}
    </ChipRow>
  );
}

function Toggle({
  label,
  on,
  onToggle,
  alarm,
}: {
  label: string;
  on: boolean | undefined;
  onToggle: () => void;
  alarm?: boolean;
}) {
  return (
    <ValueChip active={!!on} tone={alarm ? "alarm" : "default"} onClick={onToggle}>
      {label}
    </ValueChip>
  );
}

type RegionModality = "tenderness" | "guarding";

export function AbdominalExam({
  value,
  onChange,
}: {
  value: AbdoExam;
  onChange: (next: AbdoExam) => void;
}) {
  const [modality, setModality] = useState<RegionModality>("tenderness");

  const findings = value.findings ?? [];
  const byCode = useMemo(() => new Map(findings.map((o) => [o.code, o])), [findings]);
  const patterns = useMemo(() => matchAbdoPatterns(value), [value]);

  const setFinding = (code: string, patch: Partial<ExamObservation> | null) => {
    const fd = ABDO_FINDINGS.find((x) => x.code === code);
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

  const cycleRegion = (region: AbdoRegion) => {
    if (modality === "tenderness") {
      const rec = { ...(value.tenderness ?? {}) };
      const cur = rec[region];
      const next: AbdoTenderness | undefined =
        cur === undefined ? "tender" : cur === "tender" ? "deep" : undefined;
      if (next) rec[region] = next;
      else delete rec[region];
      onChange({ ...value, tenderness: rec });
    } else {
      const rec = { ...(value.guarding ?? {}) };
      const cur = rec[region];
      const next: AbdoGuarding | undefined =
        cur === undefined ? "voluntary" : cur === "voluntary" ? "involuntary" : undefined;
      if (next) rec[region] = next;
      else delete rec[region];
      onChange({ ...value, guarding: rec });
    }
  };

  const masses = value.masses ?? [];
  const setMass = (id: string, patch: Partial<AbdoMass>) =>
    onChange({ ...value, masses: masses.map((m) => (m.id === id ? { ...m, ...patch } : m)) });

  const liver = value.liver ?? {};
  const spleen = value.spleen ?? {};

  const group = (key: string) => ABDO_FINDINGS.filter((x) => x.group === key);

  // ── per-section: set the relevant catalog findings normal. Reuses the whole-exam
  // normal for panels (absent); selects get their conventional baseline (first
  // option = comfortable / flat / moves) so a marked-normal section reads cleanly. ──
  const normalForGroups = (keys: string[]): ExamObservation[] => {
    const normal = normalAbdoExam();
    const normalByCode = new Map((normal.findings ?? []).map((o) => [o.code, o]));
    const items = keys.flatMap(group);
    const wanted = new Set(items.map((x) => x.code));
    const others = findings.filter((o) => !wanted.has(o.code));
    const forGroups: ExamObservation[] = items.map((x) => {
      const fromNormal = normalByCode.get(x.code);
      if (fromNormal) return fromNormal;
      // selects (not covered by normalAbdoExam) → present at their baseline option
      return {
        code: x.code,
        group: x.group,
        display: x.display,
        state: "present",
        values: x.options[0] ? [x.options[0]] : [],
      };
    });
    return [...others, ...forGroups];
  };

  /** A select sitting on its baseline (first) option is normal, not a positive. */
  const selectIsNormal = (x: ExamFinding, o: ExamObservation | undefined) =>
    x.kind === "select" && o?.state === "present" && o.values?.[0] === x.options[0];

  // Inspection & stigmata — catalog panels/selects back to examined-normal.
  const markInspectionNormal = () =>
    onChange({ ...value, findings: normalForGroups(["abdo_peripheral", "abdo_inspection"]) });

  // Palpation — region maps emptied + organs/peritonism back to examined-normal.
  const markPalpationNormal = () => {
    const n = normalAbdoExam();
    onChange({
      ...value,
      tenderness: {},
      guarding: {},
      rigidity: n.rigidity,
      rebound: n.rebound,
      percussionTenderness: n.percussionTenderness,
      masses: [],
      liver: n.liver,
      spleen: n.spleen,
      kidneys: n.kidneys,
      aortaExpansile: n.aortaExpansile,
      bladderPalpable: n.bladderPalpable,
    });
  };

  // Percussion & auscultation — back to examined-normal.
  const markPercussionNormal = () => {
    const n = normalAbdoExam();
    onChange({
      ...value,
      liverDullnessLost: n.liverDullnessLost,
      shiftingDullness: n.shiftingDullness,
      fluidThrill: n.fluidThrill,
      bowelSounds: n.bowelSounds,
      bruits: [],
      succussionSplash: false,
    });
  };

  // Completion — named-sign panels examined-normal; PR honestly not-examined.
  const markCompletionNormal = () => {
    const n = normalAbdoExam();
    onChange({
      ...value,
      findings: normalForGroups(["abdo_signs", "abdo_completion"]),
      pr: n.pr,
    });
  };

  // ── status / count / inline-positive summary for a set of catalog findings ──
  const findingsMeta = (
    items: ExamFinding[],
  ): { status: SectionStatus; count: number; positives: string[] } => {
    const obs = items.map((x) => ({ x, o: byCode.get(x.code) }));
    // present, excluding selects resting on their baseline (= recorded normal).
    const positives = obs.filter(({ x, o }) => o?.state === "present" && !selectIsNormal(x, o));
    const mnm = positives.filter(({ x }) => x.mustNotMiss);
    const touched = obs.filter(({ o }) => o && o.state !== "not_examined");
    const labels = positives.map(({ x, o }) =>
      o?.values?.length ? `${x.display.toLowerCase()} (${o.values.join(", ")})` : x.display,
    );
    if (mnm.length) return { status: "must_not_miss", count: mnm.length, positives: labels };
    if (positives.length) return { status: "findings", count: positives.length, positives: labels };
    if (touched.length === items.length && items.length > 0)
      return { status: "normal", count: 0, positives: [] };
    if (touched.length > 0) return { status: "partial", count: 0, positives: [] };
    return { status: "not_examined", count: 0, positives: [] };
  };

  // ── PresentCluster wiring for a set of binary catalog findings (no value-set).
  // Maps the General spot-diagnosis cluster pattern exactly: tap present↔(absent
  // if examined else removed); Examined ⇒ untapped→absent; Not-examined ⇒ remove. ──
  const clusterFor = (items: ExamFinding[]) => {
    const present = items.filter((x) => byCode.get(x.code)?.state === "present").map((x) => x.code);
    const examined = items.every(
      (x) => (byCode.get(x.code)?.state ?? "not_examined") !== "not_examined",
    );
    const onToggle = (code: string) => {
      const cur = byCode.get(code)?.state;
      if (cur === "present") setFinding(code, examined ? { state: "absent", values: [] } : null);
      else setFinding(code, { state: "present", values: [] });
    };
    const onSetExamined = (ex: boolean) => {
      const codes = new Set(items.map((x) => x.code));
      const others = findings.filter((o) => !codes.has(o.code));
      if (!ex) return onChange({ ...value, findings: others });
      const forGroup: ExamObservation[] = items.map((x) => {
        const cur = byCode.get(x.code);
        if (cur?.state === "present") return cur;
        return { code: x.code, group: x.group, display: x.display, state: "absent", values: [] };
      });
      onChange({ ...value, findings: [...others, ...forGroup] });
    };
    return { present, examined, onToggle, onSetExamined };
  };

  // ── select chip row (catalog selects: End of bed / Contour / Moves w/ resp) ──
  const renderSelect = (x: ExamFinding) => {
    const o = byCode.get(x.code);
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
  };

  // ── panel three-state (kept for value-set panels: 5 F's, hands stigmata, …) ──
  const renderPanel = (x: ExamFinding) => {
    const o = byCode.get(x.code);
    const state: ThreeStateValue = o?.state ?? "not_examined";
    return (
      <div key={x.code} className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="text-foreground text-[12.5px]">{x.display}</span>
            {x.mustNotMiss ? (
              <AlertTriangleIcon className="size-3 text-amber-500" aria-label="must-not-miss" />
            ) : null}
          </span>
          <ThreeState
            value={state}
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
          <div className="scale-in flex flex-wrap gap-1 pl-1">
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

  // ── section meta computation per stage ──

  // §1 Inspection & stigmata — selects + value-set panels + binary stigmata cluster.
  const inspectionItems = [...group("abdo_peripheral"), ...group("abdo_inspection")];
  const inspectionSelects = inspectionItems.filter((x) => x.kind === "select");
  const inspectionValuePanels = inspectionItems.filter(
    (x) => x.kind === "panel" && x.options.length,
  );
  const inspectionBinary = inspectionItems.filter((x) => x.kind === "panel" && !x.options.length);
  const inspectionMeta = findingsMeta(inspectionItems);
  const inspectionCluster = clusterFor(inspectionBinary);

  // §2 Palpation — structured-only; status from the region maps + organs + masses.
  const palpationPositives: string[] = [];
  for (const [r, t] of Object.entries(value.tenderness ?? {}))
    palpationPositives.push(`tender ${r}${t === "deep" ? " (deep)" : ""}`);
  for (const [r, g] of Object.entries(value.guarding ?? {}))
    palpationPositives.push(`guarding ${r} (${g})`);
  if (value.rigidity && value.rigidity !== "none")
    palpationPositives.push(`${value.rigidity} rigidity`);
  if (value.rebound) palpationPositives.push("rebound");
  if (value.percussionTenderness) palpationPositives.push("percussion tenderness");
  if (liver.palpable) palpationPositives.push("hepatomegaly");
  if (spleen.palpable) palpationPositives.push("splenomegaly");
  if (value.kidneys?.leftBallotable || value.kidneys?.rightBallotable)
    palpationPositives.push("ballotable kidney");
  if (value.aortaExpansile) palpationPositives.push("expansile aorta");
  if (value.bladderPalpable) palpationPositives.push("bladder palpable");
  if (masses.length)
    palpationPositives.push(`${masses.length} mass${masses.length > 1 ? "es" : ""}`);
  const palpationMnm = value.rigidity === "board_like" || value.aortaExpansile;
  const palpationTouched =
    liver.palpable !== undefined ||
    spleen.palpable !== undefined ||
    value.rigidity !== undefined ||
    value.rebound !== undefined ||
    value.percussionTenderness !== undefined ||
    Object.keys(value.tenderness ?? {}).length > 0 ||
    Object.keys(value.guarding ?? {}).length > 0 ||
    masses.length > 0;
  const palpationStructuredNormal =
    value.rigidity !== undefined &&
    liver.palpable !== undefined &&
    spleen.palpable !== undefined &&
    value.kidneys?.leftBallotable !== undefined &&
    value.kidneys?.rightBallotable !== undefined &&
    value.rebound !== undefined &&
    value.percussionTenderness !== undefined &&
    value.aortaExpansile !== undefined &&
    value.bladderPalpable !== undefined;
  const palpationMeta: { status: SectionStatus; count: number; positives: string[] } = palpationMnm
    ? { status: "must_not_miss", count: 1, positives: palpationPositives }
    : palpationPositives.length
      ? { status: "findings", count: palpationPositives.length, positives: palpationPositives }
      : palpationStructuredNormal
        ? { status: "normal", count: 0, positives: [] }
        : palpationTouched
          ? { status: "partial", count: 0, positives: [] }
          : { status: "not_examined", count: 0, positives: [] };

  // §3 Percussion & auscultation — structured-only.
  const percussionPositives: string[] = [];
  if (value.shiftingDullness) percussionPositives.push("shifting dullness");
  if (value.fluidThrill) percussionPositives.push("fluid thrill");
  if (value.liverDullnessLost) percussionPositives.push("loss of liver dullness");
  if (value.bowelSounds && value.bowelSounds !== "normal")
    percussionPositives.push(
      value.bowelSounds === "tinkling" ? "tinkling bowel sounds" : "absent bowel sounds",
    );
  if (value.bruits?.length) percussionPositives.push(...value.bruits.map((b) => `${b} bruit`));
  if (value.succussionSplash) percussionPositives.push("succussion splash");
  const percussionMnm = !!value.liverDullnessLost;
  const percussionTouched =
    value.bowelSounds !== undefined ||
    value.shiftingDullness !== undefined ||
    value.fluidThrill !== undefined ||
    value.liverDullnessLost !== undefined ||
    (value.bruits?.length ?? 0) > 0 ||
    value.succussionSplash !== undefined;
  const percussionStructuredNormal =
    value.bowelSounds !== undefined &&
    value.shiftingDullness !== undefined &&
    value.fluidThrill !== undefined &&
    value.liverDullnessLost !== undefined;
  const percussionMeta: { status: SectionStatus; count: number; positives: string[] } =
    percussionMnm
      ? { status: "must_not_miss", count: 1, positives: percussionPositives }
      : percussionPositives.length
        ? { status: "findings", count: percussionPositives.length, positives: percussionPositives }
        : percussionStructuredNormal
          ? { status: "normal", count: 0, positives: [] }
          : percussionTouched
            ? { status: "partial", count: 0, positives: [] }
            : { status: "not_examined", count: 0, positives: [] };

  // §4 Completion — named-sign panels (binary cluster) + PR honesty control.
  const completionItems = [...group("abdo_signs"), ...group("abdo_completion")];
  const completionBinary = completionItems.filter((x) => x.kind === "panel" && !x.options.length);
  const completionValuePanels = completionItems.filter(
    (x) => x.kind === "panel" && x.options.length,
  );
  const completionFindingsMeta = findingsMeta(completionItems);
  const completionCluster = clusterFor(completionBinary);
  // PR contributes to status: examined findings → findings; PR blood → must-not-miss.
  const prFindings = value.pr?.state === "examined" ? (value.pr.findings ?? []) : [];
  const prBlood = prFindings.some((x) => x === "melaena" || x === "fresh blood");
  const completionPositives = [
    ...completionFindingsMeta.positives,
    ...(prFindings.length ? [`PR: ${prFindings.join(", ")}`] : []),
  ];
  const completionTouchedPr = !!value.pr?.state;
  const completionMnm = completionFindingsMeta.status === "must_not_miss" || prBlood;
  const completionMnmCount =
    (completionFindingsMeta.status === "must_not_miss" ? completionFindingsMeta.count : 0) +
    (prBlood ? 1 : 0);
  const completionAllRecorded =
    completionItems.every(
      (x) => (byCode.get(x.code)?.state ?? "not_examined") !== "not_examined",
    ) && completionTouchedPr;
  const completionAnyTouched =
    completionItems.some((x) => (byCode.get(x.code)?.state ?? "not_examined") !== "not_examined") ||
    completionTouchedPr;
  const completionMeta: { status: SectionStatus; count: number; positives: string[] } =
    completionMnm
      ? { status: "must_not_miss", count: completionMnmCount, positives: completionPositives }
      : completionPositives.length
        ? { status: "findings", count: completionPositives.length, positives: completionPositives }
        : completionAllRecorded
          ? { status: "normal", count: 0, positives: [] }
          : completionAnyTouched
            ? { status: "partial", count: 0, positives: [] }
            : { status: "not_examined", count: 0, positives: [] };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-foreground text-[15px] font-medium tracking-[-0.015em]">
          Abdominal examination
        </h3>
        {patterns.length ? (
          <span
            key={patterns.length}
            className="scale-in inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 tabular-nums dark:bg-amber-950/40 dark:text-amber-300"
          >
            <AlertTriangleIcon className="size-3" aria-hidden />
            {patterns.length} pattern{patterns.length > 1 ? "s" : ""}
          </span>
        ) : null}
        <span className="ml-auto">
          <NormalExamButton
            onClick={() => onChange(normalAbdoExam())}
            label="Normal abdominal exam"
          />
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        {/* ── §1 — Inspection & stigmata ── */}
        <SectionCard
          index={1}
          title="Inspection & stigmata"
          status={inspectionMeta.status}
          count={inspectionMeta.count}
          summary={inspectionMeta.positives.join(" · ")}
          onMarkNormal={markInspectionNormal}
        >
          {inspectionSelects.length ? (
            <div className="flex flex-col gap-2">{inspectionSelects.map(renderSelect)}</div>
          ) : null}
          {inspectionValuePanels.length ? (
            <div className="border-border/60 flex flex-col gap-2 border-t pt-2.5">
              {inspectionValuePanels.map(renderPanel)}
            </div>
          ) : null}
          {inspectionBinary.length ? (
            <div className="border-border/60 border-t pt-2.5">
              <PresentCluster
                label="end of bed → hands → abdomen — tap any that are present"
                options={inspectionBinary.map((x) => ({
                  value: x.code,
                  label: x.display,
                  mustNotMiss: x.mustNotMiss,
                }))}
                present={inspectionCluster.present}
                examined={inspectionCluster.examined}
                onToggle={inspectionCluster.onToggle}
                onSetExamined={inspectionCluster.onSetExamined}
              />
            </div>
          ) : null}
        </SectionCard>

        {/* ── §2 — Palpation ── */}
        <SectionCard
          index={2}
          title="Palpation"
          status={palpationMeta.status}
          count={palpationMeta.count}
          summary={palpationMeta.positives.join(" · ")}
          onMarkNormal={markPalpationNormal}
        >
          <div className="flex flex-wrap items-center gap-1">
            {(["tenderness", "guarding"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={modality === m}
                className={seg(modality === m, "teal")}
                onClick={() => setModality(m)}
              >
                {m === "tenderness" ? "Tenderness" : "Guarding"}
              </button>
            ))}
            <span className="text-muted-foreground ml-auto text-[10px]">
              tap a region:{" "}
              {modality === "tenderness" ? "tender → deep → off" : "voluntary → involuntary → off"}
            </span>
          </div>
          <AbdoRegionMap value={value} modality={modality} onCycle={cycleRegion} />
          <Row
            title="Rigidity"
            options={[
              { value: "none", label: "None" },
              { value: "localised", label: "Localised" },
              { value: "board_like", label: "Board-like" },
            ]}
            value={value.rigidity}
            onPick={(v) =>
              onChange({ ...value, rigidity: (v as AbdoExam["rigidity"]) ?? undefined })
            }
          />
          <ChipRow label="Peritonism">
            <Toggle
              label="Rebound tenderness"
              on={value.rebound}
              onToggle={() => onChange({ ...value, rebound: !value.rebound })}
            />
            <Toggle
              label="Percussion tenderness"
              on={value.percussionTenderness}
              onToggle={() =>
                onChange({ ...value, percussionTenderness: !value.percussionTenderness })
              }
            />
          </ChipRow>

          {/* Organs */}
          <div className="border-border/60 mt-1 flex flex-col gap-1.5 rounded-lg border-t pt-2.5">
            <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
              Organs
            </span>
            <ChipRow label="Liver">
              <Toggle
                label={liver.palpable ? "Palpable" : "Not palpable"}
                on={liver.palpable}
                onToggle={() =>
                  onChange({
                    ...value,
                    liver: liver.palpable ? { palpable: false } : { ...liver, palpable: true },
                  })
                }
              />
            </ChipRow>
            {liver.palpable ? (
              <div className="scale-in flex flex-col gap-1.5">
                <Row
                  title="↳ below costal margin"
                  options={LIVER_SPAN_OPTS}
                  value={liver.span}
                  onPick={(v) =>
                    onChange({ ...value, liver: { ...liver, span: v as AbdoLiver["span"] } })
                  }
                />
                <Row
                  title="↳ edge"
                  options={LIVER_EDGE_OPTS}
                  value={liver.edge}
                  onPick={(v) =>
                    onChange({ ...value, liver: { ...liver, edge: v as AbdoLiver["edge"] } })
                  }
                />
                <ChipRow label="↳ character">
                  <Toggle
                    label="craggy surface"
                    on={liver.surface === "craggy"}
                    onToggle={() =>
                      onChange({
                        ...value,
                        liver: {
                          ...liver,
                          surface: liver.surface === "craggy" ? undefined : "craggy",
                        },
                      })
                    }
                  />
                  <Toggle
                    label="tender"
                    on={liver.tender}
                    onToggle={() =>
                      onChange({ ...value, liver: { ...liver, tender: !liver.tender } })
                    }
                  />
                  <Toggle
                    label="pulsatile"
                    on={liver.pulsatile}
                    onToggle={() =>
                      onChange({ ...value, liver: { ...liver, pulsatile: !liver.pulsatile } })
                    }
                  />
                </ChipRow>
              </div>
            ) : null}
            <ChipRow label="Spleen">
              <Toggle
                label={spleen.palpable ? "Palpable" : "Not palpable"}
                on={spleen.palpable}
                onToggle={() =>
                  onChange({
                    ...value,
                    spleen: spleen.palpable ? { palpable: false } : { ...spleen, palpable: true },
                  })
                }
              />
            </ChipRow>
            {spleen.palpable ? (
              <div className="scale-in flex flex-col gap-1.5">
                <Row
                  title="↳ extent"
                  options={SPLEEN_EXTENT_OPTS}
                  value={spleen.extent}
                  onPick={(v) =>
                    onChange({ ...value, spleen: { ...spleen, extent: v as AbdoSpleen["extent"] } })
                  }
                />
                <ChipRow label="↳ character">
                  <Toggle
                    label="notch felt"
                    on={spleen.notch}
                    onToggle={() =>
                      onChange({ ...value, spleen: { ...spleen, notch: !spleen.notch } })
                    }
                  />
                  <Toggle
                    label="can't get above it"
                    on={spleen.cantGetAbove}
                    onToggle={() =>
                      onChange({
                        ...value,
                        spleen: { ...spleen, cantGetAbove: !spleen.cantGetAbove },
                      })
                    }
                  />
                </ChipRow>
              </div>
            ) : null}
            <ChipRow label="Kidneys">
              <Toggle
                label="R ballotable"
                on={value.kidneys?.rightBallotable}
                onToggle={() =>
                  onChange({
                    ...value,
                    kidneys: { ...value.kidneys, rightBallotable: !value.kidneys?.rightBallotable },
                  })
                }
              />
              <Toggle
                label="L ballotable"
                on={value.kidneys?.leftBallotable}
                onToggle={() =>
                  onChange({
                    ...value,
                    kidneys: { ...value.kidneys, leftBallotable: !value.kidneys?.leftBallotable },
                  })
                }
              />
            </ChipRow>
            <ChipRow label="Aorta / bladder">
              <Toggle
                label="Expansile pulsatile (AAA)"
                alarm
                on={value.aortaExpansile}
                onToggle={() => onChange({ ...value, aortaExpansile: !value.aortaExpansile })}
              />
              <Toggle
                label="Bladder palpable"
                on={value.bladderPalpable}
                onToggle={() => onChange({ ...value, bladderPalpable: !value.bladderPalpable })}
              />
            </ChipRow>
          </div>

          {/* Masses */}
          <div className="border-border/60 mt-1 flex flex-col gap-2 rounded-lg border-t pt-2.5">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                Masses
              </span>
              <button
                type="button"
                onClick={() =>
                  onChange({ ...value, masses: [...masses, { id: crypto.randomUUID() }] })
                }
                className="tap text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[11.5px]"
              >
                <PlusIcon className="size-3.5" aria-hidden /> Add mass
              </button>
            </div>
            {masses.length === 0 ? (
              <p className="text-muted-foreground text-[11px]">No mass recorded.</p>
            ) : (
              masses.map((m, i) => (
                <div
                  key={m.id}
                  className="border-border/70 scale-in flex flex-col gap-1.5 rounded-lg border p-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                      Mass {i + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onChange({ ...value, masses: masses.filter((x) => x.id !== m.id) })
                      }
                      className="tap text-muted-foreground hover:text-foreground"
                      aria-label="Remove mass"
                    >
                      <XIcon className="size-3.5" />
                    </button>
                  </div>
                  <Row
                    title="Region"
                    options={ABDO_REGIONS.map((r) => ({ value: r.region, label: r.short }))}
                    value={m.region}
                    onPick={(v) => setMass(m.id, { region: v as AbdoRegion | undefined })}
                  />
                  <Row
                    title="Size"
                    options={MASS_SIZE_OPTS}
                    value={m.size}
                    onPick={(v) => setMass(m.id, { size: v as AbdoMass["size"] })}
                  />
                  <Row
                    title="Surface"
                    options={MASS_SURFACE_OPTS}
                    value={m.surface}
                    onPick={(v) => setMass(m.id, { surface: v as AbdoMass["surface"] })}
                  />
                  <Row
                    title="Edge"
                    options={MASS_EDGE_OPTS}
                    value={m.edge}
                    onPick={(v) => setMass(m.id, { edge: v as AbdoMass["edge"] })}
                  />
                  <Row
                    title="Consistency"
                    options={MASS_CONSISTENCY_OPTS}
                    value={m.consistency}
                    onPick={(v) => setMass(m.id, { consistency: v as AbdoMass["consistency"] })}
                  />
                  <Row
                    title="Mobility"
                    options={MASS_MOBILITY_OPTS}
                    value={m.mobility}
                    onPick={(v) => setMass(m.id, { mobility: v as AbdoMass["mobility"] })}
                  />
                  <ChipRow label="↳ character">
                    <Toggle
                      label="expansile pulsatile (AAA)"
                      alarm
                      on={m.pulsatileExpansile}
                      onToggle={() => setMass(m.id, { pulsatileExpansile: !m.pulsatileExpansile })}
                    />
                    <Toggle
                      label="tender"
                      on={m.tender}
                      onToggle={() => setMass(m.id, { tender: !m.tender })}
                    />
                  </ChipRow>
                </div>
              ))
            )}
          </div>
        </SectionCard>

        {/* ── §3 — Percussion & auscultation ── */}
        <SectionCard
          index={3}
          title="Percussion & auscultation"
          status={percussionMeta.status}
          count={percussionMeta.count}
          summary={percussionMeta.positives.join(" · ")}
          onMarkNormal={markPercussionNormal}
        >
          <ChipRow label="Percussion">
            <Toggle
              label="Shifting dullness"
              on={value.shiftingDullness}
              onToggle={() => onChange({ ...value, shiftingDullness: !value.shiftingDullness })}
            />
            <Toggle
              label="Fluid thrill"
              on={value.fluidThrill}
              onToggle={() => onChange({ ...value, fluidThrill: !value.fluidThrill })}
            />
            <Toggle
              label="Loss of liver dullness"
              alarm
              on={value.liverDullnessLost}
              onToggle={() => onChange({ ...value, liverDullnessLost: !value.liverDullnessLost })}
            />
          </ChipRow>
          <Row
            title="Bowel sounds"
            options={[
              { value: "normal", label: "Normal" },
              { value: "tinkling", label: "Increased / tinkling" },
              { value: "absent", label: "Absent (≥3 min)" },
            ]}
            value={value.bowelSounds}
            onPick={(v) =>
              onChange({ ...value, bowelSounds: (v as AbdoExam["bowelSounds"]) ?? undefined })
            }
          />
          <ChipRow label="Bruits / splash">
            {BRUIT_OPTS.map((b) => (
              <Toggle
                key={b}
                label={`${b} bruit`}
                on={(value.bruits ?? []).includes(b)}
                onToggle={() => {
                  const cur = value.bruits ?? [];
                  onChange({
                    ...value,
                    bruits: cur.includes(b) ? cur.filter((x) => x !== b) : [...cur, b],
                  });
                }}
              />
            ))}
            <Toggle
              label="succussion splash"
              on={value.succussionSplash}
              onToggle={() => onChange({ ...value, succussionSplash: !value.succussionSplash })}
            />
          </ChipRow>
        </SectionCard>

        {/* ── §4 — Completion (named signs + PR) ── */}
        <SectionCard
          index={4}
          title="Completion"
          status={completionMeta.status}
          count={completionMeta.count}
          summary={completionMeta.positives.join(" · ")}
          onMarkNormal={markCompletionNormal}
        >
          {completionValuePanels.length ? (
            <div className="flex flex-col gap-2">{completionValuePanels.map(renderPanel)}</div>
          ) : null}
          {completionBinary.length ? (
            <PresentCluster
              label="named signs — tap any that are present"
              options={completionBinary.map((x) => ({
                value: x.code,
                label: x.display,
                mustNotMiss: x.mustNotMiss,
              }))}
              present={completionCluster.present}
              examined={completionCluster.examined}
              onToggle={completionCluster.onToggle}
              onSetExamined={completionCluster.onSetExamined}
            />
          ) : null}
          <div className="border-border/60 mt-1 flex flex-col gap-1.5 rounded-lg border-t pt-2.5">
            <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
              PR examination — omission is recorded, never silently dropped
            </span>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["examined", "Examined"],
                  ["not_examined", "Not examined"],
                  ["declined", "Offered — declined"],
                ] as const
              ).map(([v, lbl]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={value.pr?.state === v}
                  className={seg(value.pr?.state === v, "teal")}
                  onClick={() =>
                    onChange({
                      ...value,
                      pr: {
                        state: v,
                        findings: v === "examined" ? (value.pr?.findings ?? []) : undefined,
                      },
                    })
                  }
                >
                  {lbl}
                </button>
              ))}
            </div>
            {value.pr?.state === "examined" ? (
              <div className="scale-in flex flex-wrap gap-1">
                {PR_FINDING_OPTS.map((opt) => {
                  const on = (value.pr?.findings ?? []).includes(opt);
                  return (
                    <ValueChip
                      key={opt}
                      active={on}
                      onClick={() => {
                        const cur = value.pr?.findings ?? [];
                        onChange({
                          ...value,
                          pr: {
                            state: "examined",
                            findings: on ? cur.filter((x) => x !== opt) : [...cur, opt],
                          },
                        });
                      }}
                    >
                      {opt}
                    </ValueChip>
                  );
                })}
              </div>
            ) : null}
          </div>
        </SectionCard>
      </div>

      {/* Constellation → pattern (decision-support) */}
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

      {renderAbdoProse(value) ? (
        <div className="fade-in-slow rounded-xl border border-teal-200/70 bg-teal-50/60 px-3 py-2 dark:border-teal-900/50 dark:bg-teal-950/20">
          <span className="inline-flex items-center gap-1 text-[10px] font-medium tracking-wide text-teal-700 uppercase dark:text-teal-400">
            <CircleDashedIcon className="size-3" aria-hidden /> Auto-generated summary
          </span>
          <p className="mt-0.5 text-[12px] leading-relaxed text-teal-900/90 italic dark:text-teal-100/80">
            {renderAbdoProse(value)}
          </p>
        </div>
      ) : null}
    </div>
  );
}
