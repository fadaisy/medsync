"use client";

import type { CatalogProperty, RosScreenSymptom } from "@/lib/clerkship/catalog";
import type { RosObservation } from "@/lib/clerkship/ros";
import type { CapturedPropertyValue, CapturedSymptom } from "@/lib/clerkship/symptom-engine";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleDashedIcon,
  MinusCircleIcon,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { ROS_SYSTEM_LABEL, ROS_SYSTEM_ORDER } from "@/lib/clerkship/ros";
import { loadRosCatalogAction, loadSymptomPropertiesAction } from "../actions";

/**
 * Review of Systems — the system-grouped, tap-first screening sweep. Mostly
 * negative by design: each screening symptom is three-state (not-asked / denies /
 * present), with distinct treatments (icon + label + tone, never colour alone),
 * a one-tap "All negative" per system, a persistent progress indicator + per-
 * system roll-up chips, and present → the tap-first property capture (optional).
 * Carried-over presenting-complaint symptoms show as already-positive. A running
 * summary renders the documentation as the clinician sweeps. Decision-support —
 * nothing is auto-marked; not-asked ≠ denied.
 */

const EASE = "transition-colors duration-150 ease-expo-out";
const LABEL = "text-muted-foreground text-[10px] font-medium tracking-[0.1em] uppercase";

type Status = "present" | "denies";

export function RosReview({
  value,
  onChange,
  hpcItems,
}: {
  value: RosObservation[];
  onChange: (next: RosObservation[]) => void;
  hpcItems: CapturedSymptom[];
}) {
  const [catalog, setCatalog] = useState<RosScreenSymptom[] | null>(null);
  const [propsBySymptom, setPropsBySymptom] = useState<Record<string, CatalogProperty[]>>({});
  const [openProps, setOpenProps] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  useEffect(() => {
    loadRosCatalogAction()
      .then(setCatalog)
      .catch(() => setCatalog([]));
  }, []);

  // Symptoms carried over from the presenting complaint — shown already-positive.
  const carriedOver = useMemo(() => new Map(hpcItems.map((h) => [h.symptomCode, h])), [hpcItems]);
  const byCode = useMemo(() => new Map(value.map((o) => [o.symptomCode, o])), [value]);

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

  function statusOf(code: string): Status | "carried" | undefined {
    if (carriedOver.has(code)) return "carried";
    return byCode.get(code)?.status;
  }

  function setStatus(sym: RosScreenSymptom, status: Status | null) {
    if (carriedOver.has(sym.code)) return; // locked — it's the complaint
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
      .filter((s) => !carriedOver.has(s.code) && !present.some((p) => p.symptomCode === s.code))
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

  const reviewedSystems = systems.filter((sys) => {
    const list = grouped.get(sys) ?? [];
    return list.some((s) => statusOf(s.code) !== undefined);
  }).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Persistent progress */}
      <div className="border-border/60 flex items-center gap-3 rounded-lg border px-3 py-2">
        <span className={LABEL}>Reviewed</span>
        <div className="bg-muted relative h-1.5 flex-1 overflow-hidden rounded-full">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-teal-500 transition-[width] duration-300"
            style={{ width: `${systems.length ? (reviewedSystems / systems.length) * 100 : 0}%` }}
          />
        </div>
        <span className="text-foreground font-mono text-[11px] tabular-nums">
          {reviewedSystems} / {systems.length}
        </span>
      </div>

      {/* System sections */}
      <div className="flex flex-col gap-2">
        {systems.map((sys) => {
          const list = grouped.get(sys) ?? [];
          const reviewed = list.filter((s) => statusOf(s.code) !== undefined).length;
          const positives = list.filter(
            (s) => statusOf(s.code) === "present" || statusOf(s.code) === "carried",
          ).length;
          const isCollapsed = collapsed.has(sys);
          return (
            <section key={sys} className="border-border/70 overflow-hidden rounded-lg border">
              <div className="bg-muted/30 flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  onClick={() =>
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
                  <ChevronDownIcon
                    className={`text-muted-foreground size-3.5 shrink-0 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                    aria-hidden
                  />
                  <span className="text-foreground text-[13px] font-semibold">
                    {ROS_SYSTEM_LABEL[sys] ?? sys}
                  </span>
                  <RollUp reviewed={reviewed} total={list.length} positives={positives} />
                </button>
                <button
                  type="button"
                  onClick={() => allNegative(sys)}
                  className={`text-muted-foreground hover:bg-muted hover:text-foreground rounded-md px-2 py-1 text-[11px] font-medium ${EASE}`}
                  title="Mark every unanswered symptom in this system as denied"
                >
                  All negative
                </button>
              </div>

              {!isCollapsed ? (
                <div className="divide-border/50 divide-y">
                  {list.map((s) => {
                    const st = statusOf(s.code);
                    const isOpen = openProps === s.code && st === "present";
                    return (
                      <div key={s.code}>
                        <div className="flex items-center gap-2 px-3 py-2">
                          <span className="flex min-w-0 flex-1 items-center gap-1.5">
                            <span className="text-foreground text-[12.5px]">{s.display}</span>
                            {s.mustNotMiss ? (
                              <AlertTriangleIcon
                                className="size-3 shrink-0 text-amber-500"
                                aria-label="must-not-miss"
                              />
                            ) : null}
                            {s.ugandaFlag ? (
                              <span className="text-muted-foreground bg-muted rounded px-1 text-[9px] tracking-wide uppercase">
                                {s.ugandaFlag}
                              </span>
                            ) : null}
                            {st === "carried" ? (
                              <span className="text-[10px] text-teal-700 dark:text-teal-400">
                                from complaint
                              </span>
                            ) : null}
                          </span>
                          {st === "carried" ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-1 text-[11px] font-medium text-teal-700 ring-1 ring-teal-500/30 ring-inset dark:bg-teal-950/40 dark:text-teal-200">
                              <CheckIcon className="size-3" aria-hidden />
                              Present
                            </span>
                          ) : (
                            <ThreeState
                              status={st}
                              onDenies={() => setStatus(s, st === "denies" ? null : "denies")}
                              onPresent={() => setStatus(s, st === "present" ? null : "present")}
                            />
                          )}
                        </div>
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
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Per-system roll-up status chip — distinct treatments, not colour alone. */
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

/** Three visually-distinct states: not-asked (neither lit) · denies · present. */
function ThreeState({
  status,
  onDenies,
  onPresent,
}: {
  status: Status | "carried" | undefined;
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

/** Compact, optional property capture for an ROS positive (tap-first; same value types). */
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
              {prop.valueType === "duration" && (
                <input
                  value={cur?.text ?? ""}
                  placeholder="e.g. 3 days"
                  onChange={(e) => setProp(prop.code, () => ({ ...base, text: e.target.value }))}
                  className="border-input bg-card w-28 rounded px-1.5 py-0.5 text-[11.5px] outline-none focus-visible:border-teal-500"
                />
              )}
              {prop.valueType === "text" && (
                <input
                  value={cur?.text ?? ""}
                  onChange={(e) => setProp(prop.code, () => ({ ...base, text: e.target.value }))}
                  className="border-input bg-card w-full rounded px-1.5 py-0.5 text-[11.5px] outline-none focus-visible:border-teal-500"
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
