"use client";

import type { PrescribeAuthority } from "./prescribe-dialog";
import type { CirculationActionState, CirculationFindingSet } from "@/lib/resus/circulation";
import type { CirculatoryState } from "@/lib/resus/reference/circulation-catalog";
import type { TimelineEvent } from "@/lib/resus/types";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import {
  CheckIcon,
  CircleDotIcon,
  LoaderCircleIcon,
  MinusIcon,
  PauseIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { RECOMMENDATION_DRUG_MAP } from "@/lib/prescribing/reference/emergency-drug-catalog";
import {
  buildCirculationActions,
  circulationProceedGuard,
  classifyCirculation,
  escalationFor,
  identifyShockType,
  isCirculationArrest,
  latestCirculationAssessment,
  triggeredActions,
} from "@/lib/resus/circulation";
import {
  CIRCULATION_FEEL,
  CIRCULATION_LOOK,
  CIRCULATION_MEASURE,
  circulationAction,
  CIRCULATORY_STATE_LABEL,
  CIRCULATORY_STATES,
  SHOCK_TYPE_LABEL,
  SHOCK_TYPE_STRATEGY,
} from "@/lib/resus/reference/circulation-catalog";
import { cn } from "@/lib/utils";
import {
  detectResusArrestAction,
  recordCirculationFindings,
  setCirculationActionState,
} from "../../actions";
import { PrescribeDialog } from "./prescribe-dialog";

const PRESCRIBABLE = new Set(Object.keys(RECOMMENDATION_DRUG_MAP));

const STATE_TONE: Record<string, string> = {
  well_perfused:
    "border-teal-300/70 bg-teal-50/60 text-teal-700 dark:bg-teal-950/25 dark:text-teal-200",
  compensated_shock:
    "border-amber-300/70 bg-amber-50/60 text-amber-800 dark:bg-amber-950/25 dark:text-amber-200",
  decompensated_shock:
    "border-orange-400/70 bg-orange-50/60 text-orange-700 dark:bg-orange-950/25 dark:text-orange-200",
  peri_arrest:
    "border-rose-500/80 bg-rose-50/70 text-rose-700 ring-1 ring-rose-500/40 motion-safe:animate-pulse dark:bg-rose-950/30 dark:text-rose-200",
  arrest: "border-rose-600 bg-rose-600 text-white motion-safe:animate-pulse",
  unknown: "border-border bg-muted/30 text-muted-foreground",
};

const STATE_SHORT: Record<string, string> = {
  well_perfused: "Well perfused",
  compensated_shock: "Compensated shock",
  decompensated_shock: "Decompensated shock",
  peri_arrest: "Peri-arrest collapse",
  arrest: "Arrest",
  unknown: "Not yet assessed",
};

const ACTION_STATE_STYLE: Record<
  CirculationActionState,
  { label: string; short: string; token: string; icon: LucideIcon }
> = {
  indicated: {
    label: "Indicated",
    short: "Indicated",
    token: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    icon: CircleDotIcon,
  },
  in_progress: {
    label: "In progress",
    short: "Doing",
    token:
      "bg-blue-100 text-blue-800 motion-safe:animate-pulse dark:bg-blue-900/40 dark:text-blue-200",
    icon: LoaderCircleIcon,
  },
  performed: {
    label: "Performed",
    short: "Done",
    token: "bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200",
    icon: CheckIcon,
  },
  failed: {
    label: "Failed",
    short: "Failed",
    token: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-200",
    icon: TriangleAlertIcon,
  },
  deferred: {
    label: "Deferred",
    short: "Defer",
    token: "bg-muted text-muted-foreground",
    icon: PauseIcon,
  },
  not_indicated: {
    label: "Not indicated",
    short: "N/A",
    token: "border border-border text-muted-foreground/70",
    icon: MinusIcon,
  },
};

const SETTABLE_STATES: CirculationActionState[] = [
  "in_progress",
  "performed",
  "failed",
  "deferred",
  "not_indicated",
];

export function CirculationPanel({
  episodeId,
  timeline,
  active,
  patientAgeYears,
  prescribeAuthority,
  onChanged,
}: {
  episodeId: string;
  timeline: TimelineEvent[];
  active: boolean;
  patientAgeYears: number | null;
  prescribeAuthority: PrescribeAuthority;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [prescribeFor, setPrescribeFor] = useState<{ code: string; label: string } | null>(null);

  const seeded = useMemo(() => latestCirculationAssessment(timeline), [timeline]);
  const [headline, setHeadline] = useState<CirculatoryState | null>(seeded?.state ?? null);
  const [present, setPresent] = useState<string[]>(seeded?.present ?? []);
  const [ctx, setCtx] = useState<CirculationFindingSet["context"]>(seeded?.context ?? {});

  const draft: CirculationFindingSet = { state: headline, present, context: ctx };
  const state = classifyCirculation(draft);
  const shockType = identifyShockType(draft);
  const triggered = triggeredActions(draft);
  const arrest = isCirculationArrest(draft);
  const guard = circulationProceedGuard(state);

  const recorded = useMemo(() => buildCirculationActions(timeline), [timeline]);
  const recordedByCode = useMemo(() => new Map(recorded.map((a) => [a.actionCode, a])), [recorded]);

  // Reassess-after-bolus nudge: an action recorded after the last finding-set.
  const reassessDue = useMemo(() => {
    const cEvents = timeline.filter((e) => e.step === "C");
    const lastFinding = cEvents
      .filter((e) => e.kind === "assessment")
      .reduce<string | null>((m, e) => (m === null || e.recordedAt > m ? e.recordedAt : m), null);
    const lastAction = cEvents
      .filter((e) => ["action", "drug", "fluid", "procedure"].includes(e.kind))
      .reduce<string | null>((m, e) => (m === null || e.recordedAt > m ? e.recordedAt : m), null);
    return lastAction !== null && (lastFinding === null || lastAction > lastFinding);
  }, [timeline]);

  function toggle(code: string) {
    setPresent((list) => (list.includes(code) ? list.filter((c) => c !== code) : [...list, code]));
  }

  function recordFindings() {
    if (!active) return;
    startTransition(async () => {
      await recordCirculationFindings({ episodeId, findingSet: draft });
      onChanged();
    });
  }

  function setActionState(code: string, s: CirculationActionState) {
    if (!active) return;
    startTransition(async () => {
      await setCirculationActionState({ episodeId, actionId: code, actionCode: code, state: s });
      onChanged();
    });
  }

  function declareArrest() {
    if (!active) return;
    startTransition(async () => {
      await detectResusArrestAction({
        episodeId,
        responsive: false,
        breathingNormally: false,
        centralPulse: false,
      });
      onChanged();
    });
  }

  const shownCodes = new Set(triggered.map((t) => t.code));
  const extraRecorded = recorded.filter((a) => !shownCodes.has(a.actionCode));

  return (
    <div className="border-border bg-card flex flex-col gap-3 rounded-2xl border p-4">
      {/* Header + circulatory-state indicator */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="bg-foreground/90 text-background flex size-8 items-center justify-center rounded-lg font-mono text-[15px] font-semibold">
            C
          </span>
          <h2 className="font-display text-foreground text-[18px] font-medium tracking-[-0.01em]">
            Circulation
          </h2>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold",
            STATE_TONE[state ?? "unknown"],
          )}
        >
          {(state === "decompensated_shock" || state === "peri_arrest" || state === "arrest") && (
            <span aria-hidden>▲</span>
          )}
          {STATE_SHORT[state ?? "unknown"]}
        </span>
      </div>

      {/* SHOCK-TYPE indicator — the distinctive C element (type drives strategy) */}
      {shockType ? (
        <div className="rounded-lg border border-rose-400/50 bg-rose-50/40 px-3 py-2 dark:border-rose-500/30 dark:bg-rose-950/15">
          <p className="text-[12.5px] font-semibold text-rose-800 dark:text-rose-200">
            Shock type: {SHOCK_TYPE_LABEL[shockType]}
          </p>
          <p className="text-muted-foreground text-[11px]">{SHOCK_TYPE_STRATEGY[shockType]}</p>
        </div>
      ) : null}

      {/* Treat-before-proceeding / open-threat indicator */}
      <div
        className={cn(
          "rounded-lg border px-3 py-1.5 text-[11.5px]",
          guard.ok
            ? "border-teal-300/60 bg-teal-50/50 text-teal-700 dark:bg-teal-950/20 dark:text-teal-200"
            : "border-amber-300/70 bg-amber-50/60 text-amber-800 dark:bg-amber-950/20 dark:text-amber-200",
        )}
      >
        {guard.ok ? "✓ Circulation stable — safe to proceed to D." : `⚠ ${guard.warning}`}
      </div>

      {/* Arrest route — no pulse */}
      {arrest ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-rose-600 bg-rose-600 px-3 py-2 text-white">
          <p className="text-[12.5px] font-bold">⚠ No pulse — cardiac arrest.</p>
          <button
            type="button"
            disabled={!active || pending}
            onClick={declareArrest}
            className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-[12px] font-bold text-rose-700 transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Start CPR → ALS
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start">
        {/* ── Findings capture ── */}
        <section className="flex flex-col gap-2.5">
          <h3 className="text-muted-foreground font-mono text-[10px] tracking-[0.14em] uppercase">
            Findings — circulatory state
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {CIRCULATORY_STATES.filter((s) => s !== "arrest").map((s) => (
              <button
                key={s}
                type="button"
                disabled={!active}
                onClick={() => setHeadline(headline === s ? null : s)}
                className={cn(
                  "rounded-lg border px-2.5 py-1.5 text-left text-[11.5px] transition-colors disabled:opacity-50",
                  headline === s
                    ? "border-foreground/30 bg-foreground/90 text-background font-medium"
                    : "border-border bg-muted/30 text-foreground/80 hover:bg-muted/60",
                )}
              >
                {CIRCULATORY_STATE_LABEL[s]}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <ContextToggle
              label="Trauma"
              on={!!ctx.trauma}
              disabled={!active}
              onClick={() => setCtx({ ...ctx, trauma: !ctx.trauma })}
            />
            <ContextToggle
              label="Active bleeding"
              on={!!ctx.activeBleeding}
              disabled={!active}
              onClick={() => setCtx({ ...ctx, activeBleeding: !ctx.activeBleeding })}
            />
            <ContextToggle
              label="Febrile child (FEAST)"
              on={!!ctx.febrileChild}
              disabled={!active}
              onClick={() => setCtx({ ...ctx, febrileChild: !ctx.febrileChild })}
            />
            <ContextToggle
              label="Pregnancy possible"
              on={!!ctx.pregnancyPossible}
              disabled={!active}
              onClick={() => setCtx({ ...ctx, pregnancyPossible: !ctx.pregnancyPossible })}
            />
            <ContextToggle
              label="Spinal injury"
              on={!!ctx.spinalInjury}
              disabled={!active}
              onClick={() => setCtx({ ...ctx, spinalInjury: !ctx.spinalInjury })}
            />
            <ContextToggle
              label="Allergen trigger"
              on={!!ctx.allergenTrigger}
              disabled={!active}
              onClick={() => setCtx({ ...ctx, allergenTrigger: !ctx.allergenTrigger })}
            />
            <ContextToggle
              label="Head injury / TBI"
              on={!!ctx.headInjury}
              disabled={!active}
              onClick={() => setCtx({ ...ctx, headInjury: !ctx.headInjury })}
            />
            <ContextToggle
              label="No pulse"
              danger
              on={!!ctx.noPulse}
              disabled={!active}
              onClick={() => setCtx({ ...ctx, noPulse: !ctx.noPulse })}
            />
          </div>

          <FindingGroup
            title="Look"
            findings={CIRCULATION_LOOK}
            present={present}
            disabled={!active}
            onToggle={toggle}
          />
          <FindingGroup
            title="Feel"
            findings={CIRCULATION_FEEL}
            present={present}
            disabled={!active}
            onToggle={toggle}
          />
          <FindingGroup
            title="Measure (banded)"
            findings={CIRCULATION_MEASURE}
            present={present}
            disabled={!active}
            onToggle={toggle}
          />

          <button
            type="button"
            disabled={!active || pending}
            onClick={recordFindings}
            className="mt-1 self-start rounded-lg bg-teal-600 px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
          >
            {reassessDue ? "↻ Re-record circulation findings" : "Record circulation findings"}
          </button>
        </section>

        {/* ── Triggered actions (urgency order; drug actions → prescribe tool) ── */}
        <section className="border-border bg-card/95 lg:ring-border/50 flex flex-col gap-2 rounded-xl border p-3 lg:sticky lg:top-30 lg:max-h-[calc(100svh-136px)] lg:overflow-y-auto lg:shadow-md lg:ring-1 lg:backdrop-blur">
          <h3 className="text-muted-foreground font-mono text-[10px] tracking-[0.14em] uppercase">
            Indicated actions — finding → type → do
          </h3>
          {triggered.length === 0 ? (
            <p className="text-muted-foreground/70 border-border/70 bg-muted/20 rounded-lg border border-dashed px-3 py-4 text-center text-[11.5px]">
              {arrest
                ? "Arrest pathway — start CPR."
                : "Record findings to see the matched actions appear here."}
            </p>
          ) : (
            triggered.map((t) => (
              <ActionCard
                key={t.code}
                code={t.code}
                rationale={t.rationale}
                emergency={t.emergency}
                currentState={recordedByCode.get(t.code)?.state}
                disabled={!active || pending}
                onSetState={setActionState}
                prescribable={PRESCRIBABLE.has(t.code)}
                onPrescribe={() =>
                  setPrescribeFor({
                    code: t.code,
                    label: circulationAction(t.code)?.label ?? t.code,
                  })
                }
              />
            ))
          )}

          {extraRecorded.length > 0 ? (
            <>
              <h3 className="text-muted-foreground mt-1 font-mono text-[10px] tracking-[0.14em] uppercase">
                Also recorded
              </h3>
              {extraRecorded.map((a) => (
                <ActionCard
                  key={a.actionCode}
                  code={a.actionCode}
                  rationale=""
                  emergency={circulationAction(a.actionCode)?.emergency ?? false}
                  currentState={a.state}
                  disabled={!active || pending}
                  onSetState={setActionState}
                  prescribable={PRESCRIBABLE.has(a.actionCode)}
                  onPrescribe={() =>
                    setPrescribeFor({
                      code: a.actionCode,
                      label: circulationAction(a.actionCode)?.label ?? a.actionCode,
                    })
                  }
                />
              ))}
            </>
          ) : null}
        </section>
      </div>

      {prescribeFor ? (
        <PrescribeDialog
          episodeId={episodeId}
          recCode={prescribeFor.code}
          recLabel={prescribeFor.label}
          patientAgeYears={patientAgeYears}
          prescribeAuthority={prescribeAuthority}
          timeline={timeline}
          onClose={() => setPrescribeFor(null)}
          onDone={onChanged}
        />
      ) : null}
    </div>
  );
}

function ContextToggle({
  label,
  on,
  danger,
  disabled,
  onClick,
}: {
  label: string;
  on: boolean;
  danger?: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11px] transition-colors disabled:opacity-50",
        on
          ? danger
            ? "border-rose-500/70 bg-rose-50/70 text-rose-700 dark:bg-rose-950/30 dark:text-rose-200"
            : "border-foreground/30 bg-foreground/85 text-background"
          : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60",
      )}
    >
      {on ? "✓ " : ""}
      {label}
    </button>
  );
}

function FindingGroup({
  title,
  findings,
  present,
  disabled,
  onToggle,
}: {
  title: string;
  findings: { code: string; label: string; meaning: string }[];
  present: string[];
  disabled: boolean;
  onToggle: (code: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-muted-foreground font-mono text-[10px] tracking-[0.14em] uppercase">
        {title}
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {findings.map((f) => {
          const on = present.includes(f.code);
          return (
            <button
              key={f.code}
              type="button"
              disabled={disabled}
              title={f.meaning}
              onClick={() => onToggle(f.code)}
              className={cn(
                "rounded-lg border px-2 py-1 text-[11px] transition-colors disabled:opacity-50",
                on
                  ? "border-teal-400/70 bg-teal-50/70 text-teal-800 dark:border-teal-500/40 dark:bg-teal-950/25 dark:text-teal-200"
                  : "border-border bg-muted/30 text-foreground/70 hover:bg-muted/60",
              )}
            >
              {f.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ActionCard({
  code,
  rationale,
  emergency,
  currentState,
  disabled,
  onSetState,
  prescribable,
  onPrescribe,
}: {
  code: string;
  rationale: string;
  emergency: boolean;
  currentState?: CirculationActionState;
  disabled: boolean;
  onSetState: (code: string, s: CirculationActionState) => void;
  prescribable?: boolean;
  onPrescribe?: () => void;
}) {
  const action = circulationAction(code);
  const failed = currentState === "failed";
  const escalation = failed ? escalationFor(code) : null;
  const escAction = escalation ? circulationAction(escalation) : null;

  const effective: CirculationActionState = currentState ?? "indicated";
  const style = ACTION_STATE_STYLE[effective];
  const StateIcon = style.icon;
  const cardTint =
    currentState === "failed"
      ? "border-rose-400/60 bg-rose-50/40 dark:bg-rose-950/15"
      : currentState === "in_progress"
        ? "border-blue-300/60 bg-blue-50/40 dark:bg-blue-950/15"
        : currentState === "performed"
          ? "border-teal-300/60 bg-teal-50/30 dark:bg-teal-950/15"
          : currentState === "deferred" || currentState === "not_indicated"
            ? "border-border"
            : emergency
              ? "border-rose-400/60"
              : "border-amber-300/55 bg-amber-50/25 dark:border-amber-500/30 dark:bg-amber-950/10";

  return (
    <div
      className={cn(
        "bg-card rounded-lg border px-2.5 py-2",
        cardTint,
        currentState === "performed" ? "opacity-75" : "",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-foreground/90 flex items-center gap-1.5 text-[12.5px] font-medium">
            {emergency ? (
              <span aria-hidden className="text-rose-600">
                ▲
              </span>
            ) : null}
            <span>{action?.label ?? code}</span>
            <span className="text-muted-foreground/60 font-mono text-[9px] tracking-[0.1em] uppercase">
              T{action?.tier}
            </span>
          </p>
          {rationale ? <p className="text-muted-foreground text-[10.5px]">{rationale}</p> : null}
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold",
            style.token,
          )}
        >
          <StateIcon className="size-3" aria-hidden />
          {style.label}
        </span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {SETTABLE_STATES.map((s) => {
          const sStyle = ACTION_STATE_STYLE[s];
          const SIcon = sStyle.icon;
          const isCurrent = currentState === s;
          return (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={() => onSetState(code, s)}
              aria-pressed={isCurrent}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] transition-colors disabled:opacity-40",
                isCurrent
                  ? cn(sStyle.token, "ring-foreground/15 border-transparent font-semibold ring-1")
                  : "border-border text-muted-foreground hover:bg-muted/50",
              )}
            >
              <SIcon className="size-3" aria-hidden />
              {sStyle.short}
            </button>
          );
        })}
        {prescribable && onPrescribe ? (
          <button
            type="button"
            disabled={disabled}
            onClick={onPrescribe}
            className="ml-auto inline-flex items-center gap-1 rounded-md bg-teal-600 px-2 py-0.5 text-[10.5px] font-semibold text-white transition-colors hover:bg-teal-700 disabled:opacity-40"
          >
            Prescribe / record
          </button>
        ) : null}
      </div>

      {failed && escAction ? (
        <div className="mt-1.5 flex items-center justify-between gap-2 rounded-md border border-rose-400/50 bg-rose-50/50 px-2 py-1 dark:bg-rose-950/20">
          <span className="text-[10.5px] font-medium text-rose-700 dark:text-rose-200">
            Failed → escalate: {escAction.label}
          </span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSetState(escAction.code, "in_progress")}
            className="shrink-0 rounded-md bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white disabled:opacity-50"
            title={`Start ${escAction.label}`}
          >
            Escalate
          </button>
        </div>
      ) : null}
    </div>
  );
}
