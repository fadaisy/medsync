"use client";

import { useState } from "react";
import { AlertTriangleIcon, CheckIcon, PillIcon, RouteIcon, ShieldAlertIcon } from "lucide-react";

import { suggestedManagementFor } from "@/lib/clerkship/suggestions/management";
import { cn } from "@/lib/utils";

/**
 * Management-pathway suggestions (Plan GATE C) — DECISION-SUPPORT, never
 * autonomous. For the active presenting complaint(s) it surfaces the cited,
 * ordered management steps + safety-netting templates from the CSO-signed
 * pathway catalog. Tap a step to append it to the management plan; tap a
 * safety-netting line to append it to the safety-net field. NO doses here — drug
 * steps name the agent/class and hand off to the prescribing engine; every step
 * shows its source so staleness is visible.
 *
 * Gated DARK: `suggestedManagementFor` returns nothing until the CSO signs the
 * tranche (MANAGEMENT_PATHWAYS_CSO_SIGNED), so this renders null in production
 * until sign-off — then it lights up with no redeploy of logic.
 */
export function ManagementSuggestions({
  pcCodes,
  onAppendPlan,
  onAppendSafetyNet,
}: {
  pcCodes: string[];
  onAppendPlan: (text: string) => void;
  onAppendSafetyNet: (text: string) => void;
}) {
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const pathways = suggestedManagementFor(pcCodes);
  if (!pathways.length) return null;

  const accept = (key: string, fn: () => void) => {
    fn();
    setAccepted((prev) => new Set(prev).add(key));
  };

  return (
    <div className="border-border bg-muted/20 fade-in-slow flex flex-col gap-3 rounded-xl border p-3">
      <div className="flex items-center gap-2">
        <RouteIcon className="size-4 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden />
        <span className="text-foreground text-[12.5px] font-semibold">Management pathways</span>
      </div>

      {pathways.map((p) => (
        <div key={p.condition} className="flex flex-col gap-2">
          <h5 className="text-foreground text-[12px] font-semibold">{p.condition}</h5>

          {p.feastGuardrail ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50/70 p-2 ring-1 ring-amber-500/20 dark:border-amber-900/50 dark:bg-amber-950/25">
              <ShieldAlertIcon
                className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden
              />
              <p className="text-[10.5px] leading-snug text-amber-800/90 dark:text-amber-300/90">
                {p.feastGuardrail}
              </p>
            </div>
          ) : null}

          <ol className="flex flex-col gap-1.5">
            {p.steps.map((s, i) => {
              const key = `${p.condition}:${s.step}`;
              const done = accepted.has(key);
              return (
                <li
                  key={key}
                  className={cn(
                    "flex flex-col gap-1 rounded-lg border p-2",
                    s.mustNotMiss
                      ? "border-red-300 bg-red-50/60 ring-1 ring-red-500/20 dark:border-red-900/50 dark:bg-red-950/20"
                      : "border-border bg-card",
                  )}
                >
                  <div className="flex items-start gap-2">
                    {s.mustNotMiss ? (
                      <AlertTriangleIcon
                        className="mt-0.5 size-3.5 shrink-0 text-red-600 dark:text-red-400"
                        aria-label="must-not-miss / time-critical"
                      />
                    ) : (
                      <span className="text-muted-foreground mt-0.5 w-3.5 shrink-0 text-center text-[10px] font-semibold">
                        {i + 1}
                      </span>
                    )}
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-foreground text-[12px] font-medium">{s.step}</span>
                        {s.isDrug && s.agentClass ? (
                          <span className="inline-flex items-center gap-1 rounded bg-teal-100 px-1 text-[9.5px] font-medium text-teal-800 dark:bg-teal-950/40 dark:text-teal-300">
                            <PillIcon className="size-2.5" aria-hidden /> {s.agentClass}
                          </span>
                        ) : null}
                        {s.confidence === "needs_cso_input" ? (
                          <span className="rounded bg-amber-100 px-1 text-[9px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                            needs CSO input
                          </span>
                        ) : null}
                      </div>
                      <p className="text-muted-foreground text-[11px] leading-snug">{s.detail}</p>
                      <p className="text-muted-foreground/80 text-[10px]">
                        {s.source.guideline} {s.source.version}
                      </p>
                    </div>

                    <div className="shrink-0">
                      {done ? (
                        <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-teal-700 dark:text-teal-300">
                          <CheckIcon className="size-3.5" aria-hidden /> added
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            accept(key, () =>
                              onAppendPlan(
                                s.isDrug && s.agentClass ? `${s.step} — ${s.agentClass}` : s.step,
                              ),
                            )
                          }
                          className="tap inline-flex items-center gap-1 rounded-md bg-teal-600 px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-teal-700"
                        >
                          add to plan
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          {p.safetyNetting.length ? (
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-[10.5px] font-semibold tracking-wide uppercase">
                Safety-netting
              </span>
              <ul className="flex flex-col gap-1">
                {p.safetyNetting.map((line) => {
                  const key = `${p.condition}:net:${line}`;
                  const done = accepted.has(key);
                  return (
                    <li
                      key={key}
                      className="border-border bg-card flex items-start gap-2 rounded-lg border p-2"
                    >
                      <p className="text-muted-foreground min-w-0 flex-1 text-[11px] leading-snug">
                        {line}
                      </p>
                      {done ? (
                        <span className="inline-flex shrink-0 items-center gap-1 px-1 text-[11px] font-medium text-teal-700 dark:text-teal-300">
                          <CheckIcon className="size-3.5" aria-hidden /> added
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => accept(key, () => onAppendSafetyNet(line))}
                          className="tap text-muted-foreground hover:text-foreground shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium"
                        >
                          add
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      ))}

      <p className="text-muted-foreground/80 text-[10px] italic">
        Decision-support — you decide; nothing is recorded until you add it. Drug steps name the
        agent/class only; doses are handled in the prescribing tool, never here.
      </p>
    </div>
  );
}
