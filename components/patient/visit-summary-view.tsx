import type { SummaryItem, VisitSummaryContent } from "@/lib/patient/visit-summary";
import type { ReactNode } from "react";

import { SUMMARY_HEADINGS, TESTS_NOTE } from "@/lib/patient/visit-summary";
import { cn } from "@/lib/utils";

/**
 * The patient's visit summary (ADR 0203), drawn the same way wherever it appears: the patient's page, the paper
 * copy, and the clinician's preview at the close, so the preview is exactly what the patient will read. With
 * `onToggle`, each item gets a Remove / Put back control (the clinician's preview only); a removed item is shown
 * struck through with its word, never colour alone.
 */
export function VisitSummaryView({
  content,
  timeZone = "Africa/Kampala",
  removed,
  onToggle,
  itemAction,
  className,
}: {
  content: VisitSummaryContent;
  timeZone?: string;
  /** Item ids the clinician has taken out (preview only). */
  removed?: ReadonlySet<string>;
  onToggle?: (id: string) => void;
  /** Extra control per item (the patient's "Add to my medicines"). */
  itemAction?: (item: SummaryItem, section: keyof VisitSummaryContent["sections"]) => ReactNode;
  className?: string;
}) {
  const date = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(new Date(content.visit.startedAt));
  const sections = (["found", "medicines", "stopped", "tests"] as const).filter(
    (s) => content.sections[s].length > 0,
  );

  return (
    <article className={cn("flex flex-col gap-5", className)}>
      <header className="flex flex-col gap-1">
        <p className="text-caption text-muted-foreground">
          {date} · {content.visit.hospitalName}
          {content.visit.clinician ? ` · ${content.visit.clinician}` : ""}
        </p>
        <p className="text-body text-foreground font-medium">{content.outcome}</p>
        {content.outcomeNote ? (
          <p className="text-body-s text-muted-foreground">{content.outcomeNote}</p>
        ) : null}
      </header>

      {sections.map((s) => (
        <section key={s} className="flex flex-col gap-2" aria-labelledby={`vs-${s}`}>
          <h3 id={`vs-${s}`} className="text-label text-foreground">
            {SUMMARY_HEADINGS[s]}
          </h3>
          <ul className="flex flex-col gap-2">
            {content.sections[s].map((item) => {
              const out = removed?.has(item.id) ?? false;
              return (
                <li
                  key={item.id}
                  className="border-border flex flex-wrap items-start justify-between gap-x-3 gap-y-1 rounded-md border px-3 py-2"
                >
                  <div className={cn("flex min-w-0 flex-col", out && "text-muted-foreground")}>
                    <span className={cn("text-body-s text-foreground", out && "line-through")}>
                      {item.text}
                    </span>
                    {item.detail ? (
                      <span
                        className={cn("text-caption text-muted-foreground", out && "line-through")}
                      >
                        {item.detail}
                      </span>
                    ) : null}
                    {out ? (
                      <span className="text-caption">Removed from the patient’s copy</span>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {itemAction?.(item, s)}
                    {onToggle ? (
                      <button
                        type="button"
                        onClick={() => onToggle(item.id)}
                        aria-pressed={out}
                        className="text-caption font-medium text-teal-700 underline-offset-4 hover:underline"
                      >
                        {out ? "Put back" : "Remove"}
                        <span className="sr-only"> {item.text}</span>
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          {s === "tests" ? (
            <p className="text-caption text-muted-foreground">{TESTS_NOTE}</p>
          ) : null}
        </section>
      ))}

      {content.next || content.comeBackIf ? (
        <section className="flex flex-col gap-2" aria-labelledby="vs-next">
          <h3 id="vs-next" className="text-label text-foreground">
            {SUMMARY_HEADINGS.next}
          </h3>
          {content.next ? <p className="text-body-s text-foreground">{content.next}</p> : null}
          {content.comeBackIf ? (
            <p className="text-body-s text-foreground">
              <span className="font-medium">Come back if: </span>
              {content.comeBackIf}
            </p>
          ) : null}
        </section>
      ) : null}
    </article>
  );
}
