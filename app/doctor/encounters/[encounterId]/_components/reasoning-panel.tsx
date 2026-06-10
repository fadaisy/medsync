"use client";

import type { ExamObservation } from "@/lib/clerkship/exam/types";
import type { ScoredDifferential } from "@/lib/clerkship/reasoning/types";
import type { RosObservation } from "@/lib/clerkship/ros";
import type { CapturedSymptom } from "@/lib/clerkship/symptom-engine";
import type { ClerkSocial } from "@/lib/encounter/clerkship";
import { useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  BrainCircuitIcon,
  MinusIcon,
  PauseCircleIcon,
  ShieldAlertIcon,
  XIcon,
} from "lucide-react";

import { examReasoningTokens } from "@/lib/clerkship/exam/engine";
import { diagnosticPausePrompts, liveReasoningForCodes } from "@/lib/clerkship/reasoning/engine";
import { REASONING_MAPS } from "@/lib/clerkship/reasoning/maps";

/**
 * Clinical reasoning — a FLOATING, LIVE, anti-anchoring panel that moves with the
 * clerkship. As the clinician taps symptom properties / ROS / history, the
 * differential RE-RANKS (rule-in raises, rule-out/denial lowers), surfaces what
 * to ask + examine next, and flags risk factors + red flags. Computed PURELY on
 * the client (no API, no latency, no PHI leaves the page). It NEVER narrows to
 * one answer, never drops a must-not-miss, never auto-fills. Decision-support.
 */

function socialTokens(s: ClerkSocial | undefined): string[] {
  if (!s) return [];
  const out: string[] = [];
  if (s.smokingStatus === "current" || s.smokingStatus === "ex") out.push("smoking", "smoker");
  if (s.alcoholStatus === "regular" || s.alcoholStatus === "ex") out.push("alcohol");
  if (s.drugUse === "current" || s.drugUse === "past") out.push("recreational drugs", "IVDU");
  if (s.occupation) out.push(s.occupation);
  if (s.exposures?.length) out.push(...s.exposures);
  return out;
}

export function ReasoningPanel({
  pcCodes,
  hpcItems,
  ros,
  pmhConditions,
  fhScreen,
  social,
  examFindings,
  atSynthesis,
}: {
  pcCodes: string[];
  hpcItems: CapturedSymptom[];
  ros: RosObservation[];
  pmhConditions: string[];
  fhScreen: Record<string, "yes" | "no" | "unsure">;
  social: ClerkSocial;
  examFindings: ExamObservation[];
  atSynthesis: boolean;
}) {
  const [open, setOpen] = useState(true);

  const r = useMemo(() => {
    const features = hpcItems.flatMap((i) => [
      i.symptomDisplay,
      ...i.properties.flatMap((p) => [...(p.labels ?? []), p.text ?? ""]),
    ]);
    const fhYes = Object.entries(fhScreen)
      .filter(([, v]) => v === "yes")
      .map(([k]) => k.replace(/_/g, " "));
    const fhNo = Object.entries(fhScreen)
      .filter(([, v]) => v === "no")
      .map(([k]) => k.replace(/_/g, " "));
    const exam = examReasoningTokens(examFindings);
    return liveReasoningForCodes(REASONING_MAPS, pcCodes, {
      features,
      positives: [
        ...ros.filter((o) => o.status === "present").map((o) => o.symptomDisplay),
        ...fhYes,
        ...exam.positives,
      ],
      negatives: [
        ...ros.filter((o) => o.status === "denies").map((o) => o.symptomDisplay),
        ...fhNo,
        ...exam.negatives,
      ],
      history: [...pmhConditions, ...fhYes, ...socialTokens(social)],
    });
  }, [pcCodes, hpcItems, ros, pmhConditions, fhScreen, social, examFindings]);

  const fired = r.basis.length > 0;
  const mnmCount = r.scored.filter((d) => d.likelihood === "must_not_miss").length;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-border bg-card inline-flex w-full items-center gap-1.5 rounded-2xl border px-3.5 py-2.5 text-[12px] font-medium text-teal-700 shadow-sm xl:sticky xl:top-20 dark:text-teal-300"
      >
        <BrainCircuitIcon className="size-4" aria-hidden />
        Clinical reasoning
        {mnmCount ? (
          <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            {mnmCount}
          </span>
        ) : null}
        <span className="text-muted-foreground ml-auto text-[10px]">show</span>
      </button>
    );
  }

  return (
    <aside className="border-border bg-card flex flex-col overflow-hidden rounded-2xl border shadow-sm xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)]">
      <div className="border-border/60 flex items-center gap-2 border-b px-3.5 py-2.5">
        <BrainCircuitIcon
          className="size-4 shrink-0 text-teal-600 dark:text-teal-400"
          aria-hidden
        />
        <span className="text-foreground text-[13px] font-semibold">Clinical reasoning</span>
        {mnmCount ? (
          <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <ShieldAlertIcon className="size-3" aria-hidden />
            {mnmCount}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-muted-foreground hover:text-foreground ml-auto"
          aria-label="Collapse reasoning panel"
        >
          <XIcon className="size-4" />
        </button>
      </div>

      <div className="flex flex-col gap-3 overflow-y-auto px-3.5 py-3">
        {!fired ? (
          <p className="text-muted-foreground text-[12px]">
            Add a presenting complaint — the differential, the must-not-miss, and the discriminators
            will appear here and narrow as you capture features.
          </p>
        ) : (
          <>
            <p className="text-muted-foreground text-[10.5px]">
              Decision support — broadens + narrows the differential as you work. You decide;
              nothing is recorded until you enter it.
            </p>

            {r.knownDiseaseTraps.map((t, i) => (
              <div
                key={i}
                className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11.5px] text-amber-900 ring-1 ring-amber-500/30 ring-inset dark:bg-amber-950/30 dark:text-amber-200"
              >
                <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>{t}</span>
              </div>
            ))}

            <Section title="Differential — live">
              <div className="flex flex-col gap-1">
                {r.scored.map((d) => (
                  <DxRow key={d.dx} d={d} />
                ))}
              </div>
            </Section>

            {r.toAsk.length ? (
              <Section title="Ask / examine next — to discriminate">
                <ChipList items={r.toAsk.slice(0, 12)} tone="neutral" />
              </Section>
            ) : null}

            {r.redFlags.length ? (
              <Section title="Red flags — re-check" tone="amber">
                <ChipList items={r.redFlags} tone="amber" />
              </Section>
            ) : null}

            {r.riskFactorsPresent.length ? (
              <Section title="Risk factors present">
                <ChipList items={r.riskFactorsPresent} tone="teal" />
              </Section>
            ) : null}
            {r.riskFactorsToCheck.length ? (
              <Section title="Risk factors to check">
                <ChipList items={r.riskFactorsToCheck.slice(0, 8)} tone="muted" />
              </Section>
            ) : null}

            <div
              className={atSynthesis ? "rounded-lg bg-teal-50/60 p-2.5 dark:bg-teal-950/20" : ""}
            >
              <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-teal-700 dark:text-teal-300">
                <PauseCircleIcon className="size-3.5" aria-hidden />
                Diagnostic pause {atSynthesis ? "(before you close)" : ""}
              </span>
              {atSynthesis ? (
                <ul className="text-muted-foreground mt-1 flex list-disc flex-col gap-0.5 pl-5 text-[11px]">
                  {diagnosticPausePrompts().map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              ) : null}
            </div>

            <p className="text-muted-foreground border-border/40 border-t pt-2 text-[10px]">
              From {r.basis.join(", ")}.
            </p>
          </>
        )}
      </div>
    </aside>
  );
}

function ChipList({
  items,
  tone,
}: {
  items: string[];
  tone: "amber" | "teal" | "muted" | "neutral";
}) {
  const cls =
    tone === "amber"
      ? "bg-amber-50 text-amber-800 ring-amber-500/25 dark:bg-amber-950/30 dark:text-amber-300"
      : tone === "teal"
        ? "bg-teal-50 text-teal-700 ring-teal-500/25 dark:bg-teal-950/30 dark:text-teal-300"
        : tone === "muted"
          ? "bg-muted/50 text-muted-foreground ring-border"
          : "bg-muted/60 text-foreground/75 ring-border";
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((x, i) => (
        <span
          key={i}
          className={`rounded-md px-1.5 py-0.5 text-[11px] leading-tight ring-1 ring-inset ${cls}`}
        >
          {x}
        </span>
      ))}
    </div>
  );
}

function Section({
  title,
  tone,
  children,
}: {
  title: string;
  tone?: "amber";
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className={`text-[10px] font-medium tracking-[0.1em] uppercase ${tone === "amber" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}
      >
        {title}
      </span>
      {children}
    </div>
  );
}

function DxRow({ d }: { d: ScoredDifferential }) {
  const [open, setOpen] = useState(false);
  const mnm = d.likelihood === "must_not_miss";
  const Icon =
    d.status === "supported" ? ArrowUpIcon : d.status === "lowered" ? ArrowDownIcon : MinusIcon;
  const iconColor =
    d.status === "supported"
      ? "text-teal-600 dark:text-teal-400"
      : d.status === "lowered"
        ? "text-muted-foreground/60"
        : "text-muted-foreground";
  const supportIn = [...d.matchedRuleIn, ...d.supportPresent, ...d.riskPresent];
  const against = [...d.matchedRuleOut, ...d.supportDenied, ...d.refutePresent];
  const hasDetail = supportIn.length + against.length > 0;
  // small inline count of confirming cross-system findings present
  const crossN = d.supportPresent.length;
  return (
    <div className={`rounded-md px-2 py-1 ${d.status === "lowered" ? "opacity-55" : ""}`}>
      <button
        type="button"
        onClick={() => hasDetail && setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 text-left"
      >
        <Icon className={`size-3.5 shrink-0 ${iconColor}`} aria-hidden />
        <span className="text-foreground min-w-0 flex-1 truncate text-[12px]">{d.dx}</span>
        {crossN ? (
          <span className="shrink-0 rounded bg-teal-100 px-1 text-[9px] font-semibold text-teal-800 dark:bg-teal-950/40 dark:text-teal-300">
            +{crossN}
          </span>
        ) : null}
        {mnm ? (
          <span className="shrink-0 rounded bg-amber-100 px-1 text-[9px] font-semibold tracking-wide text-amber-800 uppercase dark:bg-amber-950/40 dark:text-amber-300">
            must not miss
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="mt-0.5 flex flex-col gap-0.5 pl-5 text-[10.5px] leading-snug">
          {d.matchedRuleIn.length ? (
            <p className="text-teal-700 dark:text-teal-400">+ {d.matchedRuleIn.join(", ")}</p>
          ) : null}
          {d.supportPresent.length ? (
            <p className="text-teal-700 dark:text-teal-400">
              ✓ supports (other systems): {d.supportPresent.join(", ")}
            </p>
          ) : null}
          {d.riskPresent.length ? (
            <p className="text-teal-700/80 dark:text-teal-400/80">
              risk: {d.riskPresent.join(", ")}
            </p>
          ) : null}
          {d.matchedRuleOut.length ? (
            <p className="text-muted-foreground">− {d.matchedRuleOut.join(", ")}</p>
          ) : null}
          {d.supportDenied.length ? (
            <p className="text-muted-foreground line-through decoration-1">
              {d.supportDenied.join(", ")} (denied)
            </p>
          ) : null}
          {d.refutePresent.length ? (
            <p className="text-amber-700 dark:text-amber-400">
              ▼ against: {d.refutePresent.join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
