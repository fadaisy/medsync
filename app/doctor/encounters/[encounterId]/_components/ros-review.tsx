"use client";

import type { RosCandidate, RosQuestion } from "@/lib/clerkship/agent/ros-priority";
import type { Demographics, FeatureIndex, ReasoningMap } from "@/lib/clerkship/agent/types";
import type { CatalogProperty, RosScreenSymptom } from "@/lib/clerkship/catalog";
import type { RosObservation, RosScope } from "@/lib/clerkship/ros";
import type { CapturedPropertyValue, CapturedSymptom } from "@/lib/clerkship/symptom-engine";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleDashedIcon,
  FileTextIcon,
  ListChecksIcon,
  MinusCircleIcon,
  PlusIcon,
  SparklesIcon,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { rosLanes } from "@/lib/clerkship/agent/ros-priority";
import { ROS_SYSTEM_LABEL, ROS_SYSTEM_ORDER, rosCoverage } from "@/lib/clerkship/ros";
import {
  loadRosCatalogAction,
  loadSymptomCatalogAction,
  loadSymptomPropertiesAction,
} from "../actions";

/**
 * Review of Systems — a hypothesis-driven sweep (ADR 0080).
 *
 * The sweep is 81 screening symptoms across 12 systems. It used to ask all of
 * them in catalog order regardless of the patient, while the ranking engine sat
 * beside it holding a live differential. Now the two are joined, in three lanes:
 *
 *  1. ASK NEXT — the handful of unanswered screens whose answer would move the
 *     differential apart most (lib/clerkship/agent/ros-priority.ts). Ranked by
 *     DISCRIMINATION between hypotheses, never by confirmation of the leader, and
 *     re-ranks live as answers land.
 *  2. RED FLAGS — every unanswered must-not-miss screen. Ordered by relevance,
 *     never ranked out, never capped, shown even in a focused sweep and even when
 *     the ranking engine is gated off.
 *  3. FULL SWEEP — the complete system-by-system accordion, unchanged: PC-system
 *     suppression, focused/complete scope, per-system "all negative".
 *
 * Lanes 1–2 are an ATTENTION layer, never a filter — nothing is removed from the
 * sweep and nothing is auto-answered. ADR 0063's coverage honesty is untouched:
 * coverage still comes from what was actually answered, and not-reviewed is never
 * marked negative. Three-state per symptom (not-asked / denies / present) with a
 * distinct icon + label + tone. Decision-support, never autonomous.
 */

const EASE = "transition-colors duration-150 ease-expo-out";
const LABEL = "text-muted-foreground text-[10px] font-medium tracking-[0.1em] uppercase";
const EMPTY_INDEX: FeatureIndex = {
  presentDisplays: new Set(),
  deniedDisplays: new Set(),
  complaintCodes: new Set(),
  provenance: new Map(),
};

type Status = "present" | "denies";

/** The live ranking context. Omit (or pass null) to render the plain sweep. */
export interface RosAgent {
  index: FeatureIndex;
  maps: ReasoningMap[];
  demographics?: Demographics;
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * FLIP re-order for the ranked lane. The movement IS the message: it shows the
 * clinician that what they just recorded changed what to ask next — the payoff
 * the old sweep never gave. Sanctioned motion only (expo-out, 250ms), and
 * nothing at all under prefers-reduced-motion.
 */
function useReorderFlip(signature: string) {
  const nodes = useRef(new Map<string, HTMLElement>());
  const tops = useRef(new Map<string, number>());

  useIsoLayoutEffect(() => {
    const next = new Map<string, number>();
    for (const [key, el] of nodes.current) next.set(key, el.getBoundingClientRect().top);
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!still) {
      for (const [key, el] of nodes.current) {
        const from = tops.current.get(key);
        const to = next.get(key);
        if (from == null || to == null || Math.abs(from - to) < 1) continue;
        if (typeof el.animate !== "function") continue;
        el.animate([{ transform: `translateY(${from - to}px)` }, { transform: "translateY(0)" }], {
          duration: 250,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        });
      }
    }
    tops.current = next;
  }, [signature]);

  return (key: string) => (el: HTMLElement | null) => {
    if (el) nodes.current.set(key, el);
    else nodes.current.delete(key);
  };
}

export function RosReview({
  value,
  onChange,
  scope,
  onScopeChange,
  hpcItems,
  agent,
}: {
  value: RosObservation[];
  onChange: (next: RosObservation[]) => void;
  scope: RosScope;
  onScopeChange: (next: RosScope) => void;
  hpcItems: CapturedSymptom[];
  agent?: RosAgent | null;
}) {
  const [catalog, setCatalog] = useState<RosScreenSymptom[] | null>(null);
  const [systemByCode, setSystemByCode] = useState<Map<string, string>>(new Map());
  const [propsBySymptom, setPropsBySymptom] = useState<Record<string, CatalogProperty[]>>({});
  const [openProps, setOpenProps] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [sweepOpen, setSweepOpen] = useState<boolean | null>(null);
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
  const symByCode = useMemo(() => new Map((catalog ?? []).map((s) => [s.code, s])), [catalog]);

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

  // Every screen still unanswered and not already owned by the HPC. This is what
  // the ranker is allowed to prioritise — it can re-order these, never hide them.
  const candidates: RosCandidate[] = useMemo(
    () =>
      (catalog ?? [])
        .filter((s) => !byCode.has(s.code) && !pcSystems.has(s.system))
        .map((s) => ({
          code: s.code,
          display: s.display,
          system: s.system,
          mustNotMiss: s.mustNotMiss,
        })),
    [catalog, byCode, pcSystems],
  );

  // With no agent (ranking gated off, or nothing captured yet) this still returns
  // a complete red-flag lane and an empty ranked lane — the sweep renders as before.
  const lanes = useMemo(
    () =>
      rosLanes({
        index: agent?.index ?? EMPTY_INDEX,
        maps: agent?.maps ?? [],
        demographics: agent?.demographics,
        candidates,
        inScope: (sys) => scope.mode === "complete" || scope.reviewedSystems.includes(sys),
      }),
    [agent, candidates, scope],
  );

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
  function includeSystems(sys: string[]) {
    onScopeChange({
      mode: "focused",
      reviewedSystems: [...new Set([...scope.reviewedSystems, ...sys])],
    });
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
    // Detail capture is opt-in (ADR 0080): a screening question is three-state,
    // and the property editor no longer springs open on every positive.
    if (status !== "present" && openProps === sym.code) setOpenProps(null);
  }

  /** Answer from a lane row — resolves the catalog entry the lanes only reference. */
  function answer(code: string, status: Status) {
    const sym = symByCode.get(code);
    if (sym) setStatus(sym, status);
  }

  function openDetail(code: string) {
    setOpenProps((cur) => (cur === code ? null : code));
    if (propsBySymptom[code] === undefined) {
      startTransition(async () => {
        const p = await loadSymptomPropertiesAction(code).catch(() => []);
        setPropsBySymptom((m) => ({ ...m, [code]: p }));
      });
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
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-10 rounded-lg" />
        <Skeleton className="h-10 rounded-lg" />
        <Skeleton className="h-10 rounded-lg" />
        <p className="text-muted-foreground text-[12px]">Loading the review of systems…</p>
      </div>
    );
  }

  const cover = rosCoverage({ observations: value, pcSystems: [...pcSystems], systems });
  const counts = {
    reviewed: systems.filter((s) => cover[s] === "findings" || cover[s] === "all_negative").length,
    hpc: systems.filter((s) => cover[s] === "hpc").length,
    notReviewed: systems.filter((s) => cover[s] === "not_reviewed").length,
  };
  // The sweep leads only when there is no ranked lane to lead with. This component
  // unmounts on a tab switch, so the default is re-evaluated per visit — it never
  // collapses under the clinician mid-edit — and their toggle always wins.
  const showSweep = sweepOpen ?? !lanes.discriminating.length;

  return (
    <div className="flex flex-col gap-3">
      <ScopeBar
        scope={scope}
        counts={counts}
        onMode={setMode}
        redFlagsLeft={lanes.redFlags.length}
      />

      <AskNextLane
        questions={lanes.discriminating}
        outOfFocus={lanes.outOfFocus}
        active={lanes.active}
        onAnswer={answer}
        onIncludeSystems={includeSystems}
      />

      <RedFlagLane questions={lanes.redFlags} active={lanes.active} onAnswer={answer} />

      <section className="border-border bg-card overflow-hidden rounded-xl border">
        <button
          type="button"
          onClick={() => setSweepOpen(!showSweep)}
          aria-expanded={showSweep}
          className={`hover:bg-muted/40 flex w-full items-center gap-2 px-3 py-2 text-left ${EASE}`}
        >
          <ListChecksIcon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
          <span className="text-foreground text-[12px] font-medium">Full systems sweep</span>
          <span className="text-muted-foreground text-[10.5px] tabular-nums">
            {counts.reviewed}/{systems.length} systems reviewed
          </span>
          <ChevronDownIcon
            className={`text-muted-foreground ease-expo-out ml-auto size-3.5 shrink-0 transition-transform duration-150 ${showSweep ? "" : "-rotate-90"}`}
            aria-hidden
          />
        </button>

        {showSweep ? (
          <div className="border-border/60 reveal-up flex flex-col gap-2 border-t p-2">
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
                  className={`border-border/70 overflow-hidden rounded-lg border transition-[opacity,border-color] duration-200 ${focusedOut ? "opacity-70" : "hover:border-border"}`}
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
                      <span className="text-foreground text-[13px] font-medium">
                        {ROS_SYSTEM_LABEL[sys] ?? sys}
                      </span>
                      {hpcCovered ? (
                        <span className="scale-in inline-flex items-center gap-1 rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-700 ring-1 ring-teal-500/30 ring-inset dark:bg-teal-950/40 dark:text-teal-200">
                          <FileTextIcon className="size-3" aria-hidden />
                          covered in HPC
                        </span>
                      ) : focusedOut ? (
                        <span className="text-muted-foreground inline-flex items-center gap-1 text-[10.5px]">
                          <CircleDashedIcon className="size-3" aria-hidden />
                          not reviewed
                        </span>
                      ) : (
                        <RollUp
                          key={positives}
                          reviewed={reviewed}
                          total={list.length}
                          positives={positives}
                        />
                      )}
                    </button>

                    {hpcCovered ? null : focusedOut ? (
                      <button
                        type="button"
                        onClick={() => toggleFocus(sys)}
                        className={`tap text-muted-foreground hover:bg-muted hover:text-foreground inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ${EASE}`}
                      >
                        <PlusIcon className="size-3" aria-hidden />
                        Review
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => allNegative(sys)}
                        className={`tap text-muted-foreground hover:bg-muted hover:text-foreground rounded-md px-2 py-1 text-[11px] font-medium ${EASE}`}
                        title="Mark every unanswered symptom in this system as denied"
                      >
                        All negative
                      </button>
                    )}
                  </div>

                  {/* HPC-covered: openable (add a screen the HPC didn't capture). */}
                  {hpcCovered && !isCollapsed ? (
                    <div className="text-muted-foreground border-border/50 reveal-up border-t px-3 py-2 text-[11.5px]">
                      Reviewed in depth in the History of Presenting Complaint. Anything extra can
                      still be added below.
                      <div className="divide-border/50 mt-1 divide-y">
                        {list.map((s) => (
                          <SymptomRow
                            key={s.code}
                            sym={s}
                            status={byCode.get(s.code)?.status}
                            onStatus={(st) => setStatus(s, st)}
                            onDetail={() => openDetail(s.code)}
                            detailOpen={openProps === s.code}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {!hpcCovered && !focusedOut && !isCollapsed ? (
                    <div className="divide-border/50 reveal-up divide-y">
                      {list.map((s) => {
                        const st = byCode.get(s.code)?.status;
                        const isOpen = openProps === s.code && st === "present";
                        return (
                          <div key={s.code}>
                            <SymptomRow
                              sym={s}
                              status={st}
                              onStatus={(x) => setStatus(s, x)}
                              onDetail={() => openDetail(s.code)}
                              detailOpen={isOpen}
                            />
                            {isOpen ? (
                              <div className="bg-muted/20 border-border/50 reveal-up border-t px-3 py-2">
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
        ) : null}
      </section>
    </div>
  );
}

/* ── lane 1: ask next ─────────────────────────────────────────────────────── */

function AskNextLane({
  questions,
  outOfFocus,
  active,
  onAnswer,
  onIncludeSystems,
}: {
  questions: RosQuestion[];
  outOfFocus: RosQuestion[];
  active: boolean;
  onAnswer: (code: string, status: Status) => void;
  onIncludeSystems: (systems: string[]) => void;
}) {
  const register = useReorderFlip(questions.map((q) => q.code).join("|"));
  if (!active) return null;
  const top = questions[0]?.gain ?? 1;
  const heldBack = [...new Set(outOfFocus.map((q) => q.system))];
  const heldBackLabel =
    heldBack.length === 1 ? (ROS_SYSTEM_LABEL[heldBack[0]!] ?? heldBack[0]!) : "those systems";

  return (
    <section className="border-border bg-card scale-in overflow-hidden rounded-xl border shadow-sm">
      <div className="border-border/60 flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b bg-teal-50/60 px-3 py-2 dark:bg-teal-950/25">
        <SparklesIcon className="size-3.5 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden />
        <span className="text-foreground text-[11px] font-semibold tracking-[0.04em]">
          Ask next
        </span>
        <span className="text-muted-foreground text-[10.5px]">
          ranked by what would change the differential
        </span>
        <span
          aria-hidden
          className="pulse-dot ml-auto size-1.5 shrink-0 rounded-full bg-teal-500"
          title="Re-ranks as you capture"
        />
      </div>

      {!questions.length && !outOfFocus.length ? (
        <p className="text-muted-foreground px-3 py-2 text-[11px]">
          Nothing else in this differential turns on a screening question. The full sweep below
          still covers everything for the record.
        </p>
      ) : null}

      {questions.length ? (
        <ul className="divide-border/50 divide-y">
          {questions.map((q) => (
            <li key={q.code} ref={register(q.code)} className="reveal-up bg-card">
              <div className="flex items-start gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span className="text-foreground text-[13px] font-medium">{q.display}</span>
                    <span className={LABEL}>{ROS_SYSTEM_LABEL[q.system] ?? q.system}</span>
                  </div>
                  {q.why ? (
                    <p className="text-muted-foreground mt-0.5 text-[11px] leading-snug">{q.why}</p>
                  ) : null}
                </div>
                <ThreeState
                  status={undefined}
                  onDenies={() => onAnswer(q.code, "denies")}
                  onPresent={() => onAnswer(q.code, "present")}
                />
              </div>
              {/* Redundant visual encoding of the ranking already shown by the
                  order and the reason line — never the only signal. */}
              <div className="bg-border/30 h-px w-full" aria-hidden>
                <div
                  className="ease-expo-out h-px bg-teal-500/70 transition-[width] duration-[250ms]"
                  style={{ width: `${Math.max(6, Math.round((q.gain / top) * 100))}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {outOfFocus.length ? (
        <div className="border-border/50 flex flex-wrap items-center gap-x-2 gap-y-1 border-t px-3 py-2">
          <span className="text-muted-foreground text-[11px]">
            {outOfFocus.length} discriminating{" "}
            {outOfFocus.length === 1 ? "question sits" : "questions sit"} outside your focus.
          </span>
          <button
            type="button"
            onClick={() => onIncludeSystems(heldBack)}
            className={`tap rounded-md px-2 py-0.5 text-[11px] font-medium text-teal-700 ring-1 ring-teal-500/40 ring-inset hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-teal-950/40 ${EASE}`}
          >
            Include {heldBackLabel}
          </button>
        </div>
      ) : null}
    </section>
  );
}

/* ── lane 2: red flags ────────────────────────────────────────────────────── */

function RedFlagLane({
  questions,
  active,
  onAnswer,
}: {
  questions: RosQuestion[];
  active: boolean;
  onAnswer: (code: string, status: Status) => void;
}) {
  if (!questions.length) return null;
  return (
    <section className="bg-card overflow-hidden rounded-xl border border-amber-300/60 dark:border-amber-800/60">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-amber-300/40 bg-amber-50/60 px-3 py-2 dark:border-amber-800/40 dark:bg-amber-950/25">
        <AlertTriangleIcon
          className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden
        />
        <span className="text-foreground text-[11px] font-semibold tracking-[0.04em]">
          Red flags — not yet asked
        </span>
        <span className="ml-auto shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 tabular-nums dark:bg-amber-900/50 dark:text-amber-200">
          {questions.length} left
        </span>
      </div>

      <ul className="bg-border/40 grid gap-px sm:grid-cols-2">
        {questions.map((q) => (
          <li key={q.code} className="bg-card flex items-center gap-2 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="text-foreground block truncate text-[12.5px]">{q.display}</span>
              {q.why ? (
                <span className="text-muted-foreground block truncate text-[10.5px]">{q.why}</span>
              ) : null}
            </span>
            <ThreeState
              status={undefined}
              compact
              onDenies={() => onAnswer(q.code, "denies")}
              onPresent={() => onAnswer(q.code, "present")}
            />
          </li>
        ))}
      </ul>

      <p className="text-muted-foreground border-t border-amber-300/30 px-3 py-1.5 text-[10px] dark:border-amber-800/30">
        {active
          ? "Ordered by relevance to the live differential — but never ranked out. These stay listed until answered, in a focused sweep too."
          : "Every must-not-miss screen stays listed until answered — a focused sweep never drops one."}
      </p>
    </section>
  );
}

/* ── header ───────────────────────────────────────────────────────────────── */

function ScopeBar({
  scope,
  counts,
  onMode,
  redFlagsLeft,
}: {
  scope: RosScope;
  counts: { reviewed: number; hpc: number; notReviewed: number };
  onMode: (m: "complete" | "focused") => void;
  redFlagsLeft: number;
}) {
  return (
    <div className="border-border bg-card flex flex-col gap-2 rounded-xl border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={LABEL}>Scope</span>
        <div className="border-border inline-flex overflow-hidden rounded-md border">
          {(["complete", "focused"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onMode(m)}
              className={`tap px-3 py-1 text-[12px] font-medium capitalize ${EASE} ${
                scope.mode === m ? "bg-teal-600 text-white" : "text-muted-foreground hover:bg-muted"
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
      <p className="text-muted-foreground flex flex-wrap items-center gap-x-1 text-[11px] tabular-nums">
        <span className="text-foreground font-medium">{counts.reviewed}</span> reviewed ·{" "}
        <span className="text-teal-700 dark:text-teal-400">{counts.hpc}</span> covered in HPC ·{" "}
        <span>{counts.notReviewed}</span> not reviewed
        {redFlagsLeft ? (
          <>
            {" · "}
            <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
              <AlertTriangleIcon className="size-3" aria-hidden />
              {redFlagsLeft} red {redFlagsLeft === 1 ? "flag" : "flags"} unasked
            </span>
          </>
        ) : null}
      </p>
    </div>
  );
}

/* ── shared rows ──────────────────────────────────────────────────────────── */

function SymptomRow({
  sym,
  status,
  onStatus,
  onDetail,
  detailOpen,
}: {
  sym: RosScreenSymptom;
  status: Status | undefined;
  onStatus: (s: Status | null) => void;
  onDetail: () => void;
  detailOpen: boolean;
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
        {status === "present" ? (
          <button
            type="button"
            onClick={onDetail}
            aria-expanded={detailOpen}
            className={`tap text-muted-foreground hover:text-foreground shrink-0 rounded px-1 text-[10.5px] ${EASE}`}
          >
            {detailOpen ? "hide detail" : "+ detail"}
          </button>
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
  compact,
}: {
  status: Status | undefined;
  onDenies: () => void;
  onPresent: () => void;
  compact?: boolean;
}) {
  const base = `tap inline-flex items-center gap-1 rounded-md ${compact ? "px-1.5" : "px-2"} py-1 text-[11px] font-medium ring-1 ring-inset ${EASE}`;
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
    `tap rounded px-2 py-0.5 text-[11.5px] ring-1 ring-inset ${EASE} ${active ? "bg-teal-50 text-teal-700 ring-teal-500/40 dark:bg-teal-950/40 dark:text-teal-200" : "text-foreground/70 ring-border hover:bg-muted/60"}`;

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
