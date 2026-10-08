import type { SectionId } from "@/lib/clerking/status";
import type { DeskDiabetes } from "@/lib/ncd/pack/desk";
import { ShieldQuestionIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { SECTIONS } from "@/lib/clerking/status";
import { PACK_FEATURE_HOME } from "@/lib/ncd/pack/from-clerking";
import { cn } from "@/lib/utils";

/**
 * The diabetes profile (NCD_DM_DESK, ADR 0216): what the diabetes pack makes of the clerking so
 * far, beside the note. It appears by itself once the pack sees diabetes or a reason to suspect
 * it, and says what would complete the picture and where that is asked. The one interrupt and
 * the medicines to review are flags, not repeated here. Every line is the pack's own wording.
 */

const STATE_WORD: Record<string, string> = {
  met: "Met",
  not_met: "Not met",
  insufficient: "Not assessed",
  unavailable: "Cannot assess here",
};

const HEAD = "text-caption tracking-[0.06em] uppercase text-muted-foreground";

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
    <section aria-labelledby="clerking-dm-heading" className="flex flex-col gap-3 px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="clerking-dm-heading" className="text-heading-s text-foreground">
          Diabetes
        </h2>
        <span
          className={cn(
            "text-caption rounded-full px-2 py-0.5 font-medium",
            met || d.established ? "bg-teal-tint text-teal-text" : "bg-muted text-muted-foreground",
          )}
        >
          {status}
        </span>
      </div>

      {dm.length ? (
        <dl className="flex flex-col gap-1">
          {dm.map((x) => (
            <div key={x.id} className="text-body-s flex items-baseline justify-between gap-3">
              <dt className="text-foreground min-w-0">
                {x.label}
                {x.isDefault ? <span className="text-muted-foreground"> (default)</span> : null}
              </dt>
              <dd
                className={
                  x.state === "met" ? "text-teal-text font-medium" : "text-muted-foreground"
                }
              >
                {STATE_WORD[x.state] ?? x.state}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {v.classification.length ? (
        <p className="text-body-s text-foreground">
          Supports: {v.classification.map((c) => c.display).join(", ")}
        </p>
      ) : null}

      {v.caveats.length ? (
        <div className="flex flex-col gap-1">
          <h3 className={HEAD}>Results to read with care</h3>
          <ul className="flex flex-col gap-1">
            {v.caveats.map((c) => (
              <li key={c.id} className="text-body-s text-foreground">
                <StatusWord tone="caution">{c.label}</StatusWord>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {v.targets.length ? (
        <div className="flex flex-col gap-1">
          <h3 className={HEAD}>Targets</h3>
          <ul className="text-body-s text-foreground flex flex-col gap-0.5">
            {v.targets.map((t) => (
              <li key={t.id}>{t.display}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {v.care.length ? (
        <div className="flex flex-col gap-1">
          <h3 className={HEAD}>{`Due or to consider (${v.care.length})`}</h3>
          <ul className="text-body-s text-foreground flex flex-col gap-1">
            {v.care.slice(0, 6).map((c) => (
              <li key={c.id}>{c.display}</li>
            ))}
          </ul>
          {v.care.length > 6 ? (
            <p className="text-caption text-muted-foreground">{`${v.care.length - 6} more in the Plan`}</p>
          ) : null}
        </div>
      ) : null}

      {asks.length || v.withheld ? (
        <div className="flex flex-col gap-1">
          <h3 className={HEAD}>Would complete this</h3>
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
                    <span className="text-caption text-muted-foreground shrink-0">A result</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {more && onMore ? (
            <button
              type="button"
              onClick={onMore}
              className="text-caption focus-visible:shadow-focus self-start rounded-xs font-medium text-teal-700 outline-none hover:underline dark:text-teal-300"
            >
              More diabetes questions
            </button>
          ) : null}
        </div>
      ) : null}

      <p className="text-caption text-muted-foreground flex items-start gap-1.5">
        <ShieldQuestionIcon aria-hidden className="mt-0.5 size-3 shrink-0" />
        {`Diabetes pack ${v.packVersion}: signed by the CSO; the second clinical reviewer has not signed yet. Decision support, not clinical advice.`}
      </p>
    </section>
  );
}
