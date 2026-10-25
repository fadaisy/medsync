import type { ReactNode } from "react";
import Link from "next/link";
import {
  ActivityIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  DropletIcon,
  FootprintsIcon,
  PillIcon,
  UtensilsIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { ICON } from "./kit";

/**
 * The day cascade (§5.4, the phone's `cascade.tsx`): cards stacked earliest first, each sliding 32 px under
 * the one before (more than the 28 px radius, so no square corner peeks out). Tone changes with time, never
 * with topic: navy, ocean, sea. The Now card (lagoon) or a quiet done card closes the stack.
 */

const TONE = ["bg-pw-cascade-1", "bg-pw-cascade-2", "bg-pw-cascade-3"] as const;
const ICONS = {
  pill: PillIcon,
  activity: ActivityIcon,
  walk: FootprintsIcon,
  utensils: UtensilsIcon,
  droplet: DropletIcon,
} as const;

export function Cascade({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ol aria-label={label} className="flex flex-col">
      {children}
    </ol>
  );
}

/** One stacked item; every one after the first tucks 32 px under the one above. */
export function CascadeItem({ index, children }: { index: number; children: ReactNode }) {
  return (
    <li className={cn("relative", index > 0 && "-mt-8")} style={{ zIndex: index }}>
      {children}
    </li>
  );
}

export function CascadeStep({
  tone,
  icon,
  title,
  line,
  done,
  href,
  last,
}: {
  tone: 0 | 1 | 2;
  icon: keyof typeof ICONS;
  title: string;
  line: string;
  done: boolean;
  href: string;
  /** The bottom card shows its own bottom corners and needs no tuck room. */
  last: boolean;
}) {
  const Icon = ICONS[icon];
  return (
    <Link
      href={href}
      className={cn(
        "text-pw-on-band rounded-t-pw-cascade flex items-center gap-3 px-[18px] pt-3.5",
        "focus-visible:outline-pw-focus focus-visible:outline-2 focus-visible:outline-offset-2",
        "transition-[filter] duration-150 ease-out hover:brightness-110 motion-reduce:transition-none",
        last ? "rounded-b-pw-cascade pb-3.5" : "pb-[46px]",
        TONE[tone],
      )}
    >
      <span className="bg-pw-band-glass grid size-9 shrink-0 place-items-center rounded-full">
        <Icon className="size-[18px]" {...ICON} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] leading-[22px] font-semibold">{title}</span>
        <span className="text-pw-on-band-2 block text-sm leading-5 font-medium">{line}</span>
      </span>
      {done ? (
        <span className="bg-pw-surface text-pw-ink grid size-[30px] shrink-0 place-items-center rounded-full">
          <CheckIcon className="size-[15px]" strokeWidth={3} aria-hidden />
        </span>
      ) : (
        <ChevronRightIcon className="size-5 shrink-0" {...ICON} />
      )}
    </Link>
  );
}

/** The lagoon card for the dose due now: the one decision the day asks for. */
export function NowCard({
  pill,
  overline,
  title,
  line,
  actions,
}: {
  pill: string;
  overline: string;
  title: string;
  line: string;
  actions: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="rounded-pw-cascade bg-pw-accent text-pw-on-accent shadow-pw-accent flex flex-col gap-2 p-[18px]"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="bg-pw-surface text-pw-ink inline-flex h-7 items-center rounded-full px-[11px] text-xs font-semibold">
          {pill}
        </span>
        <span className="text-xs leading-4 font-semibold tracking-[0.06em] uppercase">
          {overline}
        </span>
      </div>
      <h3 className="text-[22px] leading-7 font-semibold tracking-[-0.015em]">{title}</h3>
      <p className="text-[15px] leading-[21px] font-medium">{line}</p>
      <div className="mt-1 flex flex-wrap gap-2">{actions}</div>
    </section>
  );
}

/** The last card of the day when nothing is due: the next dose, or nothing, quietly. */
export function DoneCard({ title, line }: { title: string; line: string }) {
  return (
    <div className="rounded-pw-cascade bg-pw-surface shadow-pw-card flex items-center gap-3 p-[18px]">
      <span className="bg-pw-surface-2 text-pw-area-medicines grid size-9 shrink-0 place-items-center rounded-full">
        <ClockIcon className="size-[18px]" {...ICON} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[17px] leading-[22px] font-semibold">{title}</p>
        <p className="text-pw-ink-2 text-sm leading-5 font-medium">{line}</p>
      </div>
    </div>
  );
}
