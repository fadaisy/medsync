import type { RowTint } from "@/lib/patient/doses";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  ActivityIcon,
  CalendarIcon,
  HeartIcon,
  HospitalIcon,
  PillIcon,
  SettingsIcon,
  ShieldIcon,
  UserIcon,
} from "lucide-react";

import { TINT_GLYPH, TINT_ROW } from "@/lib/patient/doses";
import { cn } from "@/lib/utils";

export type TintedRowIconKey =
  | "pill"
  | "activity"
  | "calendar"
  | "hospital"
  | "user"
  | "settings"
  | "shield"
  | "heart";

const ICONS: Record<TintedRowIconKey, LucideIcon> = {
  pill: PillIcon,
  activity: ActivityIcon,
  calendar: CalendarIcon,
  hospital: HospitalIcon,
  user: UserIcon,
  settings: SettingsIcon,
  shield: ShieldIcon,
  heart: HeartIcon,
};

export interface TintedRowProps {
  /** Recognition aid only. `rowTint(id)` for medications; `neutral` for a
   * stopped one, which must then ship a "Stopped" pill in `trailing`. */
  tint: RowTint;
  iconKey: TintedRowIconKey;
  title: string;
  subtitle?: string;
  /** A third, quieter line under the sub-line — a caveat about the row
   * itself ("Suggested time"), never state. */
  note?: string;
  /** Whole row is a link — unless `trailing` is also given, in which case
   * the link covers glyph + text and `trailing` stays outside it. */
  href?: string;
  /** A `DoseStatus`, a `Pill`, a mono counter, a chevron, or a ≥44px
   * control. Never nested inside the row's own link. */
  trailing?: ReactNode;
  /** Let `trailing` fall onto its own line instead of squeezing the title.
   * For the narrow columns — the timeline's card column is ~190px on a
   * 320px phone, where a name, a state word and a 44px control cannot share
   * one line. Ignored when the row is a link. */
  wrap?: boolean;
  className?: string;
}

/**
 * The workhorse row of the patient workspace: a soft full-bleed tint, a
 * round glyph, a name, a sub-line, and one trailing element. It replaces
 * three divergent renderings of the same row (medication, dose, menu
 * destination) — no border, no ring, and no left-edge accent bar.
 *
 * Renders an `<li>`: every consumer is a list, and the row is the thing
 * `stagger-children` animates. It must live inside a `<ul>` or `<ol>`.
 *
 * The three laws of the tint are enforced by this component's *shape*, not
 * by a convention anyone has to remember:
 *
 *   1. Never load-bearing. `tint` reaches exactly two background class
 *      strings and nothing else branches on it, so deleting every tint from
 *      the stylesheet leaves the row fully readable.
 *   2. Never clinical. There is no `state` prop. State can only enter
 *      through `trailing`, whose every sanctioned occupant carries a word.
 *   3. Always paired. `title` is required, so a tinted row with no name is
 *      unrepresentable, and the glyph is `aria-hidden` — the name beside it
 *      is the accessible name.
 */
export function TintedRow({
  tint,
  iconKey,
  title,
  subtitle,
  note,
  href,
  trailing,
  wrap = false,
  className,
}: TintedRowProps) {
  const Icon = ICONS[iconKey];

  const body = (
    <>
      <span
        aria-hidden
        className={cn("grid size-10 shrink-0 place-items-center rounded-full", TINT_GLYPH[tint])}
      >
        <Icon strokeWidth={1.5} className="size-5" />
      </span>
      <span className={cn("min-w-0 flex-1", wrap && "basis-36")}>
        <span className="text-foreground text-body-m block truncate font-medium">{title}</span>
        {subtitle ? (
          <span className="text-muted-foreground text-body-s block truncate">{subtitle}</span>
        ) : null}
        {note ? (
          <span className="text-muted-foreground text-caption block truncate">{note}</span>
        ) : null}
      </span>
    </>
  );

  // `tap` supplies the press scale and the focus ring, both self-gated.
  // No `card-lift`: it hover-lifts and sharpens a border this row
  // deliberately doesn't have, and on a phone it never fires at all.
  const box = cn(
    "flex min-h-16 items-center rounded-lg px-4 py-3",
    wrap ? "flex-wrap gap-x-3 gap-y-2" : "gap-3",
    TINT_ROW[tint],
    className,
  );
  const hover = "md:hover:brightness-[0.98] dark:md:hover:brightness-110";
  // Wrapped, the trailing block is what drops to the second line, so it
  // takes the leftover space and lays its own children out in a row.
  const trailingBox = cn("shrink-0", wrap && "ml-auto flex items-center gap-2");

  if (href && !trailing) {
    return (
      <li>
        <Link href={href} className={cn(box, "tap", hover)}>
          {body}
        </Link>
      </li>
    );
  }

  // A link and an interactive trailing control must never nest, so the row
  // becomes a plain box: the link takes the glyph and the text (stretched to
  // the full row height, so it stays a comfortable target), the control
  // stands beside it.
  if (href) {
    return (
      <li className={box}>
        <Link
          href={href}
          className={cn(
            "tap flex min-w-0 flex-1 items-center gap-3 self-stretch rounded-lg",
            hover,
          )}
        >
          {body}
        </Link>
        <span className={trailingBox}>{trailing}</span>
      </li>
    );
  }

  return (
    <li className={box}>
      {body}
      {trailing ? <span className={trailingBox}>{trailing}</span> : null}
    </li>
  );
}
