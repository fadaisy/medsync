"use client";

import type {
  GalsScreen,
  MskExam,
  MskRegion,
  MskRegional,
  MskRom,
  MskSide,
} from "@/lib/clerkship/exam/musculoskeletal";
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

/**
 * Musculoskeletal examination — TWO-LEVEL: the GALS screen (3 questions +
 * Gait/Arms/Legs/Spine — the rapid fast path) and regional Look→Feel→Move cards
 * by joint & side with structured ROM + tap-to-cycle special tests. Carries the
 * prominent BACK-PAIN RED-FLAG screen (cauda options shared with the neuro exam)
 * and the arthropathy pattern panel — DECISION-SUPPORT (multiple on ambiguity,
 * emergencies in red), never an auto-diagnosis. not-examined ≠ normal.
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
      <span className="text-muted-foreground w-26 shrink-0 text-[11px]">{title}</span>
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
          className={seg(value === v, v === goodIsYes ? "teal" : "muted")}
          onClick={() => onPick(value === v ? undefined : v)}
        >
          {v ? "Yes" : "No"}
        </button>
      ))}
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
  const [openFindings, setOpenFindings] = useState(false);
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
          className={seg(gals[key] === v, v === "normal" ? "teal" : "muted")}
          onClick={() => setGals({ [key]: gals[key] === v ? undefined : v })}
        >
          {v}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-foreground text-[13px] font-semibold">
          Musculoskeletal examination
        </span>
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
          onClick={() => onChange(normalMskExam())}
          className={`tap text-muted-foreground hover:bg-muted hover:text-foreground ml-auto rounded-md px-2.5 py-1 text-[11.5px] font-medium ${EASE}`}
        >
          Normal GALS screen
        </button>
      </div>

      {/* GALS screen — the rapid fast path */}
      <div className="border-border/70 flex flex-col gap-1.5 rounded-lg border p-2.5">
        <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
          GALS screen
        </span>
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground w-12 text-[11px]">Gait</span>
            {(["normal", "antalgic", "abnormal"] as const).map((v) => (
              <button
                key={v}
                type="button"
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
      </div>

      {/* Pattern characteriser — distribution + character (drives the arthropathy engine) */}
      <div className="flex flex-col gap-1.5">
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
          onPick={(v) => onChange({ ...value, morningStiffness: v as MskExam["morningStiffness"] })}
        />
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-muted-foreground w-26 shrink-0 text-[11px]">Character</span>
          <button
            type="button"
            className={alarmChip(!!value.hotSwollenJoint)}
            onClick={() => onChange({ ...value, hotSwollenJoint: !value.hotSwollenJoint })}
          >
            single HOT swollen joint
          </button>
          <button
            type="button"
            className={chip(!!value.cannotWeightBear)}
            onClick={() => onChange({ ...value, cannotWeightBear: !value.cannotWeightBear })}
          >
            cannot weight-bear
          </button>
          <button
            type="button"
            className={chip(!!value.worseWithUse)}
            onClick={() => onChange({ ...value, worseWithUse: !value.worseWithUse })}
          >
            worse with use
          </button>
          <button
            type="button"
            className={chip(!!value.migratory)}
            onClick={() => onChange({ ...value, migratory: !value.migratory })}
          >
            migratory
          </button>
          <button
            type="button"
            className={chip(!!value.precedingSoreThroat)}
            onClick={() => onChange({ ...value, precedingSoreThroat: !value.precedingSoreThroat })}
          >
            preceding sore throat
          </button>
        </div>
      </div>

      {/* Regional Look–Feel–Move cards */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-foreground text-[12px] font-semibold">
            Regional examination — Look · Feel · Move
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
            const lookOpts = [...LOOK_OPTS, ...(r.region ? REGION_LOOK_EXTRAS[r.region] : [])];
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
                  <span className="text-muted-foreground w-26 shrink-0 pt-0.5 text-[11px]">
                    Look
                  </span>
                  <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                    {lookOpts.map((o) => (
                      <button
                        key={o}
                        type="button"
                        className={chip((r.look ?? []).includes(o))}
                        onClick={() => toggleIn(r, "look", o)}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
                  <span className="text-muted-foreground w-26 shrink-0 pt-0.5 text-[11px]">
                    Feel
                  </span>
                  <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                    {FEEL_OPTS.map((o) => (
                      <button
                        key={o}
                        type="button"
                        className={
                          o.includes("compartment")
                            ? alarmChip((r.feel ?? []).includes(o))
                            : chip((r.feel ?? []).includes(o))
                        }
                        onClick={() => toggleIn(r, "feel", o)}
                      >
                        {o}
                      </button>
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
                    <span className="text-muted-foreground w-26 shrink-0 pt-0.5 text-[11px]">
                      Special tests
                    </span>
                    <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                      {tests.map((t) => {
                        const res = r.specialTests?.[t];
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => cycleTest(r, t)}
                            className={`tap rounded-md px-2 py-0.5 text-[11.5px] ring-1 ring-inset ${EASE} ${
                              res === "positive"
                                ? "bg-amber-50 text-amber-800 ring-amber-500/40 dark:bg-amber-950/30 dark:text-amber-300"
                                : res === "negative"
                                  ? "bg-teal-50 text-teal-700 ring-teal-500/40 dark:bg-teal-950/40 dark:text-teal-200"
                                  : "text-foreground/70 ring-border hover:bg-muted/60"
                            }`}
                            aria-label={`${t}: ${res ?? "not tested"}`}
                          >
                            {t}
                            {res ? ` · ${res === "positive" ? "+" : "−"}` : ""}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                {tests.length ? (
                  <span className="text-muted-foreground pl-28 text-[10px]">
                    Tap a test to cycle: positive → negative → untested.
                  </span>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {/* Back-pain red flags — prominent; cauda options shared with the neuro exam */}
      <div className="border-border/70 flex flex-col gap-1.5 rounded-lg border p-2.5">
        <span className="text-muted-foreground inline-flex items-center gap-1.5 text-[10px] font-medium tracking-wide uppercase">
          <AlertTriangleIcon className="size-3 text-amber-500" aria-hidden />
          Back-pain red flags — mechanical back pain is a diagnosis of exclusion
        </span>
        <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
          <span className="text-muted-foreground w-26 shrink-0 pt-0.5 text-[11px]">
            Cauda equina
          </span>
          <div className="flex min-w-0 flex-1 flex-wrap gap-1">
            {BACK_FLAG_CAUDA.map((o) => (
              <button
                key={o}
                type="button"
                className={alarmChip((value.backRedFlags ?? []).includes(o))}
                onClick={() => toggleFlag(o)}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
          <span className="text-muted-foreground w-26 shrink-0 pt-0.5 text-[11px]">Cord</span>
          <div className="flex min-w-0 flex-1 flex-wrap gap-1">
            {BACK_FLAG_CORD.map((o) => (
              <button
                key={o}
                type="button"
                className={alarmChip((value.backRedFlags ?? []).includes(o))}
                onClick={() => toggleFlag(o)}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
        {(
          [
            ["Malignancy", BACK_FLAG_MALIGNANCY],
            ["Infection", BACK_FLAG_INFECTION],
            ["Fracture", BACK_FLAG_FRACTURE],
          ] as const
        ).map(([label, opts]) => (
          <div key={label} className="flex flex-wrap items-start gap-x-2 gap-y-1">
            <span className="text-muted-foreground w-26 shrink-0 pt-0.5 text-[11px]">{label}</span>
            <div className="flex min-w-0 flex-1 flex-wrap gap-1">
              {opts.map((o) => (
                <button
                  key={o}
                  type="button"
                  className={chip((value.backRedFlags ?? []).includes(o))}
                  onClick={() => toggleFlag(o)}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

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

      {/* GALS detail + function — collapsed */}
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
            GALS detail · function &amp; measure
          </span>
          {findings.filter((o) => o.state === "present").length ? (
            <span className="rounded-full bg-teal-100 px-1.5 text-[10px] font-semibold text-teal-800 dark:bg-teal-950/40 dark:text-teal-300">
              {findings.filter((o) => o.state === "present").length}
            </span>
          ) : null}
        </button>
        {openFindings ? (
          <div className="flex flex-col">
            {MSK_GROUPS.map((g) => {
              const inGroup = MSK_FINDINGS.filter((x) => x.group === g.key);
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
                            <span className="text-foreground min-w-0 flex-1 text-[12.5px]">
                              {x.display}
                            </span>
                            <div className="flex shrink-0 gap-1">
                              <button
                                type="button"
                                aria-pressed={o?.state === "absent"}
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
                                aria-pressed={o?.state === "present"}
                                className={seg(o?.state === "present", "teal")}
                                onClick={() =>
                                  setFinding(
                                    x.code,
                                    o?.state === "present" ? null : { state: "present" },
                                  )
                                }
                              >
                                <CheckIcon className="size-3" aria-hidden /> Findings
                              </button>
                            </div>
                          </div>
                          {o?.state === "present" && x.options.length ? (
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
              Hands/nails, rash, lymph nodes &amp; the gait first-impression are also captured in
              the general examination.
            </p>
          </div>
        ) : null}
      </div>

      {renderMskProse(value) ? (
        <div className="rounded-lg border border-teal-200/70 bg-teal-50/60 px-3 py-2 dark:border-teal-900/50 dark:bg-teal-950/20">
          <span className="inline-flex items-center gap-1 text-[10px] font-medium tracking-wide text-teal-700 uppercase dark:text-teal-400">
            <CircleDashedIcon className="size-3" aria-hidden /> Auto-generated summary
          </span>
          <p className="mt-0.5 text-[12px] leading-relaxed text-teal-900/90 italic dark:text-teal-100/80">
            {renderMskProse(value)}
          </p>
        </div>
      ) : null}
    </div>
  );
}
