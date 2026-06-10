"use client";

import type { CatalogProperty, RosScreenSymptom } from "@/lib/clerkship/catalog";
import type { RosObservation, RosScope } from "@/lib/clerkship/ros";
import type { CapturedPropertyValue, CapturedSymptom } from "@/lib/clerkship/symptom-engine";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleDashedIcon,
  FileTextIcon,
  MinusCircleIcon,
  PlusIcon,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { ROS_SYSTEM_LABEL, ROS_SYSTEM_ORDER, rosCoverage } from "@/lib/clerkship/ros";
import {
  loadRosCatalogAction,
  loadSymptomCatalogAction,
  loadSymptomPropertiesAction,
} from "../actions";

/**
 * Review of Systems — the system-grouped, tap-first screening sweep with the
 * PC-suppression + focused/complete logic:
 *  - the presenting complaint's system(s) are HPC-covered → not re-screened here
 *    (shown with a "covered in HPC" chip, still openable — never hidden);
 *  - the clinician chooses Complete (all systems) or Focused (pick a few);
 *  - coverage is truthful: reviewed-findings / reviewed-all-negative / HPC-covered
 *    / not-reviewed — and not-reviewed is NEVER auto-marked negative.
 * Three-state per symptom (not-asked / denies / present), distinct icon+label+tone.
 * Decision-support — assists, never clinically hides; nothing auto-marked.
 */

const EASE = "transition-colors duration-150 ease-expo-out";
const LABEL = "text-muted-foreground text-[10px] font-medium tracking-[0.1em] uppercase";

type Status = "present" | "denies";

export function RosReview({
  value,
  onChange,
  scope,
  onScopeChange,
  hpcItems,
}: {
  value: RosObservation[];
  onChange: (next: RosObservation[]) => void;
  scope: RosScope;
  onScopeChange: (next: RosScope) => void;
  hpcItems: CapturedSymptom[];
}) {
  const [catalog, setCatalog] = useState<RosScreenSymptom[] | null>(null);
  const [systemByCode, setSystemByCode] = useState<Map<string, string>>(new Map());
  const [propsBySymptom, setPropsBySymptom] = useState<Record<string, CatalogProperty[]>>({});
  const [openProps, setOpenProps] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  useEffect(() => {
    loadRosCatalogAction()
      .then(setCatalog)
      .catch(() => setCatalog([]));
    loadSymptomCatalogAction()
      .then((all) => setSystemByCode(new Map(all.map((s) => [s.code, s.system]))))
      .catch(() => {});
  }, []);

  const byCode = useMemo(() => new Map(value.map((o) => [o.symptomCode, o])), [value]);

  // PC-owned systems — derived from ALL presenting-complaint symptoms (multi-system,
  // bias to include). Those systems are explored in the HPC, not re-screened here.
  const pcSystems = useMemo(() => {
    const set = new Set<string>();
    for (const h of hpcItems) {
      const sys = systemByCode.get(h.symptomCode);
      if (sys) set.add(sys);
    }
    return set;
  }, [hpcItems, systemByCode]);

  const grouped = useMemo(() => {
    const m = new Map<string, RosScreenSymptom[]>();
    for (const s of catalog ?? []) {
      const list = m.get(s.system) ?? [];
      list.push(s);
      m.set(s.system, list);
    }
    return m;
  }, [catalog]);

  const systems = ROS_SYSTEM_ORDER.filter((s) => grouped.get(s)?.length);
  const inScope = (sys: string) => scope.mode === "complete" || scope.reviewedSystems.includes(sys);

  function setMode(mode: "complete" | "focused") {
    if (mode === scope.mode) return;
    if (mode === "focused") {
      // preserve any system already answered as "in focus"
      const answered = systems.filter(
        (s) => !pcSystems.has(s) && value.some((o) => o.system === s),
      );
      onScopeChange({ mode, reviewedSystems: answered });
    } else {
      onScopeChange({ mode, reviewedSystems: scope.reviewedSystems });
    }
  }
  function toggleFocus(sys: string) {
    const has = scope.reviewedSystems.includes(sys);
    onScopeChange({
      mode: "focused",
      reviewedSystems: has
        ? scope.reviewedSystems.filter((s) => s !== sys)
        : [...scope.reviewedSystems, sys],
    });
    if (has) setCollapsed((c) => new Set(c).add(sys));
  }

  function setStatus(sym: RosScreenSymptom, status: Status | null) {
    const others = value.filter((o) => o.symptomCode !== sym.code);
    if (status === null) {
      onChange(others);
      if (openProps === sym.code) setOpenProps(null);
      return;
    }
    const prev = byCode.get(sym.code);
    onChange([
      ...others,
      {
        symptomCode: sym.code,
        symptomDisplay: sym.display,
        system: sym.system,
        status,
        properties: status === "present" ? (prev?.properties ?? []) : undefined,
        note: status === "present" ? prev?.note : undefined,
      },
    ]);
    if (status === "present") {
      setOpenProps(sym.code);
      if (propsBySymptom[sym.code] === undefined) {
        startTransition(async () => {
          const p = await loadSymptomPropertiesAction(sym.code).catch(() => []);
          setPropsBySymptom((m) => ({ ...m, [sym.code]: p }));
        });
      }
    } else if (openProps === sym.code) {
      setOpenProps(null);
    }
  }

  function allNegative(system: string) {
    const list = grouped.get(system) ?? [];
    const keep = value.filter((o) => o.system !== system);
    const present = value.filter((o) => o.system === system && o.status === "present");
    const denied = list
      .filter((s) => !present.some((p) => p.symptomCode === s.code))
      .map(
        (s): RosObservation => ({
          symptomCode: s.code,
          symptomDisplay: s.display,
          system: s.system,
          status: "denies",
        }),
      );
    onChange([...keep, ...present, ...denied]);
    setCollapsed((c) => new Set(c).add(system));
  }

  function updateProps(code: string, properties: CapturedPropertyValue[]) {
    onChange(value.map((o) => (o.symptomCode === code ? { ...o, properties } : o)));
  }

  if (catalog === null) {
    return <p className="text-muted-foreground text-[12px]">Loading the review of systems…</p>;
  }

  const cover = rosCoverage({ observations: value, pcSystems: [...pcSystems], systems });
  const counts = {
    reviewed: systems.filter((s) => cover[s] === "findings" || cover[s] === "all_negative").length,
    hpc: systems.filter((s) => cover[s] === "hpc").length,
    notReviewed: systems.filter((s) => cover[s] === "not_reviewed").length,
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Scope selector + honest roll-up */}
      <div className="border-border/60 flex flex-col gap-2 rounded-lg border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={LABEL}>Scope</span>
          <div className="border-border inline-flex overflow-hidden rounded-md border">
            {(["complete", "focused"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-3 py-1 text-[12px] font-medium capitalize ${EASE} ${
                  scope.mode === m
                    ? "bg-teal-600 text-white"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <span className="text-muted-foreground text-[11px]">
            {scope.mode === "complete"
              ? "Screening all systems not covered by the complaint."
              : "Pick the systems to review — the rest stay not-reviewed (not negative)."}
          </span>
        </div>
        <p className="text-muted-foreground text-[11px] tabular-nums">
          <span className="text-foreground font-medium">{counts.reviewed}</span> reviewed ·{" "}
          <span className="text-teal-700 dark:text-teal-400">{counts.hpc}</span> covered in HPC ·{" "}
          <span>{counts.notReviewed}</span> not reviewed
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {systems.map((sys) => {
          const list = grouped.get(sys) ?? [];
          const state = cover[sys];
          const hpcCovered = state === "hpc";
          const focusedOut = !hpcCovered && !inScope(sys);
          const isCollapsed = collapsed.has(sys) || focusedOut;
          const positives = list.filter((s) => byCode.get(s.code)?.status === "present").length;
          const reviewed = list.filter((s) => byCode.has(s.code)).length;

          return (
            <section
              key={sys}
              className={`border-border/70 overflow-hidden rounded-lg border ${focusedOut ? "opacity-70" : ""}`}
            >
              <div className="bg-muted/30 flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  onClick={() =>
                    !focusedOut &&
                    setCollapsed((c) => {
                      const n = new Set(c);
                      if (n.has(sys)) n.delete(sys);
                      else n.add(sys);
                      return n;
                    })
                  }
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  aria-expanded={!isCollapsed}
                >
                  {!focusedOut ? (
                    <ChevronDownIcon
                      className={`text-muted-foreground size-3.5 shrink-0 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                      aria-hidden
                    />
                  ) : (
                    <span className="w-3.5" />
                  )}
                  <span className="text-foreground text-[13px] font-semibold">
                    {ROS_SYSTEM_LABEL[sys] ?? sys}
                  </span>
                  {hpcCovered ? (
                    <span className="inline-flex items-center gap-1 rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-700 ring-1 ring-teal-500/30 ring-inset dark:bg-teal-950/40 dark:text-teal-200">
                      <FileTextIcon className="size-3" aria-hidden />
                      covered in HPC
                    </span>
                  ) : focusedOut ? (
                    <span className="text-muted-foreground inline-flex items-center gap-1 text-[10.5px]">
                      <CircleDashedIcon className="size-3" aria-hidden />
                      not reviewed
                    </span>
                  ) : (
                    <RollUp reviewed={reviewed} total={list.length} positives={positives} />
                  )}
                </button>

                {hpcCovered ? null : focusedOut ? (
                  <button
                    type="button"
                    onClick={() => toggleFocus(sys)}
                    className={`text-muted-foreground hover:bg-muted hover:text-foreground inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ${EASE}`}
                  >
                    <PlusIcon className="size-3" aria-hidden />
                    Review
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => allNegative(sys)}
                    className={`text-muted-foreground hover:bg-muted hover:text-foreground rounded-md px-2 py-1 text-[11px] font-medium ${EASE}`}
                    title="Mark every unanswered symptom in this system as denied"
                  >
                    All negative
                  </button>
                )}
              </div>

              {/* HPC-covered: openable (add a screen the HPC didn't capture). */}
              {hpcCovered && !isCollapsed ? (
                <div className="text-muted-foreground border-border/50 border-t px-3 py-2 text-[11.5px]">
                  Reviewed in depth in the History of Presenting Complaint. Anything extra can still
                  be added below.
                  <div className="divide-border/50 mt-1 divide-y">
                    {list.map((s) => (
                      <SymptomRow
                        key={s.code}
                        sym={s}
                        status={byCode.get(s.code)?.status}
                        onStatus={(st) => setStatus(s, st)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {!hpcCovered && !focusedOut && !isCollapsed ? (
                <div className="divide-border/50 divide-y">
                  {list.map((s) => {
                    const st = byCode.get(s.code)?.status;
                    const isOpen = openProps === s.code && st === "present";
                    return (
                      <div key={s.code}>
                        <SymptomRow sym={s} status={st} onStatus={(x) => setStatus(s, x)} />
                        {isOpen ? (
                          <div className="bg-muted/20 border-border/50 border-t px-3 py-2">
                            <RosProps
                              properties={propsBySymptom[s.code] ?? null}
                              current={byCode.get(s.code)?.properties ?? []}
                              note={byCode.get(s.code)?.note ?? ""}
                              onChange={(p) => updateProps(s.code, p)}
                              onNote={(n) =>
                                onChange(
                                  value.map((o) =>
                                    o.symptomCode === s.code ? { ...o, note: n } : o,
                                  ),
                                )
                              }
                            />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {scope.mode === "focused" && !hpcCovered && !focusedOut ? (
                <div className="border-border/50 flex justify-end border-t px-3 py-1.5">
                  <button
                    type="button"
                    onClick={() => toggleFocus(sys)}
                    className="text-muted-foreground hover:text-destructive text-[10.5px]"
                  >
                    remove from focus
                  </button>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function SymptomRow({
  sym,
  status,
  onStatus,
}: {
  sym: RosScreenSymptom;
  status: Status | undefined;
  onStatus: (s: Status | null) => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="text-foreground text-[12.5px]">{sym.display}</span>
        {sym.mustNotMiss ? (
          <AlertTriangleIcon
            className="size-3 shrink-0 text-amber-500"
            aria-label="must-not-miss"
          />
        ) : null}
        {sym.ugandaFlag ? (
          <span className="text-muted-foreground bg-muted rounded px-1 text-[9px] tracking-wide uppercase">
            {sym.ugandaFlag}
          </span>
        ) : null}
      </span>
      <ThreeState
        status={status}
        onDenies={() => onStatus(status === "denies" ? null : "denies")}
        onPresent={() => onStatus(status === "present" ? null : "present")}
      />
    </div>
  );
}

function RollUp({
  reviewed,
  total,
  positives,
}: {
  reviewed: number;
  total: number;
  positives: number;
}) {
  if (reviewed === 0) {
    return (
      <span className="text-muted-foreground ml-1 inline-flex items-center gap-1 text-[10.5px]">
        <CircleDashedIcon className="size-3" aria-hidden />
        not reviewed
      </span>
    );
  }
  if (positives > 0) {
    return (
      <span className="ml-1 inline-flex items-center gap-1 text-[10.5px] font-medium text-teal-700 dark:text-teal-400">
        <CheckIcon className="size-3" aria-hidden />
        {positives} positive
      </span>
    );
  }
  if (reviewed === total) {
    return (
      <span className="text-muted-foreground ml-1 inline-flex items-center gap-1 text-[10.5px]">
        <MinusCircleIcon className="size-3" aria-hidden />
        all negative
      </span>
    );
  }
  return (
    <span className="text-muted-foreground ml-1 font-mono text-[10px] tabular-nums">
      {reviewed}/{total}
    </span>
  );
}

function ThreeState({
  status,
  onDenies,
  onPresent,
}: {
  status: Status | undefined;
  onDenies: () => void;
  onPresent: () => void;
}) {
  const base = `inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ring-1 ring-inset ${EASE}`;
  return (
    <div className="flex shrink-0 gap-1">
      <button
        type="button"
        onClick={onDenies}
        aria-pressed={status === "denies"}
        className={
          status === "denies"
            ? `${base} bg-slate-100 text-slate-700 ring-slate-400/50 dark:bg-slate-800 dark:text-slate-200`
            : `${base} text-muted-foreground ring-border hover:bg-muted/60`
        }
      >
        <MinusCircleIcon className="size-3" aria-hidden />
        Denies
      </button>
      <button
        type="button"
        onClick={onPresent}
        aria-pressed={status === "present"}
        className={
          status === "present"
            ? `${base} bg-teal-50 text-teal-700 ring-teal-500/40 dark:bg-teal-950/40 dark:text-teal-200`
            : `${base} text-muted-foreground ring-border hover:bg-muted/60`
        }
      >
        <CheckIcon className="size-3" aria-hidden />
        Present
      </button>
    </div>
  );
}

function RosProps({
  properties,
  current,
  note,
  onChange,
  onNote,
}: {
  properties: CatalogProperty[] | null;
  current: CapturedPropertyValue[];
  note: string;
  onChange: (next: CapturedPropertyValue[]) => void;
  onNote: (n: string) => void;
}) {
  if (properties === null) {
    return <p className="text-muted-foreground text-[11.5px]">Loading…</p>;
  }
  const get = (code: string) => current.find((p) => p.propertyCode === code);
  function setProp(code: string, build: (prev?: CapturedPropertyValue) => CapturedPropertyValue) {
    const prev = current.find((p) => p.propertyCode === code);
    onChange([...current.filter((p) => p.propertyCode !== code), build(prev)]);
  }
  const chip = (active: boolean) =>
    `rounded px-2 py-0.5 text-[11.5px] ring-1 ring-inset ${EASE} ${active ? "bg-teal-50 text-teal-700 ring-teal-500/40 dark:bg-teal-950/40 dark:text-teal-200" : "text-foreground/70 ring-border hover:bg-muted/60"}`;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-muted-foreground text-[10.5px]">Details (optional)</span>
      {properties.map((prop) => {
        const base = {
          propertyCode: prop.code,
          propertyDisplay: prop.display,
          valueType: prop.valueType,
        };
        const cur = get(prop.code);
        return (
          <div key={prop.code} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-muted-foreground w-24 shrink-0 text-[10px] tracking-wide uppercase">
              {prop.display}
            </span>
            <div className="flex flex-1 flex-wrap items-center gap-1">
              {(prop.valueType === "single_select" || prop.valueType === "multi_select") &&
                prop.options.map((o) => {
                  const labels = cur?.labels ?? [];
                  const active = labels.includes(o.display);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      className={chip(active)}
                      onClick={() =>
                        setProp(prop.code, (prev) => {
                          const c = prev?.labels ?? [];
                          const next =
                            prop.valueType === "single_select"
                              ? active
                                ? []
                                : [o.display]
                              : active
                                ? c.filter((l) => l !== o.display)
                                : [...c, o.display];
                          return { ...base, labels: next };
                        })
                      }
                    >
                      {o.display}
                    </button>
                  );
                })}
              {prop.valueType === "scale" && (
                <div className="flex w-full items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={1}
                    aria-label={prop.display}
                    value={cur?.num ?? 0}
                    onChange={(e) =>
                      setProp(prop.code, () => ({ ...base, num: Number(e.target.value) }))
                    }
                    className="h-1 flex-1 accent-teal-600"
                  />
                  <span className="w-8 text-right text-[11px] tabular-nums">{cur?.num ?? "–"}</span>
                </div>
              )}
              {prop.valueType === "boolean" &&
                [
                  { l: "Yes", v: true },
                  { l: "No", v: false },
                ].map((o) => (
                  <button
                    key={o.l}
                    type="button"
                    className={chip(cur?.bool === o.v)}
                    onClick={() =>
                      setProp(prop.code, (p) => ({
                        ...base,
                        bool: p?.bool === o.v ? undefined : o.v,
                      }))
                    }
                  >
                    {o.l}
                  </button>
                ))}
              {(prop.valueType === "duration" || prop.valueType === "text") && (
                <input
                  value={cur?.text ?? ""}
                  placeholder={prop.valueType === "duration" ? "e.g. 3 days" : ""}
                  onChange={(e) => setProp(prop.code, () => ({ ...base, text: e.target.value }))}
                  className="border-input bg-card w-full max-w-[12rem] rounded px-1.5 py-0.5 text-[11.5px] outline-none focus-visible:border-teal-500"
                />
              )}
            </div>
          </div>
        );
      })}
      <Input value={note} onChange={(e) => onNote(e.target.value)} placeholder="Note (optional)…" />
    </div>
  );
}
