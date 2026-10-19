import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";
import { CheckIcon, ClockIcon, TriangleAlertIcon } from "lucide-react";

import { LABWS2 } from "@/content/lab-workspace-v2";
import { cn } from "@/lib/utils";

/**
 * Lab Workspace v2 field kit, the parts with no state (prompt 5.12, Section 7): pills, empty states, figure
 * values, panels and key figures. Tokens only. Red never appears here: a critical is `CriticalPill` from
 * components/emr/status-word.tsx, and Emergency is `EmergencyInline`. Nothing in the lab is green.
 */

export type PillTone = "neutral" | "caution" | "passed" | "lagoon";

const PILL: Record<PillTone, string> = {
  neutral: "bg-tide-sunken text-ink-600",
  // Amber with its word and glyph: late, held, delta waiting, overdue, quarantined, down (Law 8).
  caution: "bg-status-caution-bg text-amber-800 shadow-[inset_0_0_0_1px_var(--tide-caution-edge)]",
  // "Passed" is neutral with a check (Law 8: nothing green).
  passed: "bg-card text-ink-700 shadow-[inset_0_0_0_1px_var(--color-ink-300)]",
  lagoon: "bg-tide-lagoon-tint text-teal-900",
};
const PILL_ICON: Partial<Record<PillTone, LucideIcon>> = {
  caution: TriangleAlertIcon,
  passed: CheckIcon,
};

/** A rounded state word. Caution and passed always carry a glyph; colour is never the only signal. */
export function Pill({
  tone = "neutral",
  glyph,
  className,
  children,
}: {
  tone?: PillTone;
  glyph?: LucideIcon | null;
  className?: string;
  children: ReactNode;
}) {
  const Icon = glyph === null ? null : (glyph ?? PILL_ICON[tone]);
  return (
    <span
      data-tone={tone}
      className={cn(
        "text-caption inline-flex h-6 w-fit shrink-0 items-center gap-1 rounded-full px-2.5 font-medium whitespace-nowrap",
        PILL[tone],
        className,
      )}
    >
      {Icon ? <Icon aria-hidden className="size-3 shrink-0" /> : null}
      {children}
    </span>
  );
}

/** "Late {n} min": amber, with the clock, only when the engine says late. */
export function LatePill({ children }: { children: ReactNode }) {
  return (
    <Pill tone="caution" glyph={ClockIcon}>
      {children}
    </Pill>
  );
}

/**
 * Three kinds of nothing (Law 7): `empty` (a list with nothing in it: why, and what next), `no_data` (a figure
 * with nothing recorded, muted, never 0) and `not_set` (a setting nobody has made: who can set it, and the link
 * for that person only). No dashed boxes.
 */
export function EmptyState({
  title,
  why,
  next,
  action,
  compact,
  className,
}: {
  title: string;
  why?: string;
  next?: string;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      data-empty
      className={cn(
        "bg-muted/60 rounded-tide-tile flex flex-col gap-1",
        compact ? "px-4 py-3" : "px-5 py-6",
        className,
      )}
    >
      <p className="text-body-s text-foreground font-semibold">{title}</p>
      {why ? <p className="text-body-s text-muted-foreground max-w-prose">{why}</p> : null}
      {next ? <p className="text-body-s text-muted-foreground max-w-prose">{next}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** "Not set": names who can set it; the link only for the person who may. */
export function NotSet({
  label = LABWS2.kit.notSet,
  href,
  canSet,
}: {
  label?: string;
  href: string;
  canSet: boolean;
}) {
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="text-muted-foreground font-medium">{label}</span>
      {canSet ? (
        <Link href={href} className="text-body-s text-primary underline-offset-4 hover:underline">
          {LABWS2.kit.setIt}
        </Link>
      ) : (
        <span className="text-body-s text-muted-foreground">{LABWS2.kit.askLead}</span>
      )}
    </span>
  );
}

/**
 * A figure in the text face (never code type, Law 7). `null` is "No data", muted; 0 is a real zero.
 */
export function FigureValue({
  value,
  unit,
  noData = LABWS2.kit.noData,
  className,
}: {
  value: number | string | null;
  unit?: string;
  noData?: string;
  className?: string;
}) {
  if (value === null)
    return (
      <span className={cn("text-muted-foreground text-body-m font-medium", className)}>
        {noData}
      </span>
    );
  return (
    <span className={cn("text-foreground font-semibold tabular-nums", className)}>
      {value}
      {unit ? (
        <span className="text-muted-foreground ml-1 text-[0.55em] font-medium">{unit}</span>
      ) : null}
    </span>
  );
}

/** A white card at desk density: title row, optional note, body. */
export function Panel({
  title,
  note,
  action,
  className,
  children,
  as: As = "section",
  labelledBy,
}: {
  title?: ReactNode;
  note?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
  as?: "section" | "div";
  labelledBy?: string;
}) {
  return (
    <As
      aria-labelledby={labelledBy}
      className={cn(
        "bg-card shadow-tide-card rounded-tide-card flex min-w-0 flex-col gap-3 p-4",
        className,
      )}
    >
      {title || action ? (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title ? (
              <h2 id={labelledBy} className="text-heading-s text-foreground">
                {title}
              </h2>
            ) : null}
            {note ? <p className="text-caption text-muted-foreground mt-0.5">{note}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </As>
  );
}

/** One key figure: label, value with unit, a sparkline slot and the change line in ink, linked to its records. */
export function KeyFigure({
  label,
  value,
  unit,
  spark,
  change,
  sub,
  href,
  noData,
}: {
  label: string;
  value: number | string | null;
  unit?: string;
  spark?: ReactNode;
  change?: ReactNode;
  sub?: ReactNode;
  href?: string;
  noData?: string;
}) {
  const body = (
    <>
      <span className="text-caption text-muted-foreground font-medium">{label}</span>
      <span className="flex items-end justify-between gap-2">
        <FigureValue
          value={value}
          unit={unit}
          noData={noData}
          className="text-[26px] leading-[30px]"
        />
        {spark}
      </span>
      {change ? <span className="text-caption text-ink-700">{change}</span> : null}
      {sub ? <span className="text-caption text-muted-foreground">{sub}</span> : null}
    </>
  );
  const cls = "flex min-w-0 flex-col gap-1 rounded-tide-tile p-3";
  return href ? (
    <Link href={href} className={cn(cls, "hover:bg-muted focus-visible:shadow-focus outline-none")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Grid of key figures inside one panel, divided by hairlines. */
export function KeyFigureGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-1 md:grid-cols-3 xl:grid-cols-6 [&>*]:min-w-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Identifier text: Geist Mono, the only place code type is allowed (Law 7). */
export function Ident({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono text-[12.5px] tabular-nums", className)}>{children}</span>;
}

/** Two identifiers, always together (Law 5). */
export function TwoIds({
  name,
  mrn,
  className,
}: {
  name: string;
  mrn: string;
  className?: string;
}) {
  return (
    <span className={cn("flex min-w-0 flex-col", className)}>
      <span className="text-foreground truncate font-medium">{name}</span>
      <Ident className="text-muted-foreground">{mrn}</Ident>
    </span>
  );
}
