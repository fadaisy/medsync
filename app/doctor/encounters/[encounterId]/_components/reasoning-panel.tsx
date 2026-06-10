"use client";

import type { DifferentialItem } from "@/lib/clerkship/reasoning/types";
import { useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  BrainCircuitIcon,
  ChevronDownIcon,
  PauseCircleIcon,
  ShieldAlertIcon,
} from "lucide-react";

import { diagnosticPausePrompts, reasoningForCodes } from "@/lib/clerkship/reasoning/engine";
import { REASONING_MAPS } from "@/lib/clerkship/reasoning/maps";

/**
 * Clinical reasoning panel — the anti-anchoring surface. Computed PURELY from the
 * captured presenting complaint(s) + the CSO-signed maps. It ALWAYS shows a
 * plural differential incl. the must-not-miss, the discriminators still to ask,
 * the red flags, and the hypothesis-driven exam targets — and at synthesis a
 * diagnostic pause. It is SUGGESTION ONLY: nothing is pre-filled or concluded;
 * the clinician decides. Decision-support, not autonomous.
 */

const EASE = "transition-colors duration-150 ease-expo-out";

export function ReasoningPanel({
  pcCodes,
  pmhConditions,
  atSynthesis,
}: {
  pcCodes: string[];
  pmhConditions: string[];
  atSynthesis: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [showPause, setShowPause] = useState(false);
  const r = useMemo(
    () => reasoningForCodes(REASONING_MAPS, pcCodes, { pmhConditions }),
    [pcCodes, pmhConditions],
  );

  const fired = r.basis.length > 0;
  const mustNotMiss = r.differential.filter((d) => d.likelihood === "must_not_miss");
  const likely = r.differential.filter((d) => d.likelihood !== "must_not_miss");

  return (
    <div className="border-border/70 bg-card/40 overflow-hidden rounded-xl border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
        aria-expanded={open}
      >
        <BrainCircuitIcon
          className="size-4 shrink-0 text-teal-600 dark:text-teal-400"
          aria-hidden
        />
        <span className="text-foreground text-[13px] font-semibold">Clinical reasoning</span>
        <span className="text-muted-foreground hidden text-[10.5px] sm:inline">
          decision support — broadens the differential, never decides
        </span>
        {fired && mustNotMiss.length ? (
          <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <ShieldAlertIcon className="size-3" aria-hidden />
            {mustNotMiss.length} must-not-miss
          </span>
        ) : null}
        <ChevronDownIcon
          className={`text-muted-foreground ml-auto size-4 transition-transform ${open ? "" : "-rotate-90"}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="border-border/50 flex flex-col gap-3 border-t px-3.5 py-3">
          {!fired ? (
            <p className="text-muted-foreground text-[12px]">
              Add a presenting complaint to surface the differential, the must-not-miss, and the
              discriminators to ask + examine.
            </p>
          ) : (
            <>
              {/* Known-disease (anchoring) trap — prominent */}
              {r.knownDiseaseTraps.map((t, i) => (
                <div
                  key={i}
                  className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[12px] text-amber-900 ring-1 ring-amber-500/30 ring-inset dark:bg-amber-950/30 dark:text-amber-200"
                >
                  <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>{t}</span>
                </div>
              ))}

              {/* Must-not-miss group */}
              {mustNotMiss.length ? (
                <Group title="Must not miss" tone="amber">
                  {mustNotMiss.map((d) => (
                    <DxChip key={d.dx} d={d} tone="amber" />
                  ))}
                </Group>
              ) : null}

              {/* Likely / less-likely */}
              {likely.length ? (
                <Group title="Differential">
                  {likely.map((d) => (
                    <DxChip key={d.dx} d={d} tone={d.likelihood === "likely" ? "teal" : "muted"} />
                  ))}
                </Group>
              ) : null}

              {r.redFlags.length ? (
                <Group title="Red flags — re-check" tone="amber">
                  {r.redFlags.map((f, i) => (
                    <span key={i} className="text-[11.5px] text-amber-800 dark:text-amber-300">
                      {f}
                      {i < r.redFlags.length - 1 ? " · " : ""}
                    </span>
                  ))}
                </Group>
              ) : null}

              <TextGroup title="Discriminators to ask" items={r.discriminatingHpc} />
              <TextGroup title="Associated — rule in/out" items={r.associated} />
              <TextGroup
                title="Examine for"
                items={r.examTargets.map(
                  (t) => `${t.sign}${t.discriminates ? ` (${t.discriminates})` : ""}`,
                )}
              />
              <TextGroup title="History that shifts likelihood" items={r.historyEmphasis} />

              {/* Diagnostic pause — always available, emphasised at synthesis */}
              <div
                className={atSynthesis ? "rounded-lg bg-teal-50/60 p-2.5 dark:bg-teal-950/20" : ""}
              >
                <button
                  type="button"
                  onClick={() => setShowPause((s) => !s)}
                  className={`inline-flex items-center gap-1.5 text-[12px] font-medium text-teal-700 dark:text-teal-300 ${EASE}`}
                >
                  <PauseCircleIcon className="size-3.5" aria-hidden />
                  Diagnostic pause {atSynthesis ? "(before you close)" : ""}
                </button>
                {showPause || atSynthesis ? (
                  <ul className="text-muted-foreground mt-1.5 flex list-disc flex-col gap-0.5 pl-5 text-[11.5px]">
                    {diagnosticPausePrompts().map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <p className="text-muted-foreground border-border/40 border-t pt-2 text-[10.5px]">
                Suggestions from {r.basis.join(", ")} — consider/ask/examine/rule-out. The diagnosis
                is yours; nothing here is recorded until you enter it.
              </p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Group({
  title,
  tone,
  children,
}: {
  title: string;
  tone?: "amber" | "teal" | "muted";
  children: React.ReactNode;
}) {
  const c = tone === "amber" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground";
  return (
    <div className="flex flex-col gap-1">
      <span className={`text-[10px] font-medium tracking-[0.1em] uppercase ${c}`}>{title}</span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function DxChip({ d, tone }: { d: DifferentialItem; tone: "amber" | "teal" | "muted" }) {
  const [open, setOpen] = useState(false);
  const cls =
    tone === "amber"
      ? "bg-amber-50 text-amber-800 ring-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200"
      : tone === "teal"
        ? "bg-teal-50 text-teal-700 ring-teal-500/30 dark:bg-teal-950/40 dark:text-teal-200"
        : "text-foreground/70 ring-border";
  const hasDetail = (d.ruleIn?.length ?? 0) + (d.ruleOut?.length ?? 0) > 0;
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={() => hasDetail && setOpen((o) => !o)}
        className={`rounded-md px-2 py-0.5 text-[11.5px] ring-1 ring-inset ${cls} ${hasDetail ? "cursor-pointer" : "cursor-default"}`}
        title={hasDetail ? "Show discriminators" : undefined}
      >
        {d.dx}
      </button>
      {open ? (
        <span className="text-muted-foreground mt-0.5 max-w-[16rem] text-[10.5px] leading-snug">
          {d.ruleIn?.length ? <>+ {d.ruleIn.join(", ")}. </> : null}
          {d.ruleOut?.length ? <>− {d.ruleOut.join(", ")}.</> : null}
        </span>
      ) : null}
    </span>
  );
}

function TextGroup({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-[10px] font-medium tracking-[0.1em] uppercase">
        {title}
      </span>
      <p className="text-foreground/80 text-[11.5px] leading-relaxed">{items.join(" · ")}</p>
    </div>
  );
}
