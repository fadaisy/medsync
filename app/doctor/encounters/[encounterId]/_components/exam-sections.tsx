"use client";

import type { ExamObservation, FindingState } from "@/lib/clerkship/exam/types";
import { useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleDashedIcon,
  MinusCircleIcon,
} from "lucide-react";

import { EXAM_FINDINGS, EXAM_GROUPS } from "@/lib/clerkship/exam/catalog";
import { normalGeneralExam, renderExamProse } from "@/lib/clerkship/exam/engine";

/**
 * General examination — tap-first three-state capture (not-examined / normal /
 * findings) + value-set chips. Low-scroll: groups are COLLAPSED by default in a
 * two-column grid with a status chip each, so the whole survey fits on one short
 * screen; tap a group to capture (it spans full width while open). not-examined ≠
 * normal (honest). Decision-support — nothing auto-recorded.
 */

const EASE = "transition-colors duration-150 ease-expo-out";
const NORMAL_SELECT = new Set([
  "well",
  "none",
  "normal",
  "not raised",
  "central",
  "present",
  "warm",
  "≤2 s",
  "well-hydrated",
]);

const chip = (active: boolean) =>
  `rounded-md px-2 py-0.5 text-[11.5px] ring-1 ring-inset ${EASE} ${active ? "bg-teal-50 text-teal-700 ring-teal-500/40 dark:bg-teal-950/40 dark:text-teal-200" : "text-foreground/70 ring-border hover:bg-muted/60"}`;
const seg = (active: boolean, tone: "muted" | "teal" = "muted") =>
  `inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${EASE} ${
    active
      ? tone === "teal"
        ? "bg-teal-50 text-teal-700 ring-teal-500/40 dark:bg-teal-950/40 dark:text-teal-200"
        : "bg-slate-100 text-slate-700 ring-slate-400/50 dark:bg-slate-800 dark:text-slate-200"
      : "text-muted-foreground ring-border hover:bg-muted/60"
  }`;

function isFinding(o: ExamObservation | undefined): boolean {
  if (!o || o.state !== "present") return false;
  // a select holding a normal value is not a "finding"
  if ((o.values ?? []).length && (o.values ?? []).every((v) => NORMAL_SELECT.has(v))) return false;
  return true;
}

export function ExamSections({
  value,
  onChange,
}: {
  value: ExamObservation[];
  onChange: (next: ExamObservation[]) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const byCode = useMemo(() => new Map(value.map((o) => [o.code, o])), [value]);

  function set(code: string, patch: Partial<ExamObservation> | null) {
    const f = EXAM_FINDINGS.find((x) => x.code === code);
    if (!f) return;
    const others = value.filter((o) => o.code !== code);
    if (patch === null) return onChange(others);
    const prev = byCode.get(code) ?? {
      code,
      group: f.group,
      display: f.display,
      state: "not_examined" as FindingState,
    };
    onChange([...others, { ...prev, ...patch }]);
  }

  const totalFindings = value.filter((o) => isFinding(o)).length;
  const totalTouched = value.filter((o) => o.state !== "not_examined").length;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-foreground text-[13px] font-semibold">General examination</span>
        {totalFindings ? (
          <span className="rounded-full bg-teal-100 px-1.5 text-[10px] font-semibold text-teal-800 dark:bg-teal-950/40 dark:text-teal-300">
            {totalFindings} finding{totalFindings > 1 ? "s" : ""}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => onChange(normalGeneralExam())}
          className={`text-muted-foreground hover:bg-muted hover:text-foreground ml-auto rounded-md px-2.5 py-1 text-[11.5px] font-medium ${EASE}`}
          title="Set the routine survey to normal; characterise only the positives"
        >
          Normal general exam
        </button>
      </div>

      <div className="grid items-start gap-2 sm:grid-cols-2">
        {EXAM_GROUPS.map((g) => {
          const findings = EXAM_FINDINGS.filter((x) => x.group === g.key);
          const isOpen = open.has(g.key);
          const groupObs = findings.map((x) => byCode.get(x.code));
          const nFindings = groupObs.filter((o) => isFinding(o)).length;
          const nTouched = groupObs.filter((o) => o && o.state !== "not_examined").length;
          return (
            <section
              key={g.key}
              className={`border-border/70 overflow-hidden rounded-lg border ${isOpen ? "sm:col-span-2" : ""}`}
            >
              <button
                type="button"
                onClick={() =>
                  setOpen((c) => {
                    const n = new Set(c);
                    if (n.has(g.key)) n.delete(g.key);
                    else n.add(g.key);
                    return n;
                  })
                }
                className="bg-muted/30 hover:bg-muted/50 flex w-full items-center gap-2 px-3 py-2 text-left"
              >
                <ChevronDownIcon
                  className={`text-muted-foreground size-3.5 shrink-0 transition-transform ${isOpen ? "" : "-rotate-90"}`}
                  aria-hidden
                />
                <span className="text-foreground min-w-0 flex-1 truncate text-[12.5px] font-semibold">
                  {g.label}
                </span>
                {nFindings ? (
                  <span className="shrink-0 rounded-full bg-teal-100 px-1.5 text-[10px] font-semibold text-teal-800 dark:bg-teal-950/40 dark:text-teal-300">
                    {nFindings}
                  </span>
                ) : nTouched ? (
                  <span className="text-muted-foreground shrink-0 text-[10px]">normal</span>
                ) : null}
              </button>
              {isOpen ? (
                <div className="divide-border/50 divide-y">
                  {findings.map((x) => {
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
                            {x.ugandaFlag ? (
                              <span className="text-muted-foreground bg-muted rounded px-1 text-[9px] uppercase">
                                {x.ugandaFlag}
                              </span>
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
                                    set(
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
                                  set(
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
                                  set(x.code, o?.state === "present" ? null : { state: "present" })
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
                                    set(x.code, {
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
              ) : null}
            </section>
          );
        })}
      </div>

      {totalTouched ? (
        <div className="rounded-lg border border-teal-200/70 bg-teal-50/60 px-3 py-2 dark:border-teal-900/50 dark:bg-teal-950/20">
          <span className="inline-flex items-center gap-1 text-[10px] font-medium tracking-wide text-teal-700 uppercase dark:text-teal-400">
            <CircleDashedIcon className="size-3" aria-hidden /> Auto-generated summary
          </span>
          <p className="mt-0.5 text-[12px] leading-relaxed text-teal-900/90 italic dark:text-teal-100/80">
            {renderExamProse(value)}
          </p>
        </div>
      ) : null}
    </div>
  );
}
