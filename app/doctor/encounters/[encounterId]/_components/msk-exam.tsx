"use client";

import type { SectionStatus, ThreeStateValue } from "./exam-kit";
import type {
  GalsScreen,
  MskExam,
  MskRegion,
  MskRegional,
  MskRom,
  MskSide,
} from "@/lib/clerkship/exam/musculoskeletal";
import type { ExamObservation, FindingState } from "@/lib/clerkship/exam/types";
import { useMemo } from "react";
import {
  AlertTriangleIcon,
  CircleDashedIcon,
  EyeIcon,
  PlusIcon,
  ShieldAlertIcon,
  XIcon,
} from "lucide-react";

import {
  BACK_FLAG_CAUDA,
  BACK_FLAG_CORD,
  BACK_FLAG_FRACTURE,
  BACK_FLAG_INFECTION,
  BACK_FLAG_MALIGNANCY,
  FEEL_OPTS,
  LOOK_OPTS,
  matchMskPatterns,
  MSK_FINDINGS,
  MSK_GROUPS,
  MSK_REGIONS,
  normalMskExam,
  REGION_LOOK_EXTRAS,
  REGION_SPECIAL_TESTS,
  renderMskProse,
} from "@/lib/clerkship/exam/musculoskeletal";
import { cn } from "@/lib/utils";
import {
  ChipRow,
  CompactField,
  FindingGrid,
  NormalExamButton,
  SectionCard,
  ThreeState,
  ValueChip,
} from "./exam-kit";

/**
 * Musculoskeletal examination — EXAMINATION UI v2 (progressive disclosure; ADR
 * 0074). Same MskExam data, handlers, value-sets and behaviour as before;
 * presentation only. The locomotor sequence is now a stack of COLLAPSIBLE
 * SectionCards summarised to one line (status pill + inline positives + on-row
 * "mark normal"): the GALS screen (the rapid fast path), the arthropathy pattern
 * characteriser, regional Look→Feel→Move cards by joint & side (structured ROM +
 * tap-to-cycle special tests, full-width inside the section), the prominent
 * BACK-PAIN RED-FLAG screen (cauda options shared with the neuro exam) rendered
 * as "tap any present" clusters, and the GALS-detail / function measures. The
 * arthropathy pattern panel and auto-summary are DECISION-SUPPORT (multiple on
 * ambiguity, emergencies in red), never an auto-diagnosis. not-examined ≠ normal
 * — three-state honesty preserved with the shared exam-kit. Nothing auto-recorded.
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

function YesNo({
  title,
  value,
  onPick,
  goodIsYes,
}: {
  title: string;
  value: boolean | undefined;
  onPick: (v: boolean | undefined) => void;
  /** Which answer is the reassuring one (for tone only — never colour alone). */
  goodIsYes: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-muted-foreground min-w-0 flex-1 text-[11.5px]">{title}</span>
      {[true, false].map((v) => (
        <button
          key={String(v)}
          type="button"
          aria-pressed={value === v}
          className={seg(value === v, v === goodIsYes ? "teal" : "muted")}
          onClick={() => onPick(value === v ? undefined : v)}
        >
          {v ? "Yes" : "No"}
        </button>
      ))}
    </div>
  );
}

/**
 * Back-pain red-flag chip group — a single VISUAL grouping of flag chips that all
 * write into the ONE shared backRedFlags array. Unlike PresentCluster it carries
 * NO per-group Examined/Not-examined control: a single section-level control
 * governs the whole shared array (see CLINICAL-SAFETY note in the Back section),
 * so toggling one group can never wipe another group's recorded flags. Chip
 * styling mirrors PresentCluster exactly (reserved-red for must-not-miss). */
function BackFlagGroup({
  label,
  options,
  present,
  onToggle,
}: {
  label: string;
  options: { value: string; label: string; mustNotMiss?: boolean }[];
  present: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-muted-foreground text-[11px]">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = present.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(o.value)}
              className={cn(
                "tap inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px] ring-1 transition-colors duration-150 ring-inset",
                on &&
                  o.mustNotMiss &&
                  "bg-red-100 text-red-700 ring-red-500/40 dark:bg-red-950/40 dark:text-red-300",
                on &&
                  !o.mustNotMiss &&
                  "bg-teal-50 text-teal-700 ring-teal-500/40 dark:bg-teal-950/40 dark:text-teal-200",
                !on && "text-foreground/70 ring-border hover:bg-muted/60",
              )}
            >
              {o.mustNotMiss ? <AlertTriangleIcon className="size-3" aria-hidden /> : null}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The SINGLE section-level Examined / Not-examined control governing the whole
 * shared backRedFlags array. Mirrors PresentCluster's toggle styling exactly.
 * "Not examined" intentionally clears the entire back section (one shared array),
 * with no footgun where one sub-group wipes another's flags. */
function BackExaminedControl({
  examined,
  anyPresent,
  onSetExamined,
}: {
  examined: boolean;
  anyPresent: boolean;
  onSetExamined: (examined: boolean) => void;
}) {
  const untouched = !examined && !anyPresent;
  return (
    <div className="border-border inline-flex w-fit overflow-hidden rounded-md border text-[11px]">
      <button
        type="button"
        aria-pressed={examined}
        onClick={() => onSetExamined(true)}
        className={cn(
          "tap px-2.5 py-1 font-medium transition-colors duration-150",
          examined
            ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
            : "text-muted-foreground/70 hover:bg-muted/60",
        )}
      >
        Examined{examined && !anyPresent ? " — none present" : ""}
      </button>
      <span aria-hidden className="bg-border w-px" />
      <button
        type="button"
        aria-pressed={untouched}
        onClick={() => onSetExamined(false)}
        className={cn(
          "tap px-2.5 py-1 font-medium transition-colors duration-150",
          untouched
            ? "text-muted-foreground bg-muted ring-border ring-dashed ring-1 ring-inset"
            : "text-muted-foreground/70 hover:bg-muted/60",
        )}
      >
        Not examined
      </button>
    </div>
  );
}

export function MskExamForm({
  value,
  onChange,
}: {
  value: MskExam;
  onChange: (next: MskExam) => void;
}) {
  const findings = value.findings ?? [];
  const byCode = useMemo(() => new Map(findings.map((o) => [o.code, o])), [findings]);
  const patterns = useMemo(() => matchMskPatterns(value), [value]);
  const gals = value.gals ?? {};

  const setGals = (patch: Partial<GalsScreen>) =>
    onChange({ ...value, gals: { ...gals, ...patch } });

  const setFinding = (code: string, patch: Partial<ExamObservation> | null) => {
    const fd = MSK_FINDINGS.find((x) => x.code === code);
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

  const regions = value.regions ?? [];
  const setRegion = (id: string, patch: Partial<MskRegional>) =>
    onChange({ ...value, regions: regions.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  const toggleIn = (r: MskRegional, key: "look" | "feel", v: string) => {
    const cur = r[key] ?? [];
    setRegion(r.id, { [key]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] });
  };
  // special tests cycle: untested → positive → negative → untested
  const cycleTest = (r: MskRegional, name: string) => {
    const cur = r.specialTests?.[name];
    const rec = { ...(r.specialTests ?? {}) };
    if (cur === undefined) rec[name] = "positive";
    else if (cur === "positive") rec[name] = "negative";
    else delete rec[name];
    setRegion(r.id, { specialTests: rec });
  };

  const toggleFlag = (v: string) => {
    const cur = value.backRedFlags ?? [];
    onChange({
      ...value,
      backRedFlags: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v],
    });
  };

  const galsDomain = (key: "arms" | "legs" | "spine", label: string) => (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground w-12 text-[11px]">{label}</span>
      {(["normal", "abnormal"] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={gals[key] === v}
          className={seg(gals[key] === v, v === "normal" ? "teal" : "muted")}
          onClick={() => setGals({ [key]: gals[key] === v ? undefined : v })}
        >
          {v}
        </button>
      ))}
    </div>
  );

  const presentFindings = findings.filter((o) => o.state === "present").length;

  // ── per-section status / count / inline-positive summary for the collapsed row ──
  // (mirrors the General exemplar's sectionMeta, adapted to the MSK data shapes).

  // GALS screen — questions + four domains; abnormal/unfavourable answers are positives.
  const galsMeta = (): { status: SectionStatus; count: number; summary: string } => {
    const answered = [
      gals.qPainStiffness !== undefined,
      gals.qDress !== undefined,
      gals.qStairs !== undefined,
      gals.gait !== undefined,
      gals.arms !== undefined,
      gals.legs !== undefined,
      gals.spine !== undefined,
    ];
    const total = answered.length;
    const touched = answered.filter(Boolean).length;
    const positives: string[] = [];
    if (gals.qPainStiffness === true) positives.push("pain/stiffness");
    if (gals.qDress === false) positives.push("difficulty dressing");
    if (gals.qStairs === false) positives.push("difficulty stairs");
    if (gals.gait && gals.gait !== "normal") positives.push(`gait ${gals.gait}`);
    if (gals.arms === "abnormal") positives.push("arms abnormal");
    if (gals.legs === "abnormal") positives.push("legs abnormal");
    if (gals.spine === "abnormal") positives.push("spine abnormal");
    const summary = positives.join(" · ");
    if (positives.length) return { status: "findings", count: positives.length, summary };
    if (touched === total) return { status: "normal", count: 0, summary: "" };
    if (touched > 0) return { status: "partial", count: 0, summary: "" };
    return { status: "not_examined", count: 0, summary: "" };
  };

  // Pattern characteriser — distribution/character; a single HOT swollen joint is must-not-miss.
  const charMeta = (): { status: SectionStatus; count: number; summary: string } => {
    const positives: string[] = [];
    if (value.distribution) positives.push(value.distribution);
    if (value.symmetry) positives.push(value.symmetry);
    if (value.jointSize) positives.push(value.jointSize.replace("_", " "));
    if (value.morningStiffness && value.morningStiffness !== "none")
      positives.push(
        value.morningStiffness === "over_30min" ? "morning stiffness >30 min" : "brief stiffness",
      );
    if (value.cannotWeightBear) positives.push("cannot weight-bear");
    if (value.worseWithUse) positives.push("worse with use");
    if (value.migratory) positives.push("migratory");
    if (value.precedingSoreThroat) positives.push("preceding sore throat");
    const summary = [value.hotSwollenJoint ? "single HOT swollen joint" : null, ...positives]
      .filter(Boolean)
      .join(" · ");
    const touched =
      value.distribution !== undefined ||
      value.symmetry !== undefined ||
      value.jointSize !== undefined ||
      value.morningStiffness !== undefined ||
      value.hotSwollenJoint ||
      value.cannotWeightBear ||
      value.worseWithUse ||
      value.migratory ||
      value.precedingSoreThroat;
    if (value.hotSwollenJoint) return { status: "must_not_miss", count: 1, summary };
    if (positives.length) return { status: "findings", count: positives.length, summary };
    if (touched) return { status: "partial", count: 0, summary: "" };
    return { status: "not_examined", count: 0, summary: "" };
  };

  // Regional examination — structured-only; positives = recorded look/feel/abnormal ROM/tests.
  const regionalMeta = (): { status: SectionStatus; count: number; summary: string } => {
    const compartment = regions.some((r) =>
      (r.feel ?? []).includes("pain out of proportion (compartment)"),
    );
    const positives: string[] = [];
    let count = 0;
    for (const r of regions) {
      const label = r.region ? (MSK_REGIONS.find((x) => x.region === r.region)?.label ?? "") : "";
      const bits = [
        ...(r.look ?? []),
        ...(r.feel ?? []),
        r.rom && r.rom !== "full" ? `ROM ${r.rom.replace("_", " + ")}` : null,
        ...Object.entries(r.specialTests ?? {}).map(([t, res]) => `${t} ${res}`),
      ].filter(Boolean) as string[];
      count += bits.length;
      if (bits.length) positives.push(`${label || "region"} — ${bits.join(", ")}`);
    }
    const summary = positives.join(" · ");
    if (compartment) return { status: "must_not_miss", count, summary };
    if (count) return { status: "findings", count, summary };
    if (regions.length) return { status: "partial", count: 0, summary: "" };
    return { status: "not_examined", count: 0, summary: "" };
  };

  // Back-pain red flags — cauda/cord are must-not-miss emergencies; any flag is a positive.
  const backFlags = value.backRedFlags;
  const backExamined = backFlags !== undefined;
  const backMeta = (): { status: SectionStatus; count: number; summary: string } => {
    const all = backFlags ?? [];
    const mnm = all.filter(
      (x) =>
        (BACK_FLAG_CAUDA as readonly string[]).includes(x) ||
        (BACK_FLAG_CORD as readonly string[]).includes(x),
    );
    const summary = all.join(" · ");
    if (mnm.length) return { status: "must_not_miss", count: mnm.length, summary };
    if (all.length) return { status: "findings", count: all.length, summary };
    if (backExamined) return { status: "normal", count: 0, summary: "" };
    return { status: "not_examined", count: 0, summary: "" };
  };

  // GALS detail / function — three-state panels; positives = present findings.
  const detailMeta = (): { status: SectionStatus; count: number; summary: string } => {
    const obs = MSK_FINDINGS.map((x) => ({ x, o: byCode.get(x.code) }));
    const positives = obs.filter(({ o }) => o?.state === "present");
    const touched = obs.filter(({ o }) => o && o.state !== "not_examined");
    const summary = positives
      .map(({ x, o }) => (o?.values?.length ? o.values.join(", ") : x.display))
      .join(" · ");
    if (positives.length) return { status: "findings", count: positives.length, summary };
    if (touched.length === MSK_FINDINGS.length) return { status: "normal", count: 0, summary: "" };
    if (touched.length > 0) return { status: "partial", count: 0, summary: "" };
    return { status: "not_examined", count: 0, summary: "" };
  };

  // ── per-section "mark normal" reusing the exact whole-exam normal where one exists ──
  const markGalsNormal = () => {
    const n = normalMskExam();
    onChange({ ...value, gals: n.gals });
  };
  const markBackNormal = () => {
    const n = normalMskExam();
    onChange({ ...value, backRedFlags: n.backRedFlags });
  };
  const markDetailNormal = () => {
    const n = normalMskExam();
    onChange({ ...value, findings: n.findings });
  };

  // ── back red-flag clusters: present↔removed; examined ⇔ backRedFlags is an array ──
  const setBackExamined = (examined: boolean) =>
    onChange({ ...value, backRedFlags: examined ? (value.backRedFlags ?? []) : undefined });
  const backPresent = (set: readonly string[]) =>
    (value.backRedFlags ?? []).filter((x) => (set as readonly string[]).includes(x));

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-foreground text-[15px] font-medium tracking-[-0.015em]">
          Musculoskeletal examination
        </h3>
        {patterns.length ? (
          <span
            key={patterns.length}
            className={cn(
              "scale-in inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
              patterns.some((p) => p.emergency || p.mustNotMiss)
                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                : "bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300",
            )}
          >
            {patterns.some((p) => p.emergency || p.mustNotMiss) ? (
              <AlertTriangleIcon className="size-3" aria-hidden />
            ) : null}
            {patterns.length} pattern{patterns.length > 1 ? "s" : ""}
          </span>
        ) : null}
        <span className="ml-auto">
          <NormalExamButton onClick={() => onChange(normalMskExam())} label="Normal GALS screen" />
        </span>
      </div>

      {/* Clinical sequence — collapsible SectionCards (collapsed by default) */}
      <div className="flex flex-col gap-2.5">
        {/* ── Section 1 — GALS screen (the rapid fast path) ── */}
        {(() => {
          const { status, count, summary } = galsMeta();
          return (
            <SectionCard
              index={1}
              title="GALS screen"
              status={status}
              count={count}
              summary={summary}
              onMarkNormal={markGalsNormal}
            >
              <YesNo
                title="Pain or stiffness in muscles, joints or back?"
                value={gals.qPainStiffness}
                onPick={(v) => setGals({ qPainStiffness: v })}
                goodIsYes={false}
              />
              <YesNo
                title="Can dress completely without difficulty?"
                value={gals.qDress}
                onPick={(v) => setGals({ qDress: v })}
                goodIsYes={true}
              />
              <YesNo
                title="Can manage stairs without difficulty?"
                value={gals.qStairs}
                onPick={(v) => setGals({ qStairs: v })}
                goodIsYes={true}
              />
              <div className="border-border/60 mt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground w-12 text-[11px]">Gait</span>
                  {(["normal", "antalgic", "abnormal"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={gals.gait === v}
                      className={seg(gals.gait === v, v === "normal" ? "teal" : "muted")}
                      onClick={() => setGals({ gait: gals.gait === v ? undefined : v })}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                {galsDomain("arms", "Arms")}
                {galsDomain("legs", "Legs")}
                {galsDomain("spine", "Spine")}
              </div>
              <span className="text-muted-foreground text-[10px]">
                An abnormal domain → add the regional exam below.
              </span>
            </SectionCard>
          );
        })()}

        {/* ── Section 2 — Pattern characteriser (drives the arthropathy engine) ── */}
        {(() => {
          const { status, count, summary } = charMeta();
          return (
            <SectionCard
              index={2}
              title="Pattern characteriser"
              status={status}
              count={count}
              summary={summary}
            >
              <Row
                title="Distribution"
                options={["monoarticular", "oligoarticular", "polyarticular"]}
                value={value.distribution}
                onPick={(v) => onChange({ ...value, distribution: v as MskExam["distribution"] })}
              />
              <Row
                title="Symmetry"
                options={["symmetrical", "asymmetrical"]}
                value={value.symmetry}
                onPick={(v) => onChange({ ...value, symmetry: v as MskExam["symmetry"] })}
              />
              <Row
                title="Joints"
                options={[
                  { value: "small_joints", label: "small joints" },
                  { value: "large_joints", label: "large joints" },
                  { value: "mixed", label: "mixed" },
                ]}
                value={value.jointSize}
                onPick={(v) => onChange({ ...value, jointSize: v as MskExam["jointSize"] })}
              />
              <Row
                title="Morning stiffness"
                options={[
                  { value: "none", label: "none" },
                  { value: "brief", label: "brief" },
                  { value: "over_30min", label: ">30 min" },
                ]}
                value={value.morningStiffness}
                onPick={(v) =>
                  onChange({ ...value, morningStiffness: v as MskExam["morningStiffness"] })
                }
              />
              <ChipRow label="Character">
                <ValueChip
                  active={!!value.hotSwollenJoint}
                  tone="alarm"
                  onClick={() => onChange({ ...value, hotSwollenJoint: !value.hotSwollenJoint })}
                >
                  single HOT swollen joint
                </ValueChip>
                <ValueChip
                  active={!!value.cannotWeightBear}
                  onClick={() => onChange({ ...value, cannotWeightBear: !value.cannotWeightBear })}
                >
                  cannot weight-bear
                </ValueChip>
                <ValueChip
                  active={!!value.worseWithUse}
                  onClick={() => onChange({ ...value, worseWithUse: !value.worseWithUse })}
                >
                  worse with use
                </ValueChip>
                <ValueChip
                  active={!!value.migratory}
                  onClick={() => onChange({ ...value, migratory: !value.migratory })}
                >
                  migratory
                </ValueChip>
                <ValueChip
                  active={!!value.precedingSoreThroat}
                  onClick={() =>
                    onChange({ ...value, precedingSoreThroat: !value.precedingSoreThroat })
                  }
                >
                  preceding sore throat
                </ValueChip>
              </ChipRow>
            </SectionCard>
          );
        })()}

        {/* ── Section 3 — Regional examination · Look → Feel → Move (structured-only) ── */}
        {(() => {
          const { status, count, summary } = regionalMeta();
          return (
            <SectionCard
              index={3}
              title="Regional examination"
              status={status}
              count={count}
              summary={summary}
            >
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                  add the symptomatic region(s) · Look · Feel · Move
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onChange({ ...value, regions: [...regions, { id: crypto.randomUUID() }] })
                  }
                  className="tap text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[11.5px]"
                >
                  <PlusIcon className="size-3.5" aria-hidden /> Add region
                </button>
              </div>
              {regions.length === 0 ? (
                <p className="text-muted-foreground text-[11px]">
                  No regional exam recorded — add the symptomatic region(s).
                </p>
              ) : (
                regions.map((r, i) => {
                  const lookOpts = [
                    ...LOOK_OPTS,
                    ...(r.region ? REGION_LOOK_EXTRAS[r.region] : []),
                  ];
                  const tests = r.region ? REGION_SPECIAL_TESTS[r.region] : [];
                  return (
                    <div
                      key={r.id}
                      className="border-border/70 scale-in flex flex-col gap-1.5 rounded-lg border p-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                          Region {i + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            onChange({ ...value, regions: regions.filter((x) => x.id !== r.id) })
                          }
                          className="tap text-muted-foreground hover:text-foreground"
                          aria-label="Remove region"
                        >
                          <XIcon className="size-3.5" />
                        </button>
                      </div>
                      <Row
                        title="Region"
                        options={MSK_REGIONS.map((x) => ({ value: x.region, label: x.label }))}
                        value={r.region}
                        onPick={(v) => setRegion(r.id, { region: v as MskRegion | undefined })}
                      />
                      <Row
                        title="Side"
                        options={["right", "left", "bilateral"]}
                        value={r.side}
                        onPick={(v) => setRegion(r.id, { side: v as MskSide | undefined })}
                      />
                      <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
                        <span className="text-muted-foreground w-24 shrink-0 pt-0.5 text-[11px]">
                          Look
                        </span>
                        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                          {lookOpts.map((o) => (
                            <ValueChip
                              key={o}
                              active={(r.look ?? []).includes(o)}
                              onClick={() => toggleIn(r, "look", o)}
                            >
                              {o}
                            </ValueChip>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
                        <span className="text-muted-foreground w-24 shrink-0 pt-0.5 text-[11px]">
                          Feel
                        </span>
                        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                          {FEEL_OPTS.map((o) => (
                            <ValueChip
                              key={o}
                              active={(r.feel ?? []).includes(o)}
                              tone={o.includes("compartment") ? "alarm" : "default"}
                              onClick={() => toggleIn(r, "feel", o)}
                            >
                              {o}
                            </ValueChip>
                          ))}
                        </div>
                      </div>
                      <Row
                        title="Move (ROM)"
                        options={[
                          { value: "full", label: "full" },
                          { value: "restricted", label: "restricted" },
                          { value: "restricted_painful", label: "restricted + painful" },
                        ]}
                        value={r.rom}
                        onPick={(v) => setRegion(r.id, { rom: v as MskRom | undefined })}
                      />
                      {tests.length ? (
                        <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
                          <span className="text-muted-foreground w-24 shrink-0 pt-0.5 text-[11px]">
                            Special tests
                          </span>
                          <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                            {tests.map((t) => {
                              const res = r.specialTests?.[t];
                              return (
                                <ValueChip
                                  key={t}
                                  active={res !== undefined}
                                  tone={res === "positive" ? "amber" : "teal"}
                                  onClick={() => cycleTest(r, t)}
                                >
                                  {t}
                                  {res ? ` · ${res === "positive" ? "+" : "−"}` : ""}
                                </ValueChip>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                      {tests.length ? (
                        <span className="text-muted-foreground pl-26 text-[10px]">
                          Tap a test to cycle: positive → negative → untested.
                        </span>
                      ) : null}
                    </div>
                  );
                })
              )}
            </SectionCard>
          );
        })()}

        {/* ── Section 4 — Back-pain red flags (mechanical back pain = exclusion) ── */}
        {(() => {
          const { status, count, summary } = backMeta();
          return (
            <SectionCard
              index={4}
              title="Back-pain red flags"
              status={status}
              count={count}
              summary={summary}
              onMarkNormal={markBackNormal}
            >
              <span className="text-muted-foreground text-[10px]">
                mechanical back pain is a diagnosis of exclusion — tap any present
              </span>
              {/* CLINICAL SAFETY: all five groups write into the ONE shared
                  backRedFlags array, and a SINGLE section-level Examined / Not-
                  examined control (below) governs that whole array. There is
                  deliberately no per-group examined toggle — that prevents the
                  data-loss footgun where marking one sub-group "not examined"
                  would wipe a flag (e.g. a cauda-equina must-not-miss) recorded
                  in another group. "Not examined" clears the whole section. */}
              <BackFlagGroup
                label="Cauda equina"
                options={BACK_FLAG_CAUDA.map((o) => ({ value: o, label: o, mustNotMiss: true }))}
                present={backPresent(BACK_FLAG_CAUDA)}
                onToggle={toggleFlag}
              />
              <BackFlagGroup
                label="Cord"
                options={BACK_FLAG_CORD.map((o) => ({ value: o, label: o, mustNotMiss: true }))}
                present={backPresent(BACK_FLAG_CORD)}
                onToggle={toggleFlag}
              />
              <BackFlagGroup
                label="Malignancy"
                options={BACK_FLAG_MALIGNANCY.map((o) => ({ value: o, label: o }))}
                present={backPresent(BACK_FLAG_MALIGNANCY)}
                onToggle={toggleFlag}
              />
              <BackFlagGroup
                label="Infection"
                options={BACK_FLAG_INFECTION.map((o) => ({ value: o, label: o }))}
                present={backPresent(BACK_FLAG_INFECTION)}
                onToggle={toggleFlag}
              />
              <BackFlagGroup
                label="Fracture"
                options={BACK_FLAG_FRACTURE.map((o) => ({ value: o, label: o }))}
                present={backPresent(BACK_FLAG_FRACTURE)}
                onToggle={toggleFlag}
              />
              <BackExaminedControl
                examined={backExamined}
                anyPresent={(value.backRedFlags ?? []).length > 0}
                onSetExamined={setBackExamined}
              />
            </SectionCard>
          );
        })()}

        {/* ── Section 5 — GALS detail · function & measure ── */}
        {(() => {
          const { status, count, summary } = detailMeta();
          return (
            <SectionCard
              index={5}
              title="GALS detail · function & measure"
              status={status}
              count={count}
              summary={summary}
              onMarkNormal={markDetailNormal}
            >
              {MSK_GROUPS.map((g) => {
                const inGroup = MSK_FINDINGS.filter((x) => x.group === g.key);
                return (
                  <div key={g.key} className="flex flex-col gap-2">
                    <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                      {g.label}
                    </span>
                    <FindingGrid>
                      {inGroup.map((x) => {
                        const o = byCode.get(x.code);
                        const state: ThreeStateValue = o?.state ?? "not_examined";
                        return (
                          <CompactField
                            key={x.code}
                            label={x.display}
                            control={
                              <ThreeState
                                value={state}
                                findingsLabel={x.options.length ? "Findings" : "Present"}
                                onChange={(v) =>
                                  setFinding(
                                    x.code,
                                    v === "not_examined"
                                      ? null
                                      : {
                                          state: v,
                                          values: v === "absent" ? [] : (o?.values ?? []),
                                        },
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
                      })}
                    </FindingGrid>
                  </div>
                );
              })}
              <p className="text-muted-foreground border-border/40 border-t pt-2 text-[10px]">
                Hands/nails, rash, lymph nodes &amp; the gait first-impression are also captured in
                the general examination.
              </p>
            </SectionCard>
          );
        })()}
      </div>

      {/* Pattern panel (decision-support) */}
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

      {/* Auto-generated documentation summary (honest: not-examined ≠ normal) */}
      {renderMskProse(value) ? (
        <div className="fade-in-slow rounded-xl border border-teal-200/70 bg-teal-50/60 px-3 py-2 dark:border-teal-900/50 dark:bg-teal-950/20">
          <span className="inline-flex items-center gap-1 text-[10px] font-medium tracking-wide text-teal-700 uppercase dark:text-teal-400">
            <CircleDashedIcon className="size-3" aria-hidden /> Auto-generated summary
          </span>
          <p className="mt-0.5 text-[12px] leading-relaxed text-teal-900/90 italic dark:text-teal-100/80">
            {renderMskProse(value)}
          </p>
        </div>
      ) : presentFindings || patterns.length ? null : (
        <p className="text-muted-foreground inline-flex items-center gap-1.5 text-[11px]">
          <EyeIcon className="size-3" aria-hidden /> Run the GALS screen, or set it normal and
          characterise only the positive region(s).
        </p>
      )}
    </div>
  );
}
