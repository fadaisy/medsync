"use client";

import type { CatalogItem } from "@/supabase/functions/_shared/symptom-catalog/types";
import { CheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { CATALOG } from "@/supabase/functions/_shared/symptom-catalog/catalog.v0.1";
import { t } from "@/supabase/functions/_shared/symptom-catalog/classify";
import { TIER_LABEL_KEY } from "@/supabase/functions/_shared/symptom-catalog/types";
import { QualifierChips } from "./qualifier-chips";

/**
 * One catalog item as a 56px toggle row (PRD §7.2 S2). The tier word is in
 * the accessible name of every row; an emergency item also carries the word
 * "Emergency" as a visible marker — the ONE red this file may paint
 * (tests/design/red-reserved.test.ts), and never without its word.
 */
export function ItemRow({
  item,
  selected,
  answers,
  onToggle,
  onAnswer,
}: {
  item: CatalogItem;
  selected: boolean;
  answers: Record<string, string> | undefined;
  onToggle: () => void;
  onAnswer: (qualifierKey: string, optionKey: string) => void;
}) {
  const label = t(CATALOG, item.labelKey);
  const tierWord = t(CATALOG, TIER_LABEL_KEY[item.tier]);
  const emergency = item.tier === "E";
  return (
    <li className="flex flex-col">
      <button
        type="button"
        aria-pressed={selected}
        onClick={onToggle}
        className={cn(
          "tap flex min-h-14 w-full items-center gap-3 rounded-lg px-3 text-left",
          selected ? "bg-accent ring-brand-300 ring-1" : "bg-card dark:shadow-card shadow-xs",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "grid size-5 shrink-0 place-items-center rounded-full border",
            selected ? "bg-primary border-primary text-primary-foreground" : "border-gray-300",
          )}
        >
          {selected ? <CheckIcon aria-hidden className="size-3.5" strokeWidth={2.5} /> : null}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-foreground text-body-m leading-snug">{label}</span>
          {item.helperKey ? (
            <span className="text-muted-foreground text-caption">{t(CATALOG, item.helperKey)}</span>
          ) : null}
          <span className="sr-only">, {tierWord}</span>
        </span>
        {emergency ? (
          <span className="bg-status-critical-bg text-status-critical-fg text-caption shrink-0 rounded px-2 py-0.5 font-medium">
            Emergency
          </span>
        ) : null}
      </button>
      {selected && item.qualifiers?.length ? (
        <div className="pt-2 pl-8">
          <QualifierChips
            itemKey={item.key}
            qualifiers={item.qualifiers}
            answers={answers}
            onAnswer={onAnswer}
          />
        </div>
      ) : null}
    </li>
  );
}
