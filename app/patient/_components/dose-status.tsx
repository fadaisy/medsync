import type { SlotState } from "@/lib/patient/doses";
import type { LucideIcon } from "lucide-react";
import { CheckIcon, ClockIcon, MinusIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The dose-state triple: a tint, an icon and a visible word — all three,
 * every time. This is the only component on the patient surface allowed to
 * say what happened to a dose, which is why it exists: the same triple was
 * being hand-rendered in four places, and getting it wrong once is how red
 * ends up on a forgotten metformin.
 *
 * Amber and a minus, where every reference design reaches for red and a
 * cross. On a MedSync surface red means a clinician has declared a life
 * threat, and nothing in the patient self-tracking model can produce one —
 * spending red here trains the patient to ignore red where it matters. The
 * cross is refused at glyph level for the same reason: an X-in-a-circle is
 * the universal *error* mark, and amber-plus-X is a mixed signal.
 *
 * `open` is a transparent outline rather than `bg-status-pending-bg`
 * because that token is #262626 in dark, which is exactly `bg-card` — the
 * chip would vanish into the surface it sits on.
 *
 * The chip does not animate. It used to carry `scale-in`, whose comment
 * claimed it played "when a slot flips to taken" — but that utility is an
 * unconditional `animation … both` on `--ease-spring`, so what it actually
 * did was bounce every dose chip in the timeline on first paint, on top of
 * the `stagger-children` already running on the same list. A spring
 * overshoot on the one component allowed to say what happened to a dose is
 * decoration on a clinical read-out.
 */
const MARK: Record<SlotState, { glyph: string; Icon: LucideIcon }> = {
  taken: { glyph: "bg-status-stable-bg text-status-stable-fg", Icon: CheckIcon },
  missed: { glyph: "bg-status-caution-bg text-status-caution-fg", Icon: MinusIcon },
  open: { glyph: "border-border text-muted-foreground border bg-transparent", Icon: ClockIcon },
};

export interface DoseStatusProps {
  state: SlotState;
  /**
   * From `slotStateLabel()` — "Taken 08:12", "Missed", "Due 20:00",
   * "Scheduled", "No entry". Always rendered: this chip is never icon-only,
   * because the icon and the tint would then be carrying state alone.
   */
  label: string;
  /**
   * `indicator` (default) is a 24px read-only mark. `control` is 44px so a
   * taken slot occupies the same box as the 44px "mark taken" button an
   * open slot renders in that position — the row does not reflow on the
   * flip, and the two never look like different kinds of thing.
   */
  size?: "indicator" | "control";
}

export function DoseStatus({ state, label, size = "indicator" }: DoseStatusProps) {
  const { glyph, Icon } = MARK[state];
  const control = size === "control";

  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden
        className={cn(
          "grid shrink-0 place-items-center rounded-full",
          control ? "size-11" : "size-6",
          glyph,
        )}
      >
        <Icon strokeWidth={1.5} className={control ? "size-5" : "size-3.5"} />
      </span>
      <span className="text-muted-foreground text-caption tabular">{label}</span>
    </span>
  );
}
