"use client";

import type { AbdoExam } from "@/lib/clerkship/exam/abdominal";
import type { CvsExam } from "@/lib/clerkship/exam/cardiovascular";
import type { EvfExam } from "@/lib/clerkship/exam/endo-vascular-foot";
import type { MskExam } from "@/lib/clerkship/exam/musculoskeletal";
import type { NeuroExam } from "@/lib/clerkship/exam/neurological";
import type { RespExam } from "@/lib/clerkship/exam/respiratory";
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

import { abdoReasoningTokens, renderAbdoProse } from "@/lib/clerkship/exam/abdominal";
import { cvsReasoningTokens, renderCvsProse } from "@/lib/clerkship/exam/cardiovascular";
import { evfReasoningTokens, renderEvfProse } from "@/lib/clerkship/exam/endo-vascular-foot";
import { examReasoningTokens, renderExamProse } from "@/lib/clerkship/exam/engine";
import { mskReasoningTokens, renderMskProse } from "@/lib/clerkship/exam/musculoskeletal";
import { neuroReasoningTokens, renderNeuroProse } from "@/lib/clerkship/exam/neurological";
import { renderRespProse, respReasoningTokens } from "@/lib/clerkship/exam/respiratory";
import { diagnosticPausePrompts, liveReasoningForCodes } from "@/lib/clerkship/reasoning/engine";
import { REASONING_MAPS } from "@/lib/clerkship/reasoning/maps";

/**
 * Clinical reasoning — a LIVE, anti-anchoring panel. In the full-bleed encounter
 * workspace it docks as its own right-hand rail (stacks below the form on narrow
 * screens); it can also be hosted in a drawer (pass onClose). As the clinician
 * taps symptom properties / ROS / history / exam findings, the
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
  respiratory,
  cardiovascular,
  abdominal,
  neurological,
  musculoskeletal,
  endoVascularFoot,
  atSynthesis,
  onClose,
}: {
  pcCodes: string[];
  hpcItems: CapturedSymptom[];
  ros: RosObservation[];
  pmhConditions: string[];
  fhScreen: Record<string, "yes" | "no" | "unsure">;
  social: ClerkSocial;
  examFindings: ExamObservation[];
  respiratory: RespExam;
  cardiovascular: CvsExam;
  abdominal: AbdoExam;
  neurological: NeuroExam;
  musculoskeletal: MskExam;
  endoVascularFoot: EvfExam;
  atSynthesis: boolean;
  /** When hosted in a drawer, renders a close button; omit when docked as a rail. */
  onClose?: () => void;
}) {
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
    const resp = respReasoningTokens(respiratory);
    const cvs = cvsReasoningTokens(cardiovascular);
    const abdo = abdoReasoningTokens(abdominal);
    const neuro = neuroReasoningTokens(neurological);
    const msk = mskReasoningTokens(musculoskeletal);
    const evf = evfReasoningTokens(endoVascularFoot);
    return liveReasoningForCodes(REASONING_MAPS, pcCodes, {
      features,
      positives: [
        ...ros.filter((o) => o.status === "present").map((o) => o.symptomDisplay),
        ...fhYes,
        ...exam.positives,
        ...resp.positives,
        ...cvs.positives,
        ...abdo.positives,
        ...neuro.positives,
        ...msk.positives,
        ...evf.positives,
      ],
      negatives: [
        ...ros.filter((o) => o.status === "denies").map((o) => o.symptomDisplay),
        ...fhNo,
        ...exam.negatives,
      ],
      history: [...pmhConditions, ...fhYes, ...socialTokens(social)],
    });
  }, [
    pcCodes,
    hpcItems,
    ros,
    pmhConditions,
    fhScreen,
    social,
    examFindings,
    respiratory,
    cardiovascular,
    abdominal,
    neurological,
    musculoskeletal,
    endoVascularFoot,
  ]);

  const fired = r.basis.length > 0;
  const mnmCount = r.scored.filter((d) => d.likelihood === "must_not_miss").length;

  // Always-alive: even before a complaint pins the differential, surface what the
  // clinician has already recorded so the rail is never dead space. Each entry is
  // a per-system auto-summary (empty string ⇒ that system has nothing recorded —
  // honestly omitted, NOT shown as "normal").
  const examSummary = useMemo(
    () =>
      (
        [
          ["General", renderExamProse(examFindings)],
          ["Respiratory", renderRespProse(respiratory)],
          ["Cardiovascular", renderCvsProse(cardiovascular)],
          ["Abdominal", renderAbdoProse(abdominal)],
          ["Neurological", renderNeuroProse(neurological)],
          ["Musculoskeletal", renderMskProse(musculoskeletal)],
          ["Endocrine / vascular / foot", renderEvfProse(endoVascularFoot)],
        ] as const
      ).filter(([, prose]) => prose.trim().length > 0),
    [
      examFindings,
      respiratory,
      cardiovascular,
      abdominal,
      neurological,
      musculoskeletal,
      endoVascularFoot,
    ],
  );

  return (
    <div className="bg-card flex h-full min-h-0 flex-col overflow-hidden">
      <div className="border-border/60 flex items-center gap-2 border-b px-3.5 py-3">
        <BrainCircuitIcon
          className="size-4 shrink-0 text-teal-600 dark:text-teal-400"
          aria-hidden
        />
        <span className="text-foreground text-[13px] font-semibold">Clinical reasoning</span>
        {mnmCount ? (
          <span
            key={mnmCount}
            className="scale-in inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 tabular-nums dark:bg-amber-950/40 dark:text-amber-300"
          >
            <ShieldAlertIcon className="size-3" aria-hidden />
            {mnmCount}
          </span>
        ) : null}
        {fired ? (
          <span className="text-muted-foreground ml-auto inline-flex items-center gap-1.5 font-mono text-[9.5px] tracking-[0.14em] uppercase">
            <span aria-hidden className="pulse-dot size-1.5 rounded-full bg-teal-500" />
            live
          </span>
        ) : null}
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className={`tap text-muted-foreground hover:text-foreground rounded-md p-0.5 transition-colors ${fired ? "" : "ml-auto"}`}
            aria-label="Close reasoning panel"
          >
            <XIcon className="size-4" />
          </button>
        ) : null}
      </div>

      <div className="stagger-children flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3.5 py-3">
        {!fired ? (
          <div className="flex flex-col gap-3">
            {/* Quiet differential-tree glyph — one stem branching to plural possibilities */}
            <div className="flex flex-col items-center gap-2.5 px-2 pt-4 text-center">
              <svg
                width="88"
                height="56"
                viewBox="0 0 88 56"
                fill="none"
                aria-hidden
                className="text-gray-300 dark:text-gray-700"
              >
                <circle cx="11" cy="28" r="3" fill="currentColor" />
                <path d="M14 28h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path
                  d="M32 28c9 0 7-14 16-14h11"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeDasharray="3 4"
                />
                <path
                  d="M32 28h27"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeDasharray="3 4"
                />
                <path
                  d="M32 28c9 0 7 14 16 14h11"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeDasharray="3 4"
                />
                <circle cx="66" cy="14" r="3" fill="currentColor" />
                <circle cx="66" cy="28" r="3" className="fill-teal-500/70" />
                <circle cx="66" cy="42" r="3" fill="currentColor" />
              </svg>
              <p className="text-muted-foreground text-[12px]">
                Add a presenting complaint — the differential, the must-not-miss, and the
                discriminators will appear here and narrow as you capture features.
              </p>
            </div>

            {/* Always-alive: live exam summary while the differential is still dormant */}
            {examSummary.length ? (
              <div className="fade-in-slow border-border/60 flex flex-col gap-2 border-t pt-3">
                <span className="text-muted-foreground inline-flex items-center gap-1.5 text-[10px] font-medium tracking-wide uppercase">
                  <span aria-hidden className="pulse-dot size-1.5 rounded-full bg-teal-500" />
                  Examination so far
                </span>
                {examSummary.map(([label, prose]) => (
                  <div key={label} className="flex flex-col gap-0.5">
                    <span className="text-foreground text-[11px] font-semibold">{label}</span>
                    <p className="text-muted-foreground text-[11.5px] leading-relaxed">{prose}</p>
                  </div>
                ))}
                <span className="text-muted-foreground/70 text-[10px] italic">
                  Recorded findings only — systems you haven&apos;t examined are omitted, not
                  assumed normal.
                </span>
              </div>
            ) : null}
          </div>
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
              className={`transition-colors duration-300 ${atSynthesis ? "rounded-lg bg-teal-50/60 p-2.5 dark:bg-teal-950/20" : ""}`}
            >
              <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-teal-700 dark:text-teal-300">
                <PauseCircleIcon className="size-3.5" aria-hidden />
                Diagnostic pause {atSynthesis ? "(before you close)" : ""}
              </span>
              {atSynthesis ? (
                <ul className="text-muted-foreground reveal-up mt-1 flex list-disc flex-col gap-0.5 pl-5 text-[11px]">
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
    </div>
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
    <div
      className={`hover:bg-muted/40 rounded-md px-2 py-1 transition-[background-color,opacity] duration-200 ${d.status === "lowered" ? "opacity-55" : ""}`}
    >
      <button
        type="button"
        onClick={() => hasDetail && setOpen((o) => !o)}
        className={`flex w-full items-center gap-1.5 text-left ${hasDetail ? "tap" : ""}`}
      >
        <Icon className={`size-3.5 shrink-0 ${iconColor}`} aria-hidden />
        <span className="text-foreground min-w-0 flex-1 truncate text-[12px]">{d.dx}</span>
        {crossN ? (
          <span className="shrink-0 rounded bg-teal-100 px-1 text-[9px] font-semibold text-teal-800 dark:bg-teal-950/40 dark:text-teal-300">
            +{crossN}
          </span>
        ) : null}
        {mnm ? (
          <span className="scale-in shrink-0 rounded bg-amber-100 px-1 text-[9px] font-semibold tracking-wide text-amber-800 uppercase dark:bg-amber-950/40 dark:text-amber-300">
            must not miss
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="reveal-up mt-0.5 flex flex-col gap-0.5 pl-5 text-[10.5px] leading-snug">
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
