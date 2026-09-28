import type { Badge, DeskSection } from "@/lib/clerking/flags";
import { useId } from "react";
import { LockIcon, OctagonAlertIcon, TriangleAlertIcon } from "lucide-react";

import { lc } from "@/lib/clerking/compose";
import { cn } from "@/lib/utils";

/**
 * The Flags panel (§5.9, D-CV-03, Law 8 as amended): the one place flag badges live. Urgent badges
 * take the critical tint with an octagon, caution badges amber with a triangle; each is a button to
 * the section it came from, named with its words plus "urgent" or "needs attention", and its title
 * and description give every reason with where it came from. Decision support only: nothing here
 * blocks, orders or writes (Law 6). toBadges() has already merged same words and filtered
 * restricted flags by access.
 */

/** The only red in the clerking desk outside a NEWS2 score of 3: an urgent flag badge. */
const URGENT = "bg-status-critical-bg text-red-700 dark:text-status-critical-fg";
const CAUTION = "bg-status-caution-bg text-amber-800 dark:text-status-caution-fg";

export const reasonsOf = (b: Badge) =>
  b.reasons.map((r) => `${r.where}: ${lc(r.reason)}`).join("; ");

export function FlagsPanel({
  badges,
  onGo,
}: {
  badges: readonly Badge[];
  /** The badge too, so an examination badge can open the system and part it came from. */
  onGo?: (section: DeskSection, badge: Badge) => void;
}) {
  const id = useId();
  const urgent = badges.filter((b) => b.level === "urgent").length;
  const Count = urgent ? OctagonAlertIcon : TriangleAlertIcon;
  return (
    <section aria-labelledby="clerking-flags-heading" className="flex flex-col gap-3 px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="clerking-flags-heading" className="text-heading-s text-foreground">
          Flags
        </h2>
        {badges.length ? (
          <span
            className={cn(
              "text-caption inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold",
              urgent ? URGENT : CAUTION,
            )}
          >
            <Count aria-hidden className="size-3" />
            {badges.length}
            <span className="sr-only">{`${badges.length === 1 ? " flag" : " flags"}, ${urgent} urgent`}</span>
          </span>
        ) : null}
      </div>
      {badges.length ? (
        <ul aria-label="Flags" className="flex flex-wrap gap-2">
          {badges.map((b, i) => {
            const Icon = b.level === "urgent" ? OctagonAlertIcon : TriangleAlertIcon;
            const reasons = reasonsOf(b);
            return (
              <li key={b.label}>
                <button
                  type="button"
                  data-level={b.level}
                  title={reasons}
                  aria-label={`${b.label}, ${b.level === "urgent" ? "urgent" : "needs attention"}`}
                  aria-describedby={`${id}-${i}`}
                  onClick={() => onGo?.(b.section, b)}
                  className={cn(
                    "text-caption focus-visible:shadow-focus inline-flex h-[26px] items-center gap-1.5 rounded-full px-2.5 font-semibold outline-none pointer-coarse:h-11",
                    b.level === "urgent" ? URGENT : CAUTION,
                  )}
                >
                  <Icon aria-hidden className="size-3.5 shrink-0" />
                  {b.label}
                  {b.restricted ? <LockIcon aria-hidden className="size-3 shrink-0" /> : null}
                </button>
                <span id={`${id}-${i}`} hidden>
                  {reasons}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-caption text-muted-foreground">Nothing flagged so far.</p>
      )}
    </section>
  );
}

/**
 * Phone only (D-CM-04): a flag's badge where its answer is (a complaint row, a positive system
 * item), with the same words, icon and tint as the Flags list. Not a button: the Note sheet holds
 * the list and its jumps.
 */
export function InlineBadges({ badges }: { badges: readonly Badge[] }) {
  if (!badges.length) return null;
  return (
    <ul aria-label="Flags for this answer" className="flex flex-wrap gap-1.5 sm:hidden">
      {badges.map((b) => {
        const Icon = b.level === "urgent" ? OctagonAlertIcon : TriangleAlertIcon;
        return (
          <li
            key={b.label}
            title={reasonsOf(b)}
            className={cn(
              "text-body-s inline-flex h-6 items-center gap-1.5 rounded-full px-2 font-semibold",
              b.level === "urgent" ? URGENT : CAUTION,
            )}
          >
            <Icon aria-hidden className="size-3 shrink-0" />
            {b.label}
            <span className="sr-only">
              {b.level === "urgent" ? ", urgent" : ", needs attention"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** The badges for one answer: same section, and the answer is among their sources. */
export const badgesAt = (badges: readonly Badge[], section: DeskSection, where: string) =>
  badges.filter((b) => b.section === section && b.reasons.some((r) => r.where === where));

/** The Note button's count (§4.3): critical tint with any urgent flag, amber with caution only. */
export function FlagCount({ badges }: { badges: readonly Badge[] }) {
  const urgent = badges.some((b) => b.level === "urgent");
  const Icon = urgent ? OctagonAlertIcon : TriangleAlertIcon;
  return (
    <span
      aria-hidden
      className={cn(
        "text-body-s inline-flex h-[22px] min-w-5 items-center justify-center gap-1 rounded-full px-1.5 font-mono font-semibold",
        urgent ? URGENT : badges.length ? CAUTION : "bg-muted text-muted-foreground",
      )}
    >
      {badges.length ? <Icon className="size-3 shrink-0" /> : null}
      {badges.length}
    </span>
  );
}
