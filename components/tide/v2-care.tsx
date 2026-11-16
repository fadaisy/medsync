"use client";

import type { Hero } from "@patient-core/today-hero";
import { heroTone } from "@patient-core/today-hero";
import { CheckIcon } from "lucide-react";

import { buttonClass, ICON } from "@/components/tide/kit";
import { CARE_V2_COPY } from "@/content/patient-app/care";
import { cn } from "@/lib/utils";

const H = CARE_V2_COPY.hero;
const PL = CARE_V2_COPY.plan;

/**
 * Today's hero card, from the ladder in `@patient-core/today-hero` (§5.6, M6). Only the danger hero is red
 * (MR5); its action opens the danger dialog, which carries Help.
 */
export function HeroCard({ hero, onAction }: { hero: Hero; onAction?: () => void }) {
  const tone = heroTone(hero);
  const words = (() => {
    switch (hero.kind) {
      case "danger":
        return { kicker: H.danger, title: hero.danger.at, action: H.dangerAction };
      case "team":
        return { kicker: H.team, title: hero.ask.from, action: H.teamAction };
      case "due":
        return {
          kicker: H.due,
          title: `${hero.due.label} · ${hero.due.dueAt}`,
          action: H.dueAction,
        };
      case "visit":
        return { kicker: H.visit, title: hero.visit.window, action: H.visitAction };
      case "next":
        return { kicker: H.next, title: `${hero.next.label} · ${hero.next.at}`, action: null };
      case "rest":
        return { kicker: hero.until ? H.rest : H.restNone, title: hero.until ?? "", action: null };
    }
  })();
  return (
    <section
      role={hero.kind === "danger" ? "alert" : undefined}
      className={cn(
        "rounded-pw-card flex flex-wrap items-center gap-4 p-5",
        tone === "emergency" && "bg-pw-emergency text-pw-on-emergency shadow-pw-emergency",
        tone === "accent" && "bg-pw-band text-pw-on-band",
        tone === "neutral" && "bg-pw-surface shadow-pw-card",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-[13px] font-semibold tracking-[0.04em] uppercase opacity-80">
          {words.kicker}
        </p>
        {words.title ? (
          <p className="font-pw text-[24px] leading-tight font-semibold">{words.title}</p>
        ) : null}
      </div>
      {words.action && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className={buttonClass(
            tone === "emergency" ? "glass" : tone === "accent" ? "accent" : "primary",
            "m",
          )}
        >
          {words.action}
        </button>
      ) : null}
    </section>
  );
}

export interface PlanPoint {
  key: string;
  label: string;
  /** "08:00" */
  at: string;
  done: boolean;
  kind: "dose" | "check" | "walk";
}

const minutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/**
 * The plan as a day (§5.6, web): a 06:00–22:00 timeline with a "Now" marker and tickable points, then the items
 * as rows. Every tick is a real button; ticks queue offline with a client key in the app (MR13). No dose amounts:
 * a medicine reads "As on your pharmacy label" (MR3).
 */
export function DayTimeline({
  points,
  now,
  onToggle,
}: {
  points: PlanPoint[];
  now: string;
  onToggle: (k: string) => void;
}) {
  const START = 6 * 60,
    END = 22 * 60;
  const pct = (t: string) =>
    `${Math.min(100, Math.max(0, ((minutes(t) - START) / (END - START)) * 100))}%`;
  return (
    <div className="flex flex-col gap-4">
      <div className="relative mx-3 h-14">
        <div className="bg-pw-line absolute top-1/2 h-0.5 w-full -translate-y-1/2" />
        <div
          className="absolute top-0 bottom-0 flex -translate-x-1/2 flex-col items-center"
          style={{ left: pct(now) }}
        >
          <span className="bg-pw-accent-text h-full w-0.5" />
          <span className="text-pw-accent-text absolute -bottom-4 text-[11px] font-semibold">
            {PL.now}
          </span>
        </div>
        {points.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={p.done}
            aria-label={(p.done ? PL.untick : PL.tick).replace("{item}", `${p.label}, ${p.at}`)}
            onClick={() => onToggle(p.key)}
            className={cn(
              "focus-visible:outline-pw-focus absolute top-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full focus-visible:outline-2",
            )}
            style={{ left: pct(p.at) }}
          >
            <span
              className={cn(
                "grid size-6 place-items-center rounded-full ring-2",
                p.done
                  ? "bg-pw-accent text-pw-on-accent ring-pw-accent"
                  : "bg-pw-surface ring-pw-line-strong",
              )}
            >
              {p.done ? <CheckIcon className="size-3.5" {...ICON} /> : null}
            </span>
          </button>
        ))}
        <div className="text-pw-ink-3 absolute -bottom-4 flex w-full justify-between text-[11px]">
          <span>06:00</span>
          <span>22:00</span>
        </div>
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {points.map((p) => (
          <li key={p.key}>
            <DoseRow point={p} onToggle={() => onToggle(p.key)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DoseRow({ point, onToggle }: { point: PlanPoint; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={point.done}
      onClick={onToggle}
      className="rounded-pw-row bg-pw-surface-2 focus-visible:outline-pw-focus flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left focus-visible:outline-2"
    >
      <span
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-full ring-2",
          point.done ? "bg-pw-accent text-pw-on-accent ring-pw-accent" : "ring-pw-line-strong",
        )}
      >
        {point.done ? <CheckIcon className="size-3.5" {...ICON} /> : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-semibold">{point.label}</span>
        <span className="text-pw-ink-3 text-[12px]">
          {point.at}
          {point.kind === "dose" ? ` · ${PL.label}` : ""}
        </span>
      </span>
      <span className="text-pw-ink-3 text-[12px]">{point.done ? PL.taken : PL.due}</span>
    </button>
  );
}
