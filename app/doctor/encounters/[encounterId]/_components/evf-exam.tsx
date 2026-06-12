"use client";

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
import {
  AlertTriangleIcon,
  CheckIcon,
  CircleDashedIcon,
  MinusCircleIcon,
  ShieldAlertIcon,
} from "lucide-react";

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

/**
 * Endocrine · Peripheral Vascular · Diabetic-Foot — three linked sub-exams. The
 * diabetic foot is the centrepiece: it SUGGESTS an IWGDF risk category from the
 * findings (verified constants) which the clinician CONFIRMS (never auto-assigned)
 * and which feeds the monitoring re-exam loop. Clusters are decision-support
 * (emergencies in red), never auto-diagnoses. Reuses the neuro sensory concept
 * (monofilament) + CVS pulses.
 */

const EASE = "transition-colors duration-150 ease-expo-out";
const chip = (active: boolean) =>
  `tap rounded-md px-2 py-0.5 text-[11.5px] ring-1 ring-inset ${EASE} ${active ? "bg-teal-50 text-teal-700 ring-teal-500/40 dark:bg-teal-950/40 dark:text-teal-200" : "text-foreground/70 ring-border hover:bg-muted/60"}`;
const alarmChip = (active: boolean) =>
  active
    ? "tap rounded-md bg-red-100 px-2 py-0.5 text-[11.5px] font-medium text-red-700 ring-1 ring-red-500/40 ring-inset dark:bg-red-950/40 dark:text-red-300"
    : chip(false);
const seg = (active: boolean, tone: "muted" | "teal" = "muted") =>
  `tap inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${EASE} ${
    active
      ? tone === "teal"
        ? "bg-teal-50 text-teal-700 ring-teal-500/40 dark:bg-teal-950/40 dark:text-teal-200"
        : "bg-slate-100 text-slate-700 ring-slate-400/50 dark:bg-slate-800 dark:text-slate-200"
      : "text-muted-foreground ring-border hover:bg-muted/60"
  }`;

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
    <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
      <span className="text-muted-foreground w-24 shrink-0 pt-0.5 text-[11px]">{title}</span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-1">
        {options.map((o) => {
          const on = (values ?? []).includes(o);
          return (
            <button
              key={o}
              type="button"
              className={alarm?.(o) ? alarmChip(on) : chip(on)}
              onClick={() => onToggle(o)}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type Tab = "thyroid" | "vascular" | "foot";

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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-foreground text-[13px] font-semibold">
          Endocrine · vascular · foot
        </span>
        {patterns.length ? (
          <span
            key={patterns.length}
            className="scale-in rounded-full bg-teal-100 px-1.5 text-[10px] font-semibold text-teal-800 tabular-nums dark:bg-teal-950/40 dark:text-teal-300"
          >
            {patterns.length} pattern{patterns.length > 1 ? "s" : ""}
          </span>
        ) : null}
      </div>

      {/* Sub-tabs */}
      <div className="border-border/70 bg-muted/30 flex flex-wrap gap-1 rounded-lg border p-1">
        {(
          [
            ["thyroid", "Thyroid status"],
            ["vascular", "Peripheral vascular"],
            ["foot", "Diabetic foot"],
          ] as const
        ).map(([k, lbl]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${tab === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {lbl}
          </button>
        ))}
      </div>

      {/* ── Thyroid ── */}
      {tab === "thyroid" ? (
        <div className="scale-in flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-muted-foreground w-24 shrink-0 text-[11px]">Status lean</span>
            {(["euthyroid", "hyperthyroid", "hypothyroid"] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={chip(value.thyroid?.status === s)}
                onClick={() => setThyroid({ status: value.thyroid?.status === s ? undefined : s })}
              >
                {s}
              </button>
            ))}
          </div>
          {EVF_FINDINGS.filter(
            (x) => x.group === "thyroid_peripheral" || x.group === "thyroid_legs",
          ).map((x) => {
            const o = byCode.get(x.code);
            return (
              <div key={x.code} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-foreground min-w-0 flex-1 text-[12px]">{x.display}</span>
                  <button
                    type="button"
                    className={seg(o?.state === "absent")}
                    onClick={() =>
                      setFinding(
                        x.code,
                        o?.state === "absent" ? null : { state: "absent", values: [] },
                      )
                    }
                  >
                    <MinusCircleIcon className="size-3" aria-hidden /> Normal
                  </button>
                  <button
                    type="button"
                    className={seg(o?.state === "present", "teal")}
                    onClick={() =>
                      setFinding(x.code, o?.state === "present" ? null : { state: "present" })
                    }
                  >
                    <CheckIcon className="size-3" aria-hidden /> Findings
                  </button>
                </div>
                {o?.state === "present" ? (
                  <div className="flex flex-wrap gap-1 pl-1">
                    {x.options.map((opt) => {
                      const on = o.values?.includes(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          className={chip(!!on)}
                          onClick={() =>
                            setFinding(x.code, {
                              values: on
                                ? (o.values ?? []).filter((y) => y !== opt)
                                : [...(o.values ?? []), opt],
                            })
                          }
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
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
        </div>
      ) : null}

      {/* ── Vascular ── */}
      {tab === "vascular" ? (
        <div className="scale-in flex flex-col gap-2">
          <MultiRow
            title="Arterial look"
            options={ARTERIAL_LOOK_OPTS}
            values={v.arterialLook}
            onToggle={(x) => toggleVascList("arterialLook", x)}
            alarm={(o) => o === "gangrene"}
          />
          {/* Pulses grid */}
          <div className="border-border/70 rounded-lg border p-2">
            <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
              Pulses (tap to cycle present → reduced → absent)
            </span>
            <div className="mt-1 grid grid-cols-[auto_1fr_1fr] items-center gap-x-2 gap-y-1 text-[11px]">
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
                      className={`text-[10px] ${band === "critical" ? "text-red-600 dark:text-red-400" : band === "pad" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}
                    >
                      {ABPI_BAND_LABEL[band]}
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-muted-foreground w-24 shrink-0 text-[11px]">Buerger&apos;s</span>
            {(["positive", "negative"] as const).map((b) => (
              <button
                key={b}
                type="button"
                className={chip(v.buergers === b)}
                onClick={() => setVasc({ buergers: v.buergers === b ? undefined : b })}
              >
                {b}
              </button>
            ))}
          </div>
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={chip(!!v.restPain)}
              onClick={() => setVasc({ restPain: !v.restPain })}
            >
              rest pain
            </button>
            <button
              type="button"
              className={chip(!!v.dvtSigns)}
              onClick={() => setVasc({ dvtSigns: !v.dvtSigns })}
            >
              unilateral calf swelling (DVT)
            </button>
          </div>
          <MultiRow
            title="Venous"
            options={VENOUS_LOOK_OPTS}
            values={v.venousLook}
            onToggle={(x) => toggleVascList("venousLook", x)}
          />
        </div>
      ) : null}

      {/* ── Diabetic foot ── */}
      {tab === "foot" ? (
        <div className="scale-in flex flex-col gap-3">
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
                {/* Monofilament map */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-muted-foreground w-24 shrink-0 text-[11px]">
                    10 g monofilament
                  </span>
                  <div className="flex flex-wrap gap-1">
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
                          className={`tap rounded-md px-2 py-0.5 text-[11px] ring-1 ring-inset ${EASE} ${
                            felt === true
                              ? "bg-teal-50 text-teal-700 ring-teal-500/40 dark:bg-teal-950/40 dark:text-teal-200"
                              : felt === false
                                ? "bg-amber-50 text-amber-800 ring-amber-500/40 dark:bg-amber-950/30 dark:text-amber-300"
                                : "text-foreground/70 ring-border hover:bg-muted/60"
                          }`}
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
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-muted-foreground w-24 shrink-0 text-[11px]">Vibration</span>
                  {(["felt", "reduced", "absent"] as const).map((vb) => (
                    <button
                      key={vb}
                      type="button"
                      className={chip(s.vibration === vb)}
                      onClick={() =>
                        setFootSide(side, { vibration: s.vibration === vb ? undefined : vb })
                      }
                    >
                      {vb}
                    </button>
                  ))}
                  <span className="text-border mx-0.5">·</span>
                  <span className="text-muted-foreground text-[11px]">Foot pulses</span>
                  <button
                    type="button"
                    className={chip(s.pulsesPresent === true)}
                    onClick={() =>
                      setFootSide(side, {
                        pulsesPresent: s.pulsesPresent === true ? undefined : true,
                      })
                    }
                  >
                    present
                  </button>
                  <button
                    type="button"
                    className={alarmChip(s.pulsesPresent === false)}
                    onClick={() =>
                      setFootSide(side, {
                        pulsesPresent: s.pulsesPresent === false ? undefined : false,
                      })
                    }
                  >
                    absent
                  </button>
                  <button
                    type="button"
                    className={alarmChip(!!s.warmCharcot)}
                    onClick={() => setFootSide(side, { warmCharcot: !s.warmCharcot })}
                  >
                    warm swollen (?Charcot)
                  </button>
                </div>
                <MultiRow
                  title="Infection"
                  options={FOOT_INFECTION_OPTS}
                  values={s.infection}
                  onToggle={(x) => toggleFootList(side, "infection", x)}
                  alarm={() => true}
                />
              </div>
            );
          })}

          {/* History inputs that raise the IWGDF category */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground w-24 shrink-0 text-[11px]">History</span>
            <button
              type="button"
              className={chip(!!foot.priorUlcerOrAmputation)}
              onClick={() =>
                onChange({
                  ...value,
                  foot: { ...foot, priorUlcerOrAmputation: !foot.priorUlcerOrAmputation },
                })
              }
            >
              prior ulcer / amputation
            </button>
            <button
              type="button"
              className={chip(!!foot.endStageRenal)}
              onClick={() =>
                onChange({ ...value, foot: { ...foot, endStageRenal: !foot.endStageRenal } })
              }
            >
              end-stage renal disease
            </button>
            <button
              type="button"
              className={alarmChip(!!foot.systemicSepsis)}
              onClick={() =>
                onChange({ ...value, foot: { ...foot, systemicSepsis: !foot.systemicSepsis } })
              }
            >
              systemic sepsis
            </button>
          </div>

          {/* Risk category — suggested → clinician-confirmed */}
          {suggestion ? (
            <div
              className={`rounded-lg border p-2.5 ${suggestion.risk.urgent ? "border-red-300 bg-red-50/70 dark:border-red-900/50 dark:bg-red-950/20" : "border-border/70 bg-muted/20"}`}
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
                  className={`font-semibold ${suggestion.risk.urgent ? "text-red-700 dark:text-red-300" : "text-foreground"}`}
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
                        foot: { ...foot, confirmedRisk: foot.confirmedRisk === k ? undefined : k },
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
        </div>
      ) : null}

      {/* Pattern panel (decision-support) */}
      {patterns.length ? (
        <div className="border-border/70 bg-muted/20 flex flex-col gap-1 rounded-lg border p-2.5">
          <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
            Pattern(s) to consider — decision support
          </span>
          {patterns.map((p) => (
            <div key={p.key} className="flex items-start gap-1.5">
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
        <div className="rounded-lg border border-teal-200/70 bg-teal-50/60 px-3 py-2 dark:border-teal-900/50 dark:bg-teal-950/20">
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
        className={`tap rounded-md border px-1 py-1 text-center text-[10.5px] ${EASE} ${
          g === "absent"
            ? "border-red-400 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-300"
            : g === "reduced"
              ? "border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
              : g === "present"
                ? "border-teal-400 text-teal-700 dark:border-teal-700 dark:text-teal-300"
                : "border-border text-muted-foreground border-dashed"
        }`}
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
