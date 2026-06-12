"use client";

import type {
  AbdoExam,
  AbdoGuarding,
  AbdoLiver,
  AbdoMass,
  AbdoRegion,
  AbdoSpleen,
  AbdoTenderness,
} from "@/lib/clerkship/exam/abdominal";
import type { ExamObservation, FindingState } from "@/lib/clerkship/exam/types";
import { useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleDashedIcon,
  MinusCircleIcon,
  PlusIcon,
  ShieldAlertIcon,
  XIcon,
} from "lucide-react";

import {
  ABDO_FINDINGS,
  ABDO_GROUPS,
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

/**
 * Abdominal examination — tap-first full IPPA by REGION (9-region grid), with
 * structured organ + mass characterisation and the PR honesty control (examined
 * / not-examined / declined — never silently dropped). The constellation →
 * pattern panel is DECISION-SUPPORT (multiple on ambiguity, emergencies in red)
 * — never an auto-diagnosis. Peripheral overlap (jaundice/pallor/clubbing/nodes/
 * oedema) reused from the general exam.
 */

const EASE = "transition-colors duration-150 ease-expo-out";
const chip = (active: boolean) =>
  `tap rounded-md px-2 py-0.5 text-[11.5px] ring-1 ring-inset ${EASE} ${active ? "bg-teal-50 text-teal-700 ring-teal-500/40 dark:bg-teal-950/40 dark:text-teal-200" : "text-foreground/70 ring-border hover:bg-muted/60"}`;
const seg = (active: boolean, tone: "muted" | "teal" = "muted") =>
  `tap inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${EASE} ${
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
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-muted-foreground w-24 shrink-0 text-[11px]">{title}</span>
      <div className="flex flex-wrap gap-1">
        {opts.map((o) => (
          <button
            key={o.value}
            type="button"
            className={chip(value === o.value)}
            onClick={() => onPick(value === o.value ? undefined : o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
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
    <button
      type="button"
      aria-pressed={!!on}
      onClick={onToggle}
      className={
        on && alarm
          ? "tap rounded-md bg-red-100 px-2 py-0.5 text-[11.5px] font-medium text-red-700 ring-1 ring-red-500/40 ring-inset dark:bg-red-950/40 dark:text-red-300"
          : chip(!!on)
      }
    >
      {label}
    </button>
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
  const [openFindings, setOpenFindings] = useState(false);

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

  // tap-to-cycle a region through the modality's states → unset
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

  const regionCell = (region: AbdoRegion) => {
    const t = value.tenderness?.[region];
    const g = value.guarding?.[region];
    const active = modality === "tenderness" ? t : g;
    const label =
      modality === "tenderness"
        ? t === "deep"
          ? "deep"
          : t === "tender"
            ? "tender"
            : ""
        : g === "involuntary"
          ? "involunt."
          : g === "voluntary"
            ? "volunt."
            : "";
    const other = modality === "tenderness" ? g : t;
    return (
      <button
        key={region}
        type="button"
        onClick={() => cycleRegion(region)}
        className={`tap flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-md border px-1 py-1 text-[10.5px] ${EASE} ${
          active
            ? "border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
            : "border-border text-muted-foreground hover:bg-muted/50 border-dashed"
        }`}
        aria-label={`${ABDO_REGIONS.find((r) => r.region === region)?.label} — ${modality}: ${label || "none"}`}
      >
        <span className="font-medium">{ABDO_REGIONS.find((r) => r.region === region)?.short}</span>
        <span className="leading-none">{label || "—"}</span>
        {other ? <span aria-hidden className="size-1 rounded-full bg-amber-400" /> : null}
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-foreground text-[13px] font-semibold">Abdominal examination</span>
        {patterns.length ? (
          <span
            key={patterns.length}
            className="scale-in rounded-full bg-teal-100 px-1.5 text-[10px] font-semibold text-teal-800 tabular-nums dark:bg-teal-950/40 dark:text-teal-300"
          >
            {patterns.length} pattern{patterns.length > 1 ? "s" : ""}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => onChange(normalAbdoExam())}
          className={`tap text-muted-foreground hover:bg-muted hover:text-foreground ml-auto rounded-md px-2.5 py-1 text-[11.5px] font-medium ${EASE}`}
          title="Soft, non-tender, no organomegaly — PR stays honestly not-examined"
        >
          Normal abdominal exam
        </button>
      </div>

      {/* Region grid — tenderness / guarding by 9 regions */}
      <div className="flex flex-col gap-1.5">
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
            tap a region to cycle
            {modality === "tenderness"
              ? ": tender → deep → off"
              : ": voluntary → involuntary → off"}
          </span>
        </div>
        <div className="grid max-w-sm grid-cols-3 gap-1.5">
          {ABDO_REGIONS.map((r) => regionCell(r.region))}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
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
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-muted-foreground w-24 shrink-0 text-[11px]">Peritonism</span>
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
        </div>
      </div>

      {/* Organs — structured */}
      <div className="border-border/70 flex flex-col gap-1.5 rounded-lg border p-2.5">
        <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
          Organs
        </span>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-muted-foreground w-24 shrink-0 text-[11px]">Liver</span>
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
        </div>
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
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-26">
              <Toggle
                label="craggy surface"
                on={liver.surface === "craggy"}
                onToggle={() =>
                  onChange({
                    ...value,
                    liver: { ...liver, surface: liver.surface === "craggy" ? undefined : "craggy" },
                  })
                }
              />
              <Toggle
                label="tender"
                on={liver.tender}
                onToggle={() => onChange({ ...value, liver: { ...liver, tender: !liver.tender } })}
              />
              <Toggle
                label="pulsatile"
                on={liver.pulsatile}
                onToggle={() =>
                  onChange({ ...value, liver: { ...liver, pulsatile: !liver.pulsatile } })
                }
              />
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-muted-foreground w-24 shrink-0 text-[11px]">Spleen</span>
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
        </div>
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
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-26">
              <Toggle
                label="notch felt"
                on={spleen.notch}
                onToggle={() => onChange({ ...value, spleen: { ...spleen, notch: !spleen.notch } })}
              />
              <Toggle
                label="can't get above it"
                on={spleen.cantGetAbove}
                onToggle={() =>
                  onChange({ ...value, spleen: { ...spleen, cantGetAbove: !spleen.cantGetAbove } })
                }
              />
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-muted-foreground w-24 shrink-0 text-[11px]">Kidneys</span>
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
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-muted-foreground w-24 shrink-0 text-[11px]">Aorta / bladder</span>
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
        </div>
      </div>

      {/* Masses — structured cards */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-foreground text-[12px] font-semibold">Masses</span>
          <button
            type="button"
            onClick={() => onChange({ ...value, masses: [...masses, { id: crypto.randomUUID() }] })}
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
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-26">
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
              </div>
            </div>
          ))
        )}
      </div>

      {/* Percussion + auscultation */}
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-muted-foreground w-24 shrink-0 text-[11px]">Percussion</span>
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
        </div>
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
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-muted-foreground w-24 shrink-0 text-[11px]">Bruits / splash</span>
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
        </div>
      </div>

      {/* PR — completion; omission honest */}
      <div className="border-border/70 flex flex-col gap-1.5 rounded-lg border p-2.5">
        <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
          PR examination — completion (omission is recorded, never silently dropped)
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
                <button
                  key={opt}
                  type="button"
                  className={chip(on)}
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
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Constellation → pattern (decision-support) */}
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

      {/* Non-regional findings — collapsed */}
      <div className="border-border/70 overflow-hidden rounded-lg border">
        <button
          type="button"
          onClick={() => setOpenFindings((o) => !o)}
          className="bg-muted/30 hover:bg-muted/50 flex w-full items-center gap-2 px-3 py-2 text-left"
        >
          <ChevronDownIcon
            className={`text-muted-foreground size-3.5 transition-transform ${openFindings ? "" : "-rotate-90"}`}
            aria-hidden
          />
          <span className="text-foreground flex-1 text-[12.5px] font-semibold">
            Stigmata · inspection · named signs · completion
          </span>
          {findings.filter((o) => o.state === "present").length ? (
            <span className="rounded-full bg-teal-100 px-1.5 text-[10px] font-semibold text-teal-800 dark:bg-teal-950/40 dark:text-teal-300">
              {findings.filter((o) => o.state === "present").length}
            </span>
          ) : null}
        </button>
        {openFindings ? (
          <div className="flex flex-col">
            {ABDO_GROUPS.map((g) => {
              const inGroup = ABDO_FINDINGS.filter((x) => x.group === g.key);
              return (
                <div key={g.key} className="border-border/40 border-t first:border-t-0">
                  <div className="text-muted-foreground bg-muted/20 px-3 py-1 text-[10px] font-medium tracking-wide uppercase">
                    {g.label}
                  </div>
                  <div className="divide-border/50 divide-y">
                    {inGroup.map((x) => {
                      const o = byCode.get(x.code);
                      return (
                        <div key={x.code} className="flex flex-col gap-1 px-3 py-1.5">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="flex min-w-0 flex-1 items-center gap-1.5">
                              <span className="text-foreground text-[12.5px]">{x.display}</span>
                              {x.mustNotMiss ? (
                                <AlertTriangleIcon
                                  className="size-3 text-amber-500"
                                  aria-label="must-not-miss"
                                />
                              ) : null}
                            </span>
                            {x.kind === "select" ? (
                              <div className="flex flex-wrap justify-end gap-1">
                                {x.options.map((opt) => (
                                  <button
                                    key={opt}
                                    type="button"
                                    className={chip(o?.values?.[0] === opt)}
                                    onClick={() =>
                                      setFinding(
                                        x.code,
                                        o?.values?.[0] === opt
                                          ? null
                                          : { state: "present", values: [opt] },
                                      )
                                    }
                                  >
                                    {opt}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div className="flex shrink-0 gap-1">
                                <button
                                  type="button"
                                  aria-pressed={o?.state === "absent"}
                                  className={seg(o?.state === "absent")}
                                  onClick={() =>
                                    setFinding(
                                      x.code,
                                      o?.state === "absent"
                                        ? null
                                        : { state: "absent", values: [] },
                                    )
                                  }
                                >
                                  <MinusCircleIcon className="size-3" aria-hidden /> Normal
                                </button>
                                <button
                                  type="button"
                                  aria-pressed={o?.state === "present"}
                                  className={seg(o?.state === "present", "teal")}
                                  onClick={() =>
                                    setFinding(
                                      x.code,
                                      o?.state === "present" ? null : { state: "present" },
                                    )
                                  }
                                >
                                  <CheckIcon className="size-3" aria-hidden />{" "}
                                  {x.options.length ? "Findings" : "Present"}
                                </button>
                              </div>
                            )}
                          </div>
                          {x.kind === "panel" && o?.state === "present" && x.options.length ? (
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
                                          ? (o.values ?? []).filter((v) => v !== opt)
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
                  </div>
                </div>
              );
            })}
            <p className="text-muted-foreground border-border/40 border-t px-3 py-1.5 text-[10px]">
              Jaundice, pallor, clubbing, lymph nodes &amp; oedema are captured in the general
              examination.
            </p>
          </div>
        ) : null}
      </div>

      {renderAbdoProse(value) ? (
        <div className="rounded-lg border border-teal-200/70 bg-teal-50/60 px-3 py-2 dark:border-teal-900/50 dark:bg-teal-950/20">
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
