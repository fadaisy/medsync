"use client";

import type { Qualifier } from "@/supabase/functions/_shared/symptom-catalog/types";

import { cn } from "@/lib/utils";
import { CATALOG } from "@/supabase/functions/_shared/symptom-catalog/catalog.v0.1";
import { t } from "@/supabase/functions/_shared/symptom-catalog/classify";

/**
 * S3: the item's questions inline under its row — at most two, each a
 * fieldset of real radios drawn as chips (PRD §6.1, §7.2). Answering never
 * lowers the tier; an escalating option is handled by the caller.
 */
export function QualifierChips({
  itemKey,
  qualifiers,
  answers,
  onAnswer,
}: {
  itemKey: string;
  qualifiers: ReadonlyArray<Qualifier>;
  answers: Record<string, string> | undefined;
  onAnswer: (qualifierKey: string, optionKey: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 pb-1">
      {qualifiers.slice(0, 2).map((q) => (
        <fieldset key={q.key} className="flex flex-wrap items-center gap-2">
          <legend className="text-foreground text-body-s mb-1.5 w-full">
            {t(CATALOG, q.promptKey)}
          </legend>
          {q.options.map((o) => {
            const checked = answers?.[q.key] === o.key;
            return (
              <label
                key={o.key}
                className={cn(
                  "tap text-body-s has-[:focus-visible]:shadow-focus flex min-h-11 cursor-pointer items-center rounded-lg px-3",
                  checked
                    ? "bg-foreground text-background font-medium"
                    : "bg-card text-muted-foreground dark:shadow-card shadow-xs",
                )}
              >
                <input
                  type="radio"
                  name={`${itemKey}:${q.key}`}
                  value={o.key}
                  checked={checked}
                  onChange={() => onAnswer(q.key, o.key)}
                  className="sr-only"
                />
                {t(CATALOG, o.labelKey)}
              </label>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}
