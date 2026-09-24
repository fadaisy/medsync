"use client";

import type { CauseKey, CauseState, CauseTile } from "@/lib/resus/model";
import type { AbcdeLetter } from "@/lib/resus/types";
import { useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  CircleDotIcon,
  CircleIcon,
  LoaderCircleIcon,
  MinusIcon,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ALS_REFS } from "@/lib/resus/reference/als-catalog";
import { PENDING_CSO, refValue } from "@/lib/resus/reference/ref";
import { cn } from "@/lib/utils";
import { fmtMs } from "./arrest-console-model";
import { useDeskCtx } from "./desk-context";

/**
 * CAUSES — the 4 Hs and 4 Ts (catalog §6, ALS-RC-01..09). A tap moves a tile one step:
 * not assessed → suspected → treating → treated; ▾ sets any state (incl. excluded). The
 * engine pre-fills "suspected" from survey evidence (each linked to its entry) and never
 * auto-excludes. A tile's action text is the signed catalog wording, withheld until signed;
 * the only numbers are the verified hyper/hypokalaemic-arrest ones (ALS-RC-03), never for
 * a child (ALS-MOD-16).
 */

const STATE: Record<CauseState, { word: string; icon: typeof CheckIcon; tone: string }> = {
  not_assessed: { word: "Not assessed", icon: CircleIcon, tone: "border-border bg-card" },
  suspected: {
    word: "Suspected",
    icon: CircleDotIcon,
    tone: "border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100",
  },
  treating: {
    word: "Treating",
    icon: LoaderCircleIcon,
    tone: "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100",
  },
  treated: { word: "Treated", icon: CheckIcon, tone: "border-teal-200 bg-teal-50 text-teal-800" },
  excluded: {
    word: "Excluded",
    icon: MinusIcon,
    tone: "border-border bg-muted/40 text-muted-foreground",
  },
};

const ORDER: CauseState[] = ["not_assessed", "suspected", "treating", "treated", "excluded"];
const NEXT: Partial<Record<CauseState, CauseState>> = {
  not_assessed: "suspected",
  suspected: "treating",
  treating: "treated",
};

/** Name and action from the signed catalog row ("Name — action"). */
function tileText(tile: CauseTile, child: boolean): { name: string; action: string } {
  const e = ALS_REFS[tile.ruleId];
  if (!e) return { name: tile.key.replace(/_/g, " "), action: "" };
  const [name = tile.key, ...rest] = e.text.split(" — ");
  const action = rest.join(" — ");
  if (refValue(e) === PENDING_CSO) return { name, action: PENDING_CSO };
  if (tile.key === "potassium_metabolic" && child)
    return { name, action: "Weight-based — PLS module not built" };
  // Law 7: the adult thrombolysis clock (60–90 min) never reaches a child.
  if (tile.key === "thrombosis" && child)
    return {
      name,
      action: "Thrombolysis (PE) → prolonged resuscitation (weight-based — PLS module not built)",
    };
  if (tile.key === "temperature") return { name, action: "See Special above" };
  return { name, action };
}

export function ReversibleCauses({
  causes,
  paediatric,
  onSet,
}: {
  causes: CauseTile[];
  paediatric: boolean;
  onSet: (cause: CauseKey, state: CauseState) => void;
}) {
  const [open, setOpen] = useState(false);
  const suspected = causes.filter((c) => c.state === "suspected" || c.state === "treating").length;

  return (
    <section aria-label="Reversible causes" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-overline text-muted-foreground uppercase">Causes · 4 Hs and 4 Ts</p>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="tap text-body-s min-h-11 rounded-md px-2 font-medium text-teal-700 sm:hidden"
        >
          {open ? "Hide causes" : `Show causes · ${suspected} suspected or treating`}
        </button>
      </div>
      <ul
        className={cn(
          "grid-cols-1 gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-4",
          open ? "grid" : "hidden",
        )}
      >
        {causes.map((tile) => (
          <CauseTileView key={tile.key} tile={tile} child={paediatric} onSet={onSet} />
        ))}
      </ul>
    </section>
  );
}

const STEP_OF: Record<string, AbcdeLetter> = { A: "A", B: "B", C: "C", D: "D", E: "E" };

function CauseTileView({
  tile,
  child,
  onSet,
}: {
  tile: CauseTile;
  child: boolean;
  onSet: (cause: CauseKey, state: CauseState) => void;
}) {
  const { store, ui, initial } = useDeskCtx();
  const [menu, setMenu] = useState(false);
  const meta = STATE[tile.state];
  const Icon = meta.icon;
  const { name, action } = tileText(tile, child);
  const next = NEXT[tile.state];
  const showAction = (tile.state === "suspected" || tile.state === "treating") && action !== "";
  const startedMs = Date.parse(initial.episode.startedAtIso);

  /** Evidence → its record entry: the step it was recorded in (paused survey), else the survey. */
  const openEvidence = (eventId: string | null) => {
    const e = eventId ? store.activeEvents.find((x) => x.id === eventId) : undefined;
    const step = e?.kind === "assessment" && e.step ? STEP_OF[e.step] : undefined;
    if (step) ui.setActiveStep(step);
    ui.setSurveyTab(true);
  };

  return (
    <li className={cn("flex flex-col gap-1.5 rounded-lg border p-2", meta.tone)}>
      <div className="flex items-stretch gap-1">
        <button
          type="button"
          onClick={() => (next ? onSet(tile.key, next) : setMenu(true))}
          aria-label={`${name}: ${meta.word}.${next ? ` Tap to mark ${STATE[next].word.toLowerCase()}.` : " Change state."}`}
          className="tap hover:bg-foreground/5 flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-left"
        >
          <Icon aria-hidden className="size-4 shrink-0" />
          <span className="flex min-w-0 flex-col">
            <span className="text-body-s leading-tight font-medium">{name}</span>
            <span className="text-caption">{meta.word}</span>
          </span>
        </button>
        <DropdownMenu open={menu} onOpenChange={(o) => setMenu(o)}>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label={`Set ${name} state`}
                className="tap hover:bg-foreground/5 flex min-h-11 w-11 shrink-0 items-center justify-center rounded-md"
              />
            }
          >
            <ChevronDownIcon aria-hidden className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {ORDER.map((st) => {
              const S = STATE[st].icon;
              return (
                <DropdownMenuItem
                  key={st}
                  className="text-body-s min-h-11 px-3"
                  disabled={st === tile.state}
                  onClick={() => onSet(tile.key, st)}
                >
                  <S aria-hidden className="size-4" />
                  {STATE[st].word}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {showAction ? (
        <p className="text-caption px-1.5" data-rule={tile.ruleId}>
          {action}
        </p>
      ) : null}
      {tile.evidence.length > 0 ? (
        <button
          type="button"
          onClick={() => openEvidence(tile.evidence[0]?.eventId ?? null)}
          aria-label={`Evidence for ${name}: ${tile.evidence.map((ev) => ev.label).join("; ")}. Open in the survey`}
          className="tap hover:bg-foreground/5 flex min-h-11 flex-col items-start justify-center rounded-md px-1.5 text-left"
        >
          {tile.evidence.slice(0, 2).map((ev, i) => {
            const at = ev.eventId ? store.activeEvents.find((x) => x.id === ev.eventId) : undefined;
            return (
              <span
                key={`${ev.eventId}-${i}`}
                className="text-caption underline decoration-dotted underline-offset-2"
              >
                {ev.label}
                {at ? ` (T+${fmtMs(Date.parse(at.recordedAt) - startedMs, "hms")})` : ""}
              </span>
            );
          })}
          {tile.evidence.length > 2 ? (
            <span className="text-caption">+{tile.evidence.length - 2} more</span>
          ) : null}
        </button>
      ) : null}
    </li>
  );
}
