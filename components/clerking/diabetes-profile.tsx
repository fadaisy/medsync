import type { SectionId } from "@/lib/clerking/status";
import type { DeskCriterion, DeskDiabetes } from "@/lib/ncd/pack/desk";
import { CheckIcon, MinusIcon, ShieldQuestionIcon, XIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SECTIONS } from "@/lib/clerking/status";
import { PACK_FEATURE_HOME } from "@/lib/ncd/pack/from-clerking";
import { cn } from "@/lib/utils";
import { Fold } from "./fold";

/**
 * The diabetes profile (NCD_DM_DESK, ADR 0216): what the diabetes pack makes of the clerking so
 * far, beside the note. It appears by itself once the pack sees diabetes or a reason to suspect
 * it, and says what would complete the picture and where that is asked. Every part folds; each
 * criteria set opens (hover or tap) to show which parts of its criteria the record meets. The one
 * interrupt and the medicines to review are flags, not repeated here. Every line is the pack's.
 */

const STATE_WORD: Record<string, string> = {
  met: "Met",
  not_met: "Not met",
  insufficient: "Not assessed",
  unavailable: "Cannot assess here",
};
const PART_WORD: Record<string, string> = {
  met: "met",
  not_met: "not met",
  insufficient: "not recorded",
  unavailable: "not available here",
};

/** "Counsel at this visit: diet, …" → a short title and the rest (owner: the list was too wordy). */
export function shortTitle(text: string): { title: string; rest: string | null } {
  const cut = [text.indexOf(": "), text.indexOf(" (")].filter((i) => i > 0);
  if (!cut.length) return { title: text, rest: null };
  const i = Math.min(...cut);
  return { title: text.slice(0, i), rest: text.slice(i).replace(/^:\s*/, "").trim() };
}

const valueWords = (p: DeskCriterion["parts"][number]) =>
  p.value === null
    ? null
    : p.value === "true"
      ? "yes"
      : p.value === "false"
        ? "no"
        : `${p.value.replace(/_/g, " ")}${p.unit ? ` ${p.unit}` : ""}`;

function PartIcon({ state }: { state: string }) {
  const Icon = state === "met" ? CheckIcon : state === "not_met" ? XIcon : MinusIcon;
  return (
    <Icon
      aria-hidden
      className={cn(
        "mt-0.5 size-3.5 shrink-0",
        state === "met" ? "text-teal-text" : "text-muted-foreground",
      )}
    />
  );
}

/** One criterion and its parts: "Random glucose 14.2 mmol/L — met". */
function Criterion({ c }: { c: DeskCriterion }) {
  return (
    <li className="flex flex-col gap-1">
      <p className="text-body-s text-foreground leading-snug">
        <span className={c.state === "met" ? "text-teal-text font-medium" : "font-medium"}>
          {STATE_WORD[c.state] ?? c.state}
        </span>
        {": "}
        {c.label}
      </p>
      <ul className="flex flex-col gap-0.5 pl-1">
        {c.parts.map((p, i) => (
          <li key={`${p.feature}:${i}`} className="text-caption flex items-start gap-1.5">
            <PartIcon state={p.state} />
            <span className="text-foreground">
              {p.display}
              {valueWords(p) ? (
                <span className="text-muted-foreground">{` · ${valueWords(p)}`}</span>
              ) : null}
              <span className="text-muted-foreground">{` — ${PART_WORD[p.state] ?? p.state}`}</span>
            </span>
          </li>
        ))}
      </ul>
    </li>
  );
}

/** The criteria of one set, met first, then those with any part met; the rest are counted. */
function SetDetail({ label, criteria }: { label: string; criteria: DeskCriterion[] }) {
  const partly = (c: DeskCriterion) => c.state !== "met" && c.parts.some((p) => p.state === "met");
  const shown = [...criteria.filter((c) => c.state === "met"), ...criteria.filter(partly)];
  const rest = criteria.length - shown.length;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-body-s text-foreground font-medium">{label}</p>
      {shown.length ? (
        <ul className="flex flex-col gap-2.5">
          {shown.map((c) => (
            <Criterion key={c.id} c={c} />
          ))}
        </ul>
      ) : (
        <p className="text-caption text-muted-foreground">
          No part of any criterion is met on the record yet.
        </p>
      )}
      {rest > 0 ? (
        <p className="text-caption text-muted-foreground">
          {`${rest} other ${rest === 1 ? "criterion has" : "criteria have"} nothing met yet.`}
        </p>
      ) : null}
    </div>
  );
}

export function DiabetesProfile({
  d,
  onGo,
  onMore,
}: {
  d: DeskDiabetes;
  onGo: (step: SectionId) => void;
  /** Opens "More diabetes questions" (the questions the clerking does not ask). */
  onMore?: () => void;
}) {
  const v = d.view;
  const dm = v.diagnosis.filter((x) => x.verdict === "diabetes");
  const met = dm.some((x) => x.state === "met");
  const status = d.established
    ? "Known diabetes"
    : met
      ? "Criteria met"
      : dm.length
        ? "Possible diabetes"
        : "Diabetes risk";
  const asks = v.questions.slice(0, 6).map((q) => ({ ...q, home: PACK_FEATURE_HOME[q.feature] }));
  const more = v.questions.some((q) => PACK_FEATURE_HOME[q.feature] === "more");
  return (
    <section aria-labelledby="clerking-dm-heading" className="px-5 py-4">
      <Fold
        title={<span id="clerking-dm-heading">Diabetes</span>}
        aside={
          <span
            className={cn(
              "text-caption rounded-md px-2 py-0.5 font-medium",
              met || d.established
                ? "bg-teal-tint text-teal-text"
                : "bg-muted text-muted-foreground",
            )}
          >
            {status}
          </span>
        }
      >
        <div className="flex flex-col gap-3">
          {v.diagnosis.length ? (
            <Fold level="part" title="Criteria">
              <ul className="flex flex-col gap-1.5">
                {v.diagnosis.map((x) => (
                  <li key={x.id}>
                    <Popover>
                      <PopoverTrigger
                        openOnHover
                        delay={150}
                        className="border-border hover:bg-muted/50 focus-visible:shadow-focus text-body-s flex w-full items-baseline justify-between gap-3 rounded-md border px-2.5 py-1.5 text-left outline-none"
                      >
                        <span className="text-foreground min-w-0">
                          {x.label}
                          {x.isDefault ? (
                            <span className="text-muted-foreground"> (default)</span>
                          ) : null}
                        </span>
                        <span
                          className={cn(
                            "shrink-0",
                            x.state === "met"
                              ? "text-teal-text font-medium"
                              : "text-muted-foreground",
                          )}
                        >
                          {STATE_WORD[x.state] ?? x.state}
                        </span>
                      </PopoverTrigger>
                      <PopoverContent
                        side="left"
                        align="start"
                        className="max-h-[70svh] w-96 overflow-y-auto"
                      >
                        <SetDetail label={x.label} criteria={d.criteria[x.id] ?? []} />
                      </PopoverContent>
                    </Popover>
                  </li>
                ))}
              </ul>
              {v.classification.length ? (
                <p className="text-body-s text-foreground mt-2">
                  Supports: {v.classification.map((c) => c.display).join(", ")}
                </p>
              ) : null}
            </Fold>
          ) : null}

          {v.caveats.length ? (
            <Fold level="part" title="Results to read with care">
              <ul className="flex flex-col gap-1">
                {v.caveats.map((c) => (
                  <li key={c.id} className="text-body-s text-foreground">
                    <StatusWord tone="caution">{c.label}</StatusWord>
                  </li>
                ))}
              </ul>
            </Fold>
          ) : null}

          {v.targets.length ? (
            <Fold level="part" title="Targets">
              <ul className="text-body-s text-foreground flex flex-col gap-0.5">
                {v.targets.map((t) => (
                  <li key={t.id}>{t.display}</li>
                ))}
              </ul>
            </Fold>
          ) : null}

          {v.care.length ? (
            <Fold level="part" title={`Due or to consider (${v.care.length})`}>
              <ul className="flex flex-col gap-1">
                {v.care.map((c) => {
                  const { title, rest } = shortTitle(c.display);
                  return (
                    <li key={c.id} className="text-body-s text-foreground">
                      {rest ? (
                        <details className="group/item">
                          <summary className="focus-visible:shadow-focus cursor-pointer list-none rounded-xs outline-none [&::-webkit-details-marker]:hidden">
                            {title}
                            <span className="text-caption text-muted-foreground group-open/item:hidden">
                              {" "}
                              · more
                            </span>
                          </summary>
                          <p className="text-caption text-muted-foreground mt-0.5 leading-relaxed">
                            {rest}
                          </p>
                        </details>
                      ) : (
                        title
                      )}
                    </li>
                  );
                })}
              </ul>
            </Fold>
          ) : null}

          {asks.length || v.withheld ? (
            <Fold level="part" title="Would complete this">
              <ul className="flex flex-col gap-1">
                {v.withheld ? (
                  <li className="text-body-s text-foreground">
                    {`Is she pregnant, or within 6 weeks of a birth? ${v.withheld} ${v.withheld === 1 ? "item is" : "items are"} waiting for the answer.`}
                  </li>
                ) : null}
                {asks.map((q) => {
                  const step = SECTIONS.find((s) => s.id === q.home);
                  return (
                    <li
                      key={q.feature}
                      className="text-body-s flex items-baseline justify-between gap-3"
                    >
                      <span className="text-foreground min-w-0">{q.display}</span>
                      {step ? (
                        <button
                          type="button"
                          onClick={() => onGo(step.id)}
                          className="text-caption focus-visible:shadow-focus shrink-0 rounded-xs font-medium text-teal-700 outline-none hover:underline dark:text-teal-300"
                        >
                          {`${step.num} ${step.short}`}
                        </button>
                      ) : q.home === "results" ? (
                        <span className="text-caption text-muted-foreground shrink-0">
                          A result
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              {more && onMore ? (
                <button
                  type="button"
                  onClick={onMore}
                  className="text-caption focus-visible:shadow-focus mt-1.5 rounded-xs font-medium text-teal-700 outline-none hover:underline dark:text-teal-300"
                >
                  More diabetes questions
                </button>
              ) : null}
            </Fold>
          ) : null}

          <p className="text-caption text-muted-foreground flex items-start gap-1.5">
            <ShieldQuestionIcon aria-hidden className="mt-0.5 size-3 shrink-0" />
            {`Diabetes pack ${v.packVersion}: signed by the CSO; the second clinical reviewer has not signed yet. Decision support, not clinical advice.`}
          </p>
        </div>
      </Fold>
    </section>
  );
}
