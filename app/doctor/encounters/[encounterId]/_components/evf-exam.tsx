"use client";

import type { ThreeStateValue } from "./exam-kit";
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
import { useMemo, useState } from "react";
import { AlertTriangleIcon, CircleDashedIcon, ShieldAlertIcon } from "lucide-react";

import {
  ABPI_BAND_LABEL,
  ARTERIAL_BRUIT_OPTS,
  ARTERIAL_LOOK_OPTS,
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
import { ChipRow, CycleLegend, StageCard, ThreeState, ValueChip } from "./exam-kit";

/**
 * Endocrine · Peripheral Vascular · Diabetic-Foot — REWORKED PRESENTATION
 * (ADR 0074). Same EvfExam data, handlers, value-sets and behaviour; restructured
 * into the clinical examination sequence as numbered StageCards on the shared
 * exam-kit (StageCard / ThreeState / ValueChip / ChipRow). The diabetic foot is the
 * centrepiece: it SUGGESTS an IWGDF risk category from the findings (verified
 * constants) which the clinician CONFIRMS (never auto-assigned) and which feeds the
 * monitoring re-exam loop. Clusters are decision-support (emergencies in red),
 * never auto-diagnoses. not-examined ≠ normal. Reuses the neuro sensory concept
 * (monofilament) + CVS pulses.
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

type Tab = "thyroid" | "vascular" | "foot";

const STAGES: { key: Tab; index: number; title: string; hint: string }[] = [
  {
    key: "thyroid",
    index: 1,
    title: "Thyroid status",
    hint: "hands → pulse → gland → eyes → legs",
  },
  {
    key: "vascular",
    index: 2,
    title: "Peripheral vascular",
    hint: "look → pulses → ABPI → special tests",
  },
  {
    key: "foot",
    index: 3,
    title: "Diabetic foot",
    hint: "skin → neuropathy → vascular → infection",
  },
];

export function EvfExamForm({
  value,
  onChange,
}: {
  value: EvfExam;
  onChange: (next: EvfExam) => void;
}) {
  const [tab, setTab] = useState<Tab>("thyroid");
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

  // ── render a thyroid catalog finding with the kit (three-state + value chips) ──
  const renderThyFinding = (x: (typeof EVF_FINDINGS)[number]) => {
    const o = byCode.get(x.code);
    const state: ThreeStateValue = o?.state ?? "not_examined";
    return (
      <div key={x.code} className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span className="text-foreground min-w-0 flex-1 text-[12.5px]">{x.display}</span>
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
                        ? (o?.values ?? []).filter((y) => y !== opt)
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

  const active = STAGES.find((s) => s.key === tab)!;

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

      {/* System switcher — focus one of the three linked sub-exams */}
      <div className="border-border/70 bg-muted/30 flex flex-wrap gap-1 rounded-lg border p-1">
        {STAGES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setTab(s.key)}
            className={cn(
              "rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
              tab === s.key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s.index}. {s.title}
          </button>
        ))}
      </div>

      <div key={tab} className="reveal-up flex flex-col gap-3.5">
        {/* ── Stage 1 — Thyroid status ── */}
        {tab === "thyroid" ? (
          <StageCard index={active.index} title={active.title} hint={active.hint}>
            <ChipRow label="Status lean">
              {(["euthyroid", "hyperthyroid", "hypothyroid"] as const).map((s) => (
                <ValueChip
                  key={s}
                  active={value.thyroid?.status === s}
                  onClick={() =>
                    setThyroid({ status: value.thyroid?.status === s ? undefined : s })
                  }
                >
                  {s}
                </ValueChip>
              ))}
            </ChipRow>
            {EVF_FINDINGS.filter(
              (x) => x.group === "thyroid_peripheral" || x.group === "thyroid_legs",
            ).map(renderThyFinding)}
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
          </StageCard>
        ) : null}

        {/* ── Stage 2 — Peripheral vascular ── */}
        {tab === "vascular" ? (
          <StageCard index={active.index} title={active.title} hint={active.hint}>
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
            {/* ABPI — keep interpretation */}
            <div className="border-border/60 mt-1 flex flex-col gap-1.5 rounded-lg border-t pt-2.5">
              <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                ABPI
              </span>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {(["right", "left"] as Side[]).map((side) => {
                  const band = interpretAbpi(v.abpi?.[side]);
                  return (
                    <label key={side} className="inline-flex items-center gap-1.5">
                      <span className="text-muted-foreground text-[11px]">
                        ABPI {side === "right" ? "R" : "L"}
                      </span>
                      <input
                        type="number"
                        step="0.05"
                        className="border-input bg-card w-16 rounded border px-1.5 py-1 text-[12px] tabular-nums outline-none focus-visible:border-teal-500"
                        value={v.abpi?.[side] ?? ""}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          setVasc({
                            abpi: {
                              ...v.abpi,
                              [side]: e.target.value === "" || !Number.isFinite(n) ? undefined : n,
                            },
                          });
                        }}
                      />
                      {band ? (
                        <span
                          className={cn(
                            "text-[10px]",
                            band === "critical"
                              ? "text-red-600 dark:text-red-400"
                              : band === "pad"
                                ? "text-amber-700 dark:text-amber-400"
                                : "text-muted-foreground",
                          )}
                        >
                          {ABPI_BAND_LABEL[band]}
                        </span>
                      ) : null}
                    </label>
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
          </StageCard>
        ) : null}

        {/* ── Stage 3 — Diabetic foot ── */}
        {tab === "foot" ? (
          <StageCard index={active.index} title={active.title} hint={active.hint}>
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
                    <ShieldAlertIcon
                      className="size-3 text-red-600 dark:text-red-400"
                      aria-hidden
                    />
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
          </StageCard>
        ) : null}
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
