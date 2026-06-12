"use client";

import type { ThreeStateValue } from "./exam-kit";
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
import { ChipRow, NormalExamButton, StageCard, ThreeState, ValueChip } from "./exam-kit";

/**
 * Abdominal examination — REWORKED PRESENTATION (ADR 0074). Same AbdoExam data,
 * handlers, value-sets and behaviour as before; restructured into the clinical
 * I-P-P-A sequence as numbered StageCards, with the 9-region anatomical map as
 * the signature palpation control and the shared exam-kit controls. PR-completion
 * honesty, the constellation panel, and not-examined ≠ normal are all preserved.
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

  const group = (key: string) => ABDO_FINDINGS.filter((x) => x.group === key);
  const presentInGroups = (keys: string[]) =>
    findings.filter((o) => o.state === "present" && keys.includes(o.group)).length;
  const touched = (x: ExamFinding) =>
    byCode.get(x.code)?.state && byCode.get(x.code)?.state !== "not_examined";

  const inspectionDone = [...group("abdo_peripheral"), ...group("abdo_inspection")].every(touched);
  const palpationDone =
    liver.palpable !== undefined && spleen.palpable !== undefined && value.rigidity !== undefined;
  const percussionDone = value.bowelSounds !== undefined;
  const completionDone =
    !!value.pr?.state && [...group("abdo_signs"), ...group("abdo_completion")].every(touched);

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

      <div className="flex flex-col gap-3.5">
        {/* ── Stage 1 — Inspection & stigmata ── */}
        <StageCard
          index={1}
          title="Inspection & stigmata"
          complete={inspectionDone}
          count={presentInGroups(["abdo_peripheral", "abdo_inspection"])}
          hint="end of bed → hands → abdomen"
        >
          {[...group("abdo_peripheral"), ...group("abdo_inspection")].map(renderFinding)}
        </StageCard>

        {/* ── Stage 2 — Palpation ── */}
        <StageCard
          index={2}
          title="Palpation"
          complete={palpationDone}
          hint="light → deep → organs → masses"
        >
          <div className="flex flex-wrap items-center gap-1">
            {(["tenderness", "guarding"] as const).map((m) => (
              <button
                key={m}
                type="button"
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
        </StageCard>

        {/* ── Stage 3 — Percussion & auscultation ── */}
        <StageCard index={3} title="Percussion & auscultation" complete={percussionDone}>
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
        </StageCard>

        {/* ── Stage 4 — Completion (named signs + PR) ── */}
        <StageCard index={4} title="Completion" complete={completionDone} hint="named signs · PR">
          {[...group("abdo_signs"), ...group("abdo_completion")].map(renderFinding)}
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
        </StageCard>
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
