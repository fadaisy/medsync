"use client";

import type { TerminationReview as Review } from "@/lib/resus/als/termination";
import type { ArrestState } from "@/lib/resus/model";
import { CircleDotIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";

import { ALS_REFS } from "@/lib/resus/reference/als-catalog";
import { PENDING_CSO } from "@/lib/resus/reference/ref";
import { CAUSE_STATE_WORD, causeName, clock, ReviewRow } from "./after-arrest-shared";

/**
 * The read-only half of the termination review (ALS-TOR-03/04/07/08): FACTS,
 * CHECK (causes not yet excluded, first and amber), CONTINUE flags and the
 * persistent-asystole CRITERIA as information only (D1) — never a prompt to stop.
 */

const AIRWAY_WORD: Record<ArrestState["airway"]["level"], string> = {
  none: "none recorded",
  bvm: "bag-mask",
  sga: "supraglottic airway",
  ett: "tracheal tube",
};

const TRACE_WORD: Record<"yes" | "no" | "unavailable", string> = {
  yes: "trace confirmed",
  no: "no sustained trace",
  unavailable: "capnography not available",
};

const AMBER_CHIP =
  "text-body-s rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100";

const torSigned = () => ALS_REFS["ALS-TOR-03"]?.status === "signed";

/** The texts this review displays — stored with the stop (`shown`) for the audit. */
export function shownTexts(review: Review, paediatric: boolean): string[] {
  const out: string[] = [];
  for (const c of review.notExcluded)
    out.push(`Not yet excluded: ${causeName(c.ruleId)} (${CAUSE_STATE_WORD[c.state]})`);
  for (const f of review.continueFlags) out.push(`${f.ruleId}: ${f.text}`);
  if (!paediatric && torSigned()) out.push(review.criteria.erc.text, review.criteria.rcuk.text);
  return out.map((t) => t.slice(0, 200)).slice(0, 40);
}

export function ReviewFacts({ review, paediatric }: { review: Review; paediatric: boolean }) {
  const f = review.facts;
  const { erc, rcuk } = review.criteria;
  return (
    <>
      <ReviewRow label="Facts">
        <p className="text-body-m text-foreground font-mono tabular-nums">
          Arrest {clock(f.arrestDurationMs)} · CPR {clock(f.cprDurationMs)}
          {f.persistentAsystoleMs !== null
            ? ` · persistent asystole ${clock(f.persistentAsystoleMs)}`
            : ""}{" "}
          · shocks {f.shocks} · adrenaline ×{f.adrenalineDoses}
        </p>
        <p className="text-body-s text-foreground">
          Airway: {AIRWAY_WORD[f.airway]}
          {f.airway === "ett"
            ? ` · ${f.capnography ? TRACE_WORD[f.capnography] : "trace not recorded"}`
            : ""}
        </p>
        <p className="text-body-s text-foreground">
          EtCO₂ last 3:{" "}
          <span className="font-mono tabular-nums">
            {f.etco2Last3.length > 0 ? `${f.etco2Last3.join(" · ")} kPa` : "not recorded"}
          </span>{" "}
          <span className="text-muted-foreground">(strong marker, never alone)</span>
        </p>
      </ReviewRow>

      <ReviewRow label="Check">
        {review.notExcluded.length === 0 ? (
          <p className="text-body-s text-muted-foreground">
            All eight reversible causes recorded as excluded.
          </p>
        ) : (
          <>
            <p className="text-body-s inline-flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-200">
              <TriangleAlertIcon className="size-4 shrink-0" aria-hidden />
              Not yet excluded — review before stopping
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {review.notExcluded.map((c) => (
                <li key={c.key} className={AMBER_CHIP}>
                  {causeName(c.ruleId)} · {CAUSE_STATE_WORD[c.state]}
                  {c.evidence[0] ? (
                    <span className="text-caption block opacity-80">{c.evidence[0].label}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </ReviewRow>

      <ReviewRow label="Continue">
        {review.continueFlags.length === 0 ? (
          <p className="text-body-s text-muted-foreground">
            None active (hypothermia · toxins / LAST · PE after lysis · shockable rhythm ·
            intermittent ROSC · rising EtCO₂ · hysterotomy pending · cause being treated)
          </p>
        ) : (
          <ul className="space-y-1.5">
            {review.continueFlags.map((c) => (
              <li key={c.id} className={`${AMBER_CHIP} flex items-start gap-1.5`}>
                <CircleDotIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                {c.text}
              </li>
            ))}
          </ul>
        )}
      </ReviewRow>

      <ReviewRow label="Criteria">
        {paediatric ? (
          <p className="text-body-s text-muted-foreground">
            Child — adult criteria are not shown (D13).
          </p>
        ) : !torSigned() ? (
          <p className="text-body-s text-muted-foreground">{PENDING_CSO}</p>
        ) : (
          <>
            <div className="border-border bg-muted rounded-md border px-3 py-2">
              <p className="text-body-s text-foreground inline-flex gap-1.5">
                <InfoIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                {erc.text}
              </p>
              <p className="text-caption text-muted-foreground mt-1 pl-6">
                Information only — the decision stays with the team.
              </p>
            </div>
            <details className="text-body-s">
              <summary className="text-muted-foreground focus-visible:shadow-focus flex min-h-11 cursor-pointer items-center rounded-md outline-none">
                RCUK detail and cautions
              </summary>
              <p className="text-foreground">{rcuk.text}</p>
              <ul className="text-muted-foreground mt-2 space-y-1">
                {review.cautions.map((c) => (
                  <li key={c.ruleId}>
                    <span className="font-mono">{c.ruleId}</span> {c.text}
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
      </ReviewRow>
    </>
  );
}
