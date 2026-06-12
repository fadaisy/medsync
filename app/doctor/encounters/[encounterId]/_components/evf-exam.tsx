"use client";

import type { SectionStatus, ThreeStateValue } from "./exam-kit";
import type {
  DiabeticFootSide,
  EvfExam,
  FootSite,
  NamedPulse,
  PulseGrade,
  Side,
  ThyroidExam,
  VascularExam,
} from "@/lib/clerkship/exam/endo-vascular-foot";
import type { ExamObservation, FindingState } from "@/lib/clerkship/exam/types";
import { useMemo } from "react";
import { AlertTriangleIcon, CircleDashedIcon, ShieldAlertIcon } from "lucide-react";

import {
  ABPI_BAND_LABEL,
  ARTERIAL_BRUIT_OPTS,
  ARTERIAL_LOOK_OPTS,
  computeAbpi,
  EVF_FINDINGS,
  FOOT_DEFORMITY_OPTS,
  FOOT_INFECTION_OPTS,
  FOOT_MONOFILAMENT_SITES,
  FOOT_RISK,
  FOOT_RISK_SOURCE,
  FOOT_SKIN_OPTS,
  interpretAbpi,
  matchEvfPatterns,
  NAMED_PULSES,
  renderEvfProse,
  SIX_PS,
  suggestFootRisk,
  THYROID_EYE_OPTS,
  THYROID_GLAND_OPTS,
  VENOUS_LOOK_OPTS,
} from "@/lib/clerkship/exam/endo-vascular-foot";
import { cn } from "@/lib/utils";
import {
  ChipRow,
  CompactField,
  CycleLegend,
  FindingGrid,
  SectionCard,
  ThreeState,
  ValueChip,
} from "./exam-kit";

/**
 * Endocrine · Peripheral Vascular · Diabetic-Foot — EXAMINATION UI v2
 * (progressive disclosure; ADR 0074). Same EvfExam data, handlers, value-sets and
 * behaviour as before; presentation only. The three linked sub-exams are now
 * COLLAPSIBLE SectionCards (Thyroid → Peripheral vascular → Diabetic foot),
 * collapsed by default and summarised to one line (status pill + inline positives).
 * A fully-normal exam reads as a tidy stack of "All normal" cards. Inside a section
 * the structured controls are unchanged: the pulses grid + PulseRow, the ABPI input
 * with its cited interpretation, the monofilament map, the per-side foot panels, and
 * the IWGDF risk category (SUGGESTED → clinician-CONFIRMED, never auto-assigned).
 * Long binary sign lists (gland / eyes / arterial / venous / skin / deformity /
 * infection) tap to present with reserved-red for must-not-miss. Clusters are
 * decision-support (emergencies in red), never auto-diagnoses. not-examined ≠ normal.
 * The verified constants (ABPI thresholds, IWGDF intervals + source) are untouched.
 */

const seg = (active: boolean, tone: "muted" | "teal" = "muted") =>
  `tap inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset transition-colors duration-150 ${
    active
      ? tone === "teal"
        ? "bg-teal-50 text-teal-700 ring-teal-500/40 dark:bg-teal-950/40 dark:text-teal-200"
        : "bg-slate-100 text-slate-700 ring-slate-400/50 dark:bg-slate-800 dark:text-slate-200"
      : "text-muted-foreground ring-border hover:bg-muted/60"
  }`;

/** A labelled multi-select row built on the kit's ValueChip / ChipRow. */
function MultiRow({
  title,
  options,
  values,
  onToggle,
  alarm,
}: {
  title: string;
  options: readonly string[];
  values: string[] | undefined;
  onToggle: (v: string) => void;
  alarm?: (v: string) => boolean;
}) {
  return (
    <ChipRow label={title}>
      {options.map((o) => {
        const on = (values ?? []).includes(o);
        return (
          <ValueChip
            key={o}
            active={on}
            tone={alarm?.(o) ? "alarm" : "default"}
            onClick={() => onToggle(o)}
          >
            {o}
          </ValueChip>
        );
      })}
    </ChipRow>
  );
}

export function EvfExamForm({
  value,
  onChange,
}: {
  value: EvfExam;
  onChange: (next: EvfExam) => void;
}) {
  const findings = value.findings ?? [];
  const byCode = useMemo(() => new Map(findings.map((o) => [o.code, o])), [findings]);
  const patterns = useMemo(() => matchEvfPatterns(value), [value]);

  const setFinding = (code: string, patch: Partial<ExamObservation> | null) => {
    const fd = EVF_FINDINGS.find((x) => x.code === code);
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

  const setThyroid = (patch: Partial<ThyroidExam>) =>
    onChange({ ...value, thyroid: { ...value.thyroid, ...patch } });
  const toggleThy = (key: "gland" | "eyeSigns", v: string) => {
    const cur = (value.thyroid?.[key] ?? []) as string[];
    setThyroid({
      [key]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v],
    } as Partial<ThyroidExam>);
  };

  const v = value.vascular ?? {};
  const setVasc = (patch: Partial<VascularExam>) =>
    onChange({ ...value, vascular: { ...v, ...patch } });
  const toggleVascList = (
    key: "arterialLook" | "venousLook" | "bruits" | "acuteIschaemia",
    val: string,
  ) => {
    const cur = (v[key] ?? []) as string[];
    setVasc({
      [key]: cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val],
    } as Partial<VascularExam>);
  };
  const cyclePulse = (p: NamedPulse, side: Side) => {
    const order: (PulseGrade | undefined)[] = ["present", "reduced", "absent", undefined];
    const cur = v.pulses?.[p]?.[side];
    const next = order[(order.indexOf(cur) + 1) % order.length];
    const pulses = { ...(v.pulses ?? {}) };
    const rec = { ...(pulses[p] ?? {}) };
    if (next) rec[side] = next;
    else delete rec[side];
    pulses[p] = rec;
    setVasc({ pulses });
  };

  const foot = value.foot ?? {};
  const setFootSide = (side: Side, patch: Partial<DiabeticFootSide>) =>
    onChange({ ...value, foot: { ...foot, [side]: { ...foot[side], ...patch } } });
  const toggleFootList = (side: Side, key: "skin" | "deformity" | "infection", val: string) => {
    const cur = (foot[side]?.[key] ?? []) as string[];
    setFootSide(side, {
      [key]: cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val],
    } as Partial<DiabeticFootSide>);
  };
  const suggestion = suggestFootRisk(foot);

  // ── render a thyroid catalog finding with the kit (compact three-state + value chips) ──
  const renderThyFinding = (x: (typeof EVF_FINDINGS)[number]) => {
    const o = byCode.get(x.code);
    const state: ThreeStateValue = o?.state ?? "not_examined";
    return (
      <CompactField
        key={x.code}
        label={x.display}
        control={
          <ThreeState
            value={state}
            onChange={(next) =>
              setFinding(
                x.code,
                next === "not_examined"
                  ? null
                  : { state: next, values: next === "absent" ? [] : (o?.values ?? []) },
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
                          ? (o?.values ?? []).filter((y) => y !== opt)
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

  // ── per-section status / count / inline-positive summary for the collapsed row ──
  // Honest: not-examined is a distinct default; a positive must-not-miss flips the
  // section to the reserved-red status. Decision-support only — never auto-recorded.

  const thyMeta = ((): { status: SectionStatus; count: number; summary: string } => {
    const cat = EVF_FINDINGS.filter(
      (x) => x.group === "thyroid_peripheral" || x.group === "thyroid_legs",
    );
    const catPos = cat.filter((x) => byCode.get(x.code)?.state === "present");
    const gland = value.thyroid?.gland ?? [];
    const eyes = value.thyroid?.eyeSigns ?? [];
    const statusPos =
      value.thyroid?.status === "hyperthyroid" || value.thyroid?.status === "hypothyroid";
    const mnmGland = gland.filter(
      (g) => g === "fixed / hard" || g === "retrosternal" || g === "cervical nodes",
    );
    const positives = [
      ...catPos.map((x) => {
        const vals = byCode.get(x.code)?.values ?? [];
        return vals.length ? vals.join(", ") : x.display;
      }),
      ...(statusPos ? [value.thyroid!.status!] : []),
      ...gland,
      ...eyes,
    ];
    const count = catPos.length + (statusPos ? 1 : 0) + gland.length + eyes.length;
    const touched =
      cat.some((x) => (byCode.get(x.code)?.state ?? "not_examined") !== "not_examined") ||
      !!value.thyroid?.status ||
      gland.length > 0 ||
      eyes.length > 0;
    const summary = positives.join(" · ");
    if (mnmGland.length) return { status: "must_not_miss", count: mnmGland.length, summary };
    if (count) return { status: "findings", count, summary };
    if (touched) return { status: "partial", count: 0, summary: "" };
    return { status: "not_examined", count: 0, summary: "" };
  })();

  const vascMeta = ((): { status: SectionStatus; count: number; summary: string } => {
    const abpiBands = (["right", "left"] as Side[])
      .map((s) => interpretAbpi(v.abpi?.[s]))
      .filter((b): b is NonNullable<typeof b> => !!b);
    const abnPulses: string[] = [];
    for (const p of NAMED_PULSES) {
      for (const side of ["right", "left"] as Side[]) {
        const g = v.pulses?.[p]?.[side];
        if (g && g !== "present") abnPulses.push(`${side === "right" ? "R" : "L"} ${p} ${g}`);
      }
    }
    const arterial = v.arterialLook ?? [];
    const venous = v.venousLook ?? [];
    const bruits = v.bruits ?? [];
    const ischaemia = v.acuteIschaemia ?? [];
    const abnAbpi = abpiBands.filter((b) => b !== "normal");
    const positives = [
      ...arterial,
      ...abnPulses,
      ...abnAbpi.map((b) => ABPI_BAND_LABEL[b]),
      ...(v.buergers === "positive" ? ["Buerger's positive"] : []),
      ...bruits.map((b) => `${b} bruit`),
      ...ischaemia,
      ...(v.restPain ? ["rest pain"] : []),
      ...(v.dvtSigns ? ["unilateral calf swelling (DVT)"] : []),
      ...venous,
    ];
    const count = positives.length;
    const touched =
      arterial.length > 0 ||
      venous.length > 0 ||
      bruits.length > 0 ||
      ischaemia.length > 0 ||
      abnPulses.length > 0 ||
      abpiBands.length > 0 ||
      v.buergers !== undefined ||
      !!v.restPain ||
      !!v.dvtSigns;
    // must-not-miss: acute limb ischaemia (≥2 P's), critical ABPI, or gangrene seen.
    const mnm =
      ischaemia.length >= 2 || abpiBands.includes("critical") || arterial.includes("gangrene");
    const summary = positives.join(" · ");
    if (mnm) return { status: "must_not_miss", count, summary };
    if (count) return { status: "findings", count, summary };
    if (touched) return { status: "partial", count: 0, summary: "" };
    return { status: "not_examined", count: 0, summary: "" };
  })();

  const footMeta = ((): { status: SectionStatus; count: number; summary: string } => {
    const positives: string[] = [];
    let touched = false;
    let mnm = false;
    for (const side of ["right", "left"] as Side[]) {
      const s = foot[side];
      if (!s) continue;
      const notFelt = Object.values(s.monofilament ?? {}).filter((felt) => felt === false).length;
      const total = Object.keys(s.monofilament ?? {}).length;
      if (
        (s.skin ?? []).length ||
        (s.deformity ?? []).length ||
        (s.infection ?? []).length ||
        total ||
        s.vibration !== undefined ||
        s.pulsesPresent !== undefined ||
        !!s.warmCharcot
      )
        touched = true;
      const lab = side === "right" ? "R" : "L";
      for (const x of s.skin ?? []) positives.push(`${lab} ${x}`);
      for (const x of s.deformity ?? []) positives.push(`${lab} ${x}`);
      for (const x of s.infection ?? []) positives.push(`${lab} ${x}`);
      if (notFelt) positives.push(`${lab} LOPS (${notFelt} not felt)`);
      if (s.vibration && s.vibration !== "felt") positives.push(`${lab} vibration ${s.vibration}`);
      if (s.pulsesPresent === false) positives.push(`${lab} foot pulses absent`);
      if (s.warmCharcot) positives.push(`${lab} warm swollen (?Charcot)`);
      // must-not-miss: gangrene / ulcer, any infection, absent pulses, ?Charcot.
      if (
        (s.skin ?? []).some((x) => x === "gangrene" || x.includes("ulcer")) ||
        (s.infection ?? []).length > 0 ||
        s.pulsesPresent === false ||
        !!s.warmCharcot
      )
        mnm = true;
    }
    if (foot.priorUlcerOrAmputation) {
      positives.push("prior ulcer / amputation");
      touched = true;
    }
    if (foot.endStageRenal) {
      positives.push("end-stage renal disease");
      touched = true;
    }
    if (foot.systemicSepsis) {
      positives.push("systemic sepsis");
      touched = true;
      mnm = true;
    }
    if (suggestion?.risk.urgent) mnm = true;
    const count = positives.length;
    const summary = positives.join(" · ");
    if (mnm) return { status: "must_not_miss", count, summary };
    if (count) return { status: "findings", count, summary };
    if (touched) return { status: "partial", count: 0, summary: "" };
    return { status: "not_examined", count: 0, summary: "" };
  })();

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-foreground text-[15px] font-medium tracking-[-0.015em]">
          Endocrine · vascular · foot
        </h3>
        {patterns.length ? (
          <span
            key={patterns.length}
            className={cn(
              "scale-in inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
              patterns.some((p) => p.emergency)
                ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
            )}
          >
            <AlertTriangleIcon className="size-3" aria-hidden />
            {patterns.length} pattern{patterns.length > 1 ? "s" : ""}
          </span>
        ) : null}
      </div>

      {/* Linked sub-exams — one collapsible SectionCard each (collapsed by default) */}
      <div className="flex flex-col gap-2.5">
        {/* ── 1 · Thyroid status ── */}
        <SectionCard
          index={1}
          title="Thyroid status"
          status={thyMeta.status}
          count={thyMeta.count}
          summary={thyMeta.summary}
        >
          <ChipRow label="Status lean">
            {(["euthyroid", "hyperthyroid", "hypothyroid"] as const).map((s) => (
              <ValueChip
                key={s}
                active={value.thyroid?.status === s}
                onClick={() => setThyroid({ status: value.thyroid?.status === s ? undefined : s })}
              >
                {s}
              </ValueChip>
            ))}
          </ChipRow>
          <FindingGrid>
            {EVF_FINDINGS.filter(
              (x) => x.group === "thyroid_peripheral" || x.group === "thyroid_legs",
            ).map(renderThyFinding)}
          </FindingGrid>
          <MultiRow
            title="Gland"
            options={THYROID_GLAND_OPTS}
            values={value.thyroid?.gland}
            onToggle={(v2) => toggleThy("gland", v2)}
            alarm={(o) => o === "fixed / hard" || o === "retrosternal" || o === "cervical nodes"}
          />
          <MultiRow
            title="Eyes (Graves')"
            options={THYROID_EYE_OPTS}
            values={value.thyroid?.eyeSigns}
            onToggle={(v2) => toggleThy("eyeSigns", v2)}
          />
        </SectionCard>

        {/* ── 2 · Peripheral vascular ── */}
        <SectionCard
          index={2}
          title="Peripheral vascular"
          status={vascMeta.status}
          count={vascMeta.count}
          summary={vascMeta.summary}
        >
          <MultiRow
            title="Arterial look"
            options={ARTERIAL_LOOK_OPTS}
            values={v.arterialLook}
            onToggle={(x) => toggleVascList("arterialLook", x)}
            alarm={(o) => o === "gangrene"}
          />
          {/* Pulses grid */}
          <div className="border-border/60 mt-1 flex flex-col gap-1.5 rounded-lg border-t pt-2.5">
            <div className="flex flex-wrap items-center justify-between gap-x-2">
              <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                Pulses
              </span>
              <CycleLegend steps={["present", "reduced", "absent"]} />
            </div>
            <div className="mt-0.5 grid grid-cols-[auto_1fr_1fr] items-center gap-x-2 gap-y-1 text-[11px]">
              <span />
              <span className="text-muted-foreground text-center text-[10px]">R</span>
              <span className="text-muted-foreground text-center text-[10px]">L</span>
              {NAMED_PULSES.map((p) => (
                <PulseRow
                  key={p}
                  name={p}
                  value={v.pulses?.[p]}
                  onCycle={(side) => cyclePulse(p, side)}
                />
              ))}
            </div>
          </div>
          {/* ABPI — AUTO-CALCULATED from ankle ÷ brachial systolic */}
          <div className="border-border/60 mt-1 flex flex-col gap-2 rounded-lg border-t pt-2.5">
            <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
              ABPI
              <span className="ml-1 normal-case opacity-70">
                · auto-calculated (ankle ÷ brachial systolic)
              </span>
            </span>
            {/* Brachial systolic — the denominator (higher arm) */}
            <label className="inline-flex w-fit items-center gap-1.5">
              <span className="text-muted-foreground text-[11px]">Brachial systolic (mmHg)</span>
              <input
                type="number"
                inputMode="numeric"
                className="border-input bg-card w-20 rounded border px-1.5 py-1 text-[12px] tabular-nums outline-none focus-visible:border-teal-500"
                value={v.brachialSystolic ?? ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  const brachialSystolic =
                    e.target.value === "" || !Number.isFinite(n) ? undefined : n;
                  setVasc({
                    brachialSystolic,
                    abpi: {
                      right: computeAbpi(v.ankleSystolic?.right, brachialSystolic),
                      left: computeAbpi(v.ankleSystolic?.left, brachialSystolic),
                    },
                  });
                }}
              />
            </label>
            {/* Ankle systolic per side → computed ABPI + interpretation */}
            <div className="flex flex-col gap-2">
              {(["right", "left"] as Side[]).map((side) => {
                const abpi = v.abpi?.[side];
                const band = interpretAbpi(abpi);
                return (
                  <div key={side} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <label className="inline-flex items-center gap-1.5">
                      <span className="text-muted-foreground text-[11px]">
                        Ankle systolic {side === "right" ? "R" : "L"} (mmHg)
                      </span>
                      <input
                        type="number"
                        inputMode="numeric"
                        className="border-input bg-card w-20 rounded border px-1.5 py-1 text-[12px] tabular-nums outline-none focus-visible:border-teal-500"
                        value={v.ankleSystolic?.[side] ?? ""}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          const ankleVal =
                            e.target.value === "" || !Number.isFinite(n) ? undefined : n;
                          setVasc({
                            ankleSystolic: { ...v.ankleSystolic, [side]: ankleVal },
                            abpi: {
                              ...v.abpi,
                              [side]: computeAbpi(ankleVal, v.brachialSystolic),
                            },
                          });
                        }}
                      />
                    </label>
                    <span className="font-mono text-[12px] tabular-nums">
                      = ABPI {side === "right" ? "R" : "L"}{" "}
                      <span className="text-foreground font-semibold">
                        {abpi != null ? abpi.toFixed(2) : "—"}
                      </span>
                    </span>
                    {band ? (
                      <span
                        className={cn(
                          "text-[10px]",
                          band === "critical"
                            ? "text-red-600 dark:text-red-400"
                            : band === "pad" || band === "calcified"
                              ? "text-amber-700 dark:text-amber-400"
                              : "text-muted-foreground",
                        )}
                      >
                        {ABPI_BAND_LABEL[band]}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
          {/* Special tests + ischaemia */}
          <div className="border-border/60 mt-1 flex flex-col gap-1.5 rounded-lg border-t pt-2.5">
            <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
              Special tests &amp; ischaemia
            </span>
            <ChipRow label="Buerger's">
              {(["positive", "negative"] as const).map((b) => (
                <ValueChip
                  key={b}
                  active={v.buergers === b}
                  onClick={() => setVasc({ buergers: v.buergers === b ? undefined : b })}
                >
                  {b}
                </ValueChip>
              ))}
            </ChipRow>
            <MultiRow
              title="Bruits"
              options={ARTERIAL_BRUIT_OPTS}
              values={v.bruits}
              onToggle={(x) => toggleVascList("bruits", x)}
            />
            <MultiRow
              title="Acute ischaemia (6 P's)"
              options={SIX_PS}
              values={v.acuteIschaemia}
              onToggle={(x) => toggleVascList("acuteIschaemia", x)}
              alarm={() => true}
            />
            <ChipRow label="Other">
              <ValueChip active={!!v.restPain} onClick={() => setVasc({ restPain: !v.restPain })}>
                rest pain
              </ValueChip>
              <ValueChip active={!!v.dvtSigns} onClick={() => setVasc({ dvtSigns: !v.dvtSigns })}>
                unilateral calf swelling (DVT)
              </ValueChip>
            </ChipRow>
          </div>
          {/* Venous */}
          <div className="border-border/60 mt-1 flex flex-col gap-1.5 rounded-lg border-t pt-2.5">
            <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
              Venous
            </span>
            <MultiRow
              title="Venous"
              options={VENOUS_LOOK_OPTS}
              values={v.venousLook}
              onToggle={(x) => toggleVascList("venousLook", x)}
            />
          </div>
        </SectionCard>

        {/* ── 3 · Diabetic foot ── */}
        <SectionCard
          index={3}
          title="Diabetic foot"
          status={footMeta.status}
          count={footMeta.count}
          summary={footMeta.summary}
        >
          {(["right", "left"] as Side[]).map((side) => {
            const s = foot[side] ?? {};
            const notFelt = Object.values(s.monofilament ?? {}).filter(
              (felt) => felt === false,
            ).length;
            return (
              <div
                key={side}
                className="border-border/70 flex flex-col gap-1.5 rounded-lg border p-2.5"
              >
                <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                  {side === "right" ? "Right" : "Left"} foot
                </span>
                <MultiRow
                  title="Skin"
                  options={FOOT_SKIN_OPTS}
                  values={s.skin}
                  onToggle={(x) => toggleFootList(side, "skin", x)}
                  alarm={(o) => o === "gangrene" || o.includes("ulcer")}
                />
                <MultiRow
                  title="Deformity"
                  options={FOOT_DEFORMITY_OPTS}
                  values={s.deformity}
                  onToggle={(x) => toggleFootList(side, "deformity", x)}
                  alarm={(o) => o.startsWith("Charcot")}
                />
                {/* Monofilament map — teal (felt) vs amber (not felt) vs ghost (untested) */}
                <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
                  <span className="text-muted-foreground w-24 shrink-0 pt-0.5 text-[11px]">
                    10 g monofilament
                  </span>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                    {FOOT_MONOFILAMENT_SITES.map(({ site, label }) => {
                      const felt = s.monofilament?.[site];
                      return (
                        <button
                          key={site}
                          type="button"
                          onClick={() => {
                            const order: (boolean | undefined)[] = [true, false, undefined];
                            const next = order[(order.indexOf(felt) + 1) % order.length];
                            const mono = { ...(s.monofilament ?? {}) };
                            if (next === undefined) delete mono[site as FootSite];
                            else mono[site as FootSite] = next;
                            setFootSide(side, { monofilament: mono });
                          }}
                          className={cn(
                            "tap rounded-md border px-2 py-0.5 text-[11px] transition-colors duration-150",
                            felt === true
                              ? "border-teal-500/50 bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-200"
                              : felt === false
                                ? "border-amber-500/50 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                                : "border-border text-foreground/70 hover:bg-muted/60 border-dashed",
                          )}
                          aria-label={`${label} monofilament ${felt === true ? "felt" : felt === false ? "not felt" : "untested"}`}
                        >
                          {label} {felt === true ? "✓" : felt === false ? "✗" : "·"}
                        </button>
                      );
                    })}
                    {notFelt ? (
                      <span className="self-center text-[10px] text-amber-700 dark:text-amber-400">
                        LOPS ({notFelt} not felt)
                      </span>
                    ) : null}
                  </div>
                </div>
                <ChipRow label="Vibration">
                  {(["felt", "reduced", "absent"] as const).map((vb) => (
                    <ValueChip
                      key={vb}
                      active={s.vibration === vb}
                      onClick={() =>
                        setFootSide(side, { vibration: s.vibration === vb ? undefined : vb })
                      }
                    >
                      {vb}
                    </ValueChip>
                  ))}
                </ChipRow>
                <ChipRow label="Foot pulses">
                  <ValueChip
                    active={s.pulsesPresent === true}
                    onClick={() =>
                      setFootSide(side, {
                        pulsesPresent: s.pulsesPresent === true ? undefined : true,
                      })
                    }
                  >
                    present
                  </ValueChip>
                  <ValueChip
                    active={s.pulsesPresent === false}
                    tone="alarm"
                    onClick={() =>
                      setFootSide(side, {
                        pulsesPresent: s.pulsesPresent === false ? undefined : false,
                      })
                    }
                  >
                    absent
                  </ValueChip>
                  <ValueChip
                    active={!!s.warmCharcot}
                    tone="alarm"
                    onClick={() => setFootSide(side, { warmCharcot: !s.warmCharcot })}
                  >
                    warm swollen (?Charcot)
                  </ValueChip>
                </ChipRow>
                <MultiRow
                  title="Infection"
                  options={FOOT_INFECTION_OPTS}
                  values={s.infection}
                  onToggle={(x) => toggleFootList(side, "infection", x)}
                  // Red reserved for limb-threatening signs; milder signs stay neutral.
                  alarm={(x) => x.includes("purulent") || x.includes("probe-to-bone")}
                />
              </div>
            );
          })}

          {/* History inputs that raise the IWGDF category */}
          <ChipRow label="History">
            <ValueChip
              active={!!foot.priorUlcerOrAmputation}
              onClick={() =>
                onChange({
                  ...value,
                  foot: { ...foot, priorUlcerOrAmputation: !foot.priorUlcerOrAmputation },
                })
              }
            >
              prior ulcer / amputation
            </ValueChip>
            <ValueChip
              active={!!foot.endStageRenal}
              onClick={() =>
                onChange({ ...value, foot: { ...foot, endStageRenal: !foot.endStageRenal } })
              }
            >
              end-stage renal disease
            </ValueChip>
            <ValueChip
              active={!!foot.systemicSepsis}
              tone="alarm"
              onClick={() =>
                onChange({ ...value, foot: { ...foot, systemicSepsis: !foot.systemicSepsis } })
              }
            >
              systemic sepsis
            </ValueChip>
          </ChipRow>

          {/* Risk category — suggested → clinician-confirmed (never auto-assigned) */}
          {suggestion ? (
            <div
              className={cn(
                "rounded-lg border p-2.5",
                suggestion.risk.urgent
                  ? "border-red-300 bg-red-50/70 dark:border-red-900/50 dark:bg-red-950/20"
                  : "border-border/70 bg-muted/20",
              )}
            >
              <span className="text-muted-foreground inline-flex items-center gap-1.5 text-[10px] font-medium tracking-wide uppercase">
                {suggestion.risk.urgent ? (
                  <ShieldAlertIcon className="size-3 text-red-600 dark:text-red-400" aria-hidden />
                ) : (
                  <AlertTriangleIcon className="size-3 text-amber-500" aria-hidden />
                )}
                Diabetic-foot risk — suggested, confirm
              </span>
              <p className="mt-1 text-[12px]">
                <span
                  className={cn(
                    "font-semibold",
                    suggestion.risk.urgent ? "text-red-700 dark:text-red-300" : "text-foreground",
                  )}
                >
                  {suggestion.risk.label}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  — {suggestion.risk.interval}. {suggestion.reasons.join(", ")}.
                </span>
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                <span className="text-muted-foreground text-[10px]">Confirm category:</span>
                {(Object.keys(FOOT_RISK) as (keyof typeof FOOT_RISK)[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={foot.confirmedRisk === k}
                    className={seg(
                      foot.confirmedRisk === k,
                      k === suggestion.risk.key ? "teal" : "muted",
                    )}
                    onClick={() =>
                      onChange({
                        ...value,
                        foot: {
                          ...foot,
                          confirmedRisk: foot.confirmedRisk === k ? undefined : k,
                        },
                      })
                    }
                  >
                    {FOOT_RISK[k].label.replace(/ —.*/, "")}
                  </button>
                ))}
              </div>
              {foot.confirmedRisk ? (
                <p className="text-muted-foreground mt-1 text-[10px]">
                  Confirmed: {FOOT_RISK[foot.confirmedRisk].label} —{" "}
                  {FOOT_RISK[foot.confirmedRisk].interval}. Feeds the monitoring re-exam interval
                  (engine not attached yet). · {FOOT_RISK_SOURCE}
                </p>
              ) : (
                <p className="text-muted-foreground mt-1 text-[10px]">
                  {FOOT_RISK_SOURCE} — clinician confirms; never auto-assigned.
                </p>
              )}
            </div>
          ) : null}
        </SectionCard>
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

      {renderEvfProse(value) ? (
        <div className="fade-in-slow rounded-xl border border-teal-200/70 bg-teal-50/60 px-3 py-2 dark:border-teal-900/50 dark:bg-teal-950/20">
          <span className="inline-flex items-center gap-1 text-[10px] font-medium tracking-wide text-teal-700 uppercase dark:text-teal-400">
            <CircleDashedIcon className="size-3" aria-hidden /> Auto-generated summary
          </span>
          <p className="mt-0.5 text-[12px] leading-relaxed text-teal-900/90 italic dark:text-teal-100/80">
            {renderEvfProse(value)}
          </p>
        </div>
      ) : null}

      <p className="text-muted-foreground text-[10px]">
        Hands/tremor, eyes, skin &amp; oedema are also captured in the general examination; foot
        neuropathy mirrors the neuro sensory exam.
      </p>
    </div>
  );
}

function PulseRow({
  name,
  value,
  onCycle,
}: {
  name: NamedPulse;
  value: Partial<Record<Side, PulseGrade>> | undefined;
  onCycle: (side: Side) => void;
}) {
  const cell = (side: Side) => {
    const g = value?.[side];
    return (
      <button
        type="button"
        onClick={() => onCycle(side)}
        className={cn(
          "tap rounded-md border px-1 py-1 text-center text-[10.5px] transition-colors duration-150",
          g === "absent"
            ? "border-amber-500 bg-amber-100 text-amber-900 dark:border-amber-500 dark:bg-amber-900/45 dark:text-amber-100"
            : g === "reduced"
              ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
              : g === "present"
                ? "border-teal-400 text-teal-700 dark:border-teal-700 dark:text-teal-300"
                : "border-border text-muted-foreground border-dashed",
        )}
        aria-label={`${name} ${side} ${g ?? "not examined"}`}
      >
        {g ? g.slice(0, 4) : "–"}
      </button>
    );
  };
  return (
    <>
      <span className="text-foreground text-[11px]">{name}</span>
      {cell("right")}
      {cell("left")}
    </>
  );
}
