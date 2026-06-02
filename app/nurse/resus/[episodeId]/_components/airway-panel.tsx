"use client";

import type { AirwayActionState, AirwayFindingSet } from "@/lib/resus/airway";
import type { AirwayPatency } from "@/lib/resus/reference/airway-catalog";
import type { ResusDoseId } from "@/lib/resus/reference/doses";
import type { TimelineEvent } from "@/lib/resus/types";
import { useMemo, useState, useTransition } from "react";

import {
  airwayProceedGuard,
  buildAirwayActions,
  classifyAirway,
  escalationFor,
  isArrestPattern,
  latestAirwayAssessment,
  triggeredActions,
} from "@/lib/resus/airway";
import {
  AIRWAY_DIFFICULTY,
  AIRWAY_FEEL,
  AIRWAY_LISTEN,
  AIRWAY_LOOK,
  AIRWAY_PATENCY,
  AIRWAY_PATENCY_LABEL,
  airwayAction,
} from "@/lib/resus/reference/airway-catalog";
import { getResusDose } from "@/lib/resus/reference/doses";
import { cn } from "@/lib/utils";
import { detectResusArrestAction, recordAirwayFindings, setAirwayActionState } from "../../actions";

const STATE_TONE: Record<string, string> = {
  secure: "border-teal-300/70 bg-teal-50/60 text-teal-700 dark:bg-teal-950/25 dark:text-teal-200",
  threatened:
    "border-amber-300/70 bg-amber-50/60 text-amber-800 dark:bg-amber-950/25 dark:text-amber-200",
  partially_obstructed:
    "border-orange-400/70 bg-orange-50/60 text-orange-700 dark:bg-orange-950/25 dark:text-orange-200",
  completely_obstructed:
    "border-rose-500/80 bg-rose-50/70 text-rose-700 ring-1 ring-rose-500/40 motion-safe:animate-pulse dark:bg-rose-950/30 dark:text-rose-200",
  apnoeic_ventilate:
    "border-rose-500/80 bg-rose-50/70 text-rose-700 ring-1 ring-rose-500/40 motion-safe:animate-pulse dark:bg-rose-950/30 dark:text-rose-200",
  apnoeic_arrest: "border-rose-600 bg-rose-600 text-white motion-safe:animate-pulse",
  unknown: "border-border bg-muted/30 text-muted-foreground",
};

const STATE_LABEL: Record<string, string> = {
  secure: "Secure",
  threatened: "Threatened",
  partially_obstructed: "Partially obstructed",
  completely_obstructed: "Completely obstructed",
  apnoeic_ventilate: "Apnoea — ventilate",
  apnoeic_arrest: "Apnoeic — arrest",
  unknown: "Not yet assessed",
};

const ACTION_STATES: { value: AirwayActionState; label: string }[] = [
  { value: "in_progress", label: "Doing" },
  { value: "performed", label: "Done" },
  { value: "failed", label: "Failed" },
  { value: "deferred", label: "Defer" },
  { value: "not_indicated", label: "N/A" },
];

export function AirwayPanel({
  episodeId,
  timeline,
  active,
  onChanged,
}: {
  episodeId: string;
  timeline: TimelineEvent[];
  active: boolean;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();

  // Working finding-set draft, seeded from the last recorded airway assessment.
  const seeded = useMemo(() => latestAirwayAssessment(timeline), [timeline]);
  const [patency, setPatency] = useState<AirwayPatency | null>(seeded?.patency ?? null);
  const [present, setPresent] = useState<string[]>(seeded?.present ?? []);
  const [difficulty, setDifficulty] = useState<string[]>(seeded?.difficulty ?? []);
  const [ctx, setCtx] = useState<AirwayFindingSet["context"]>(seeded?.context ?? {});

  const draft: AirwayFindingSet = { patency, present, difficulty, context: ctx };
  const state = classifyAirway(draft);
  const triggered = triggeredActions(draft);
  const arrest = isArrestPattern(draft);
  const guard = airwayProceedGuard(state);

  const recorded = useMemo(() => buildAirwayActions(timeline), [timeline]);
  const recordedByCode = useMemo(() => new Map(recorded.map((a) => [a.actionCode, a])), [recorded]);

  // Reassess nudge: an action recorded after the last finding-set.
  const reassessDue = useMemo(() => {
    const aEvents = timeline.filter((e) => e.step === "A");
    const lastFinding = aEvents
      .filter((e) => e.kind === "assessment")
      .reduce<string | null>((m, e) => (m === null || e.recordedAt > m ? e.recordedAt : m), null);
    const lastAction = aEvents
      .filter((e) => ["action", "drug", "procedure"].includes(e.kind))
      .reduce<string | null>((m, e) => (m === null || e.recordedAt > m ? e.recordedAt : m), null);
    return lastAction !== null && (lastFinding === null || lastAction > lastFinding);
  }, [timeline]);

  function toggle(list: string[], set: (v: string[]) => void, code: string) {
    set(list.includes(code) ? list.filter((c) => c !== code) : [...list, code]);
  }

  function recordFindings() {
    if (!active) return;
    startTransition(async () => {
      await recordAirwayFindings({ episodeId, findingSet: draft });
      onChanged();
    });
  }

  function setActionState(code: string, s: AirwayActionState) {
    if (!active) return;
    startTransition(async () => {
      await setAirwayActionState({ episodeId, actionId: code, actionCode: code, state: s });
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

  // Merge: triggered (indicated) actions + any recorded action not currently triggered.
  const shownCodes = new Set(triggered.map((t) => t.code));
  const extraRecorded = recorded.filter((a) => !shownCodes.has(a.actionCode));

  return (
    <div className="border-border bg-card flex flex-col gap-3 rounded-2xl border p-4">
      {/* Header + airway-state indicator */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="bg-foreground/90 text-background flex size-8 items-center justify-center rounded-lg font-mono text-[15px] font-semibold">
            A
          </span>
          <h2 className="font-display text-foreground text-[18px] font-medium tracking-[-0.01em]">
            Airway
          </h2>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold",
            STATE_TONE[state ?? "unknown"],
          )}
        >
          {(state === "completely_obstructed" ||
            state === "apnoeic_ventilate" ||
            state === "apnoeic_arrest") && <span aria-hidden>▲</span>}
          {STATE_LABEL[state ?? "unknown"]}
        </span>
      </div>

      {/* Treat-before-proceeding / open-threat indicator */}
      <div
        className={cn(
          "rounded-lg border px-3 py-1.5 text-[11.5px]",
          guard.ok
            ? "border-teal-300/60 bg-teal-50/50 text-teal-700 dark:bg-teal-950/20 dark:text-teal-200"
            : "border-amber-300/70 bg-amber-50/60 text-amber-800 dark:bg-amber-950/20 dark:text-amber-200",
        )}
      >
        {guard.ok ? "✓ Airway secure — safe to proceed to B." : `⚠ ${guard.warning}`}
      </div>

      {/* Arrest route — confirmed pulselessness only */}
      {arrest ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-rose-600 bg-rose-600 px-3 py-2 text-white">
          <p className="text-[12.5px] font-bold">
            ⚠ Apnoea + no signs of life — cardiac arrest, not an airway problem.
          </p>
          <button
            type="button"
            disabled={!active || pending}
            onClick={declareArrest}
            className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-[12px] font-bold text-rose-700 transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Start CPR → ALS
          </button>
        </div>
      ) : state === "apnoeic_ventilate" ? (
        <div className="rounded-lg border border-rose-500/80 bg-rose-50/70 px-3 py-2 text-rose-800 ring-1 ring-rose-500/30 dark:bg-rose-950/30 dark:text-rose-200">
          <p className="text-[12.5px] font-bold">
            ⚠ Apnoea WITH a pulse — open airway + ventilate (bag-mask). Confirm the pulse — if none,
            tick &ldquo;No signs of life&rdquo; → cardiac arrest.
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* ── Findings capture ── */}
        <section className="flex flex-col gap-2.5">
          <h3 className="text-muted-foreground font-mono text-[10px] tracking-[0.14em] uppercase">
            Findings — patency
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {AIRWAY_PATENCY.map((p) => (
              <button
                key={p}
                type="button"
                disabled={!active}
                onClick={() => setPatency(patency === p ? null : p)}
                className={cn(
                  "rounded-lg border px-2.5 py-1.5 text-left text-[11.5px] transition-colors disabled:opacity-50",
                  patency === p
                    ? "border-foreground/30 bg-foreground/90 text-background font-medium"
                    : "border-border bg-muted/30 text-foreground/80 hover:bg-muted/60",
                )}
              >
                {AIRWAY_PATENCY_LABEL[p]}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <ContextToggle
              label="Trauma / C-spine"
              on={!!ctx.trauma}
              disabled={!active}
              onClick={() => setCtx({ ...ctx, trauma: !ctx.trauma })}
            />
            <ContextToggle
              label="Allergen trigger"
              on={!!ctx.allergenTrigger}
              disabled={!active}
              onClick={() => setCtx({ ...ctx, allergenTrigger: !ctx.allergenTrigger })}
            />
            <ContextToggle
              label="Gag / clenched jaw"
              on={!!ctx.gagPresent}
              disabled={!active}
              onClick={() => setCtx({ ...ctx, gagPresent: !ctx.gagPresent })}
            />
            <ContextToggle
              label="No signs of life"
              danger
              on={!!ctx.noSignsOfLife}
              disabled={!active}
              onClick={() => setCtx({ ...ctx, noSignsOfLife: !ctx.noSignsOfLife })}
            />
          </div>

          <FindingGroup
            title="Look"
            findings={AIRWAY_LOOK}
            present={present}
            disabled={!active}
            onToggle={(c) => toggle(present, setPresent, c)}
          />
          <FindingGroup
            title="Listen"
            findings={AIRWAY_LISTEN}
            present={present}
            disabled={!active}
            onToggle={(c) => toggle(present, setPresent, c)}
          />
          <FindingGroup
            title="Feel"
            findings={AIRWAY_FEEL}
            present={present}
            disabled={!active}
            onToggle={(c) => toggle(present, setPresent, c)}
          />

          <h3 className="text-muted-foreground font-mono text-[10px] tracking-[0.14em] uppercase">
            Difficulty screen (anticipate)
          </h3>
          <p className="text-muted-foreground/70 -mt-1 text-[10px] leading-snug">
            Anticipation prompts only — limited sensitivity (esp. Mallampati alone); not pass/fail
            gates.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {AIRWAY_DIFFICULTY.map((d) => (
              <button
                key={d.code}
                type="button"
                disabled={!active}
                title={d.expansion}
                onClick={() => toggle(difficulty, setDifficulty, d.code)}
                className={cn(
                  "rounded-lg border px-2 py-1 text-[11px] transition-colors disabled:opacity-50",
                  difficulty.includes(d.code)
                    ? "border-amber-400/70 bg-amber-50/60 text-amber-800 dark:bg-amber-950/25 dark:text-amber-200"
                    : "border-border bg-muted/30 text-foreground/70 hover:bg-muted/60",
                )}
              >
                {d.label.split(" — ")[0]}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={!active || pending}
            onClick={recordFindings}
            className="mt-1 self-start rounded-lg bg-teal-600 px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
          >
            {reassessDue ? "↻ Re-record airway findings" : "Record airway findings"}
          </button>
        </section>

        {/* ── Triggered actions (co-visible, live) ── */}
        <section className="flex flex-col gap-2">
          <h3 className="text-muted-foreground font-mono text-[10px] tracking-[0.14em] uppercase">
            Indicated actions — finding → why → do
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
                  emergency={airwayAction(a.actionCode)?.emergency ?? false}
                  currentState={a.state}
                  disabled={!active || pending}
                  onSetState={setActionState}
                />
              ))}
            </>
          ) : null}
        </section>
      </div>
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
                  ? "border-rose-400/70 bg-rose-50/60 text-rose-700 dark:bg-rose-950/25 dark:text-rose-200"
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
}: {
  code: string;
  rationale: string;
  emergency: boolean;
  currentState?: AirwayActionState;
  disabled: boolean;
  onSetState: (code: string, s: AirwayActionState) => void;
}) {
  const action = airwayAction(code);
  const dose = action?.doseId ? getResusDose(action.doseId as ResusDoseId) : null;
  const failed = currentState === "failed";
  const escalation = failed ? escalationFor(code) : null;
  const escAction = escalation ? airwayAction(escalation) : null;

  return (
    <div
      className={cn(
        "bg-card rounded-lg border px-2.5 py-2",
        emergency ? "border-rose-400/60" : "border-border",
        currentState === "performed" ? "opacity-70" : "",
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
          {dose ? (
            <p className="text-muted-foreground/80 text-[10.5px]">
              {dose.adultDose ? (
                <span className="text-foreground/80 font-medium">{dose.adultDose}</span>
              ) : (
                <span className="italic">Category-level — clinician doses</span>
              )}
            </p>
          ) : null}
        </div>
        {currentState ? (
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[9.5px] font-semibold",
              currentState === "performed"
                ? "bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-200"
                : currentState === "failed"
                  ? "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-200"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {currentState.replace(/_/g, " ")}
          </span>
        ) : (
          <span className="text-muted-foreground/60 shrink-0 font-mono text-[9.5px]">
            indicated
          </span>
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap gap-1">
        {ACTION_STATES.map((s) => (
          <button
            key={s.value}
            type="button"
            disabled={disabled}
            onClick={() => onSetState(code, s.value)}
            className={cn(
              "rounded-md border px-1.5 py-0.5 text-[10.5px] transition-colors disabled:opacity-40",
              currentState === s.value
                ? "border-foreground/40 bg-foreground/85 text-background"
                : "border-border text-muted-foreground hover:bg-muted/50",
            )}
          >
            {s.label}
          </button>
        ))}
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
