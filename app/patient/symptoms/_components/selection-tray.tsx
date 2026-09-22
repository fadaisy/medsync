"use client";

import type { CatalogItem } from "@/supabase/functions/_shared/symptom-catalog/types";
import { useState } from "react";
import { ChevronUpIcon, XIcon } from "lucide-react";

import { BottomActionBar, BottomActionBarSpacer } from "@/components/responsive/bottom-action-bar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CATALOG } from "@/supabase/functions/_shared/symptom-catalog/catalog.v0.1";
import { t } from "@/supabase/functions/_shared/symptom-catalog/classify";

/**
 * The sticky bottom bar — "2 selected · Continue" — hidden until the first
 * selection (PRD §6.1). The count is a button that expands the list to
 * review and remove; Continue is the one advance, the third interaction.
 */
export function SelectionTray({
  items,
  onRemove,
  onContinue,
}: {
  items: ReadonlyArray<CatalogItem>;
  onRemove: (key: string) => void;
  onContinue: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;
  return (
    <>
      <BottomActionBar className="min-h-14">
        {/* The attribute tells the Emergency pill to step out of the way (see emergency-pill.tsx). */}
        <div
          className="flex w-full flex-col gap-2"
          data-bottom-bar-expanded={expanded || undefined}
        >
          {expanded ? (
            <ul id="tray-list" className="flex flex-col gap-1" aria-label="What you chose">
              {items.map((it) => (
                <li key={it.key} className="flex items-center justify-between gap-2">
                  <span className="text-foreground text-body-s min-w-0 truncate">
                    {t(CATALOG, it.labelKey)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11"
                    aria-label={`Remove ${t(CATALOG, it.labelKey)}`}
                    onClick={() => onRemove(it.key)}
                  >
                    <XIcon aria-hidden className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls="tray-list"
              onClick={() => setExpanded((v) => !v)}
              className="text-foreground text-body-m inline-flex min-h-11 items-center gap-1 font-medium"
            >
              {items.length} selected
              <ChevronUpIcon
                aria-hidden
                className={cn(
                  "duration-fast ease-expo-out size-4 transition-transform",
                  expanded && "rotate-180",
                )}
              />
            </button>
            <Button type="button" size="lg" onClick={onContinue}>
              Continue
            </Button>
          </div>
        </div>
      </BottomActionBar>
      <BottomActionBarSpacer />
    </>
  );
}
