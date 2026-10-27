import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// Not a client component: server pages pass `icon` as a component, which cannot cross into a client file.
/** An inbox row (boards 1 and 4): icon tile, what, when, one action. */
export function InboxRow({
  icon: Icon,
  text,
  sub,
  at,
  action,
  attention,
}: {
  icon: LucideIcon;
  text: ReactNode;
  sub?: ReactNode;
  at?: ReactNode;
  action?: ReactNode;
  /** Amber tile with the glyph (the item is late or a difference); the text still says why. */
  attention?: boolean;
}) {
  return (
    <li className="border-border flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
      <span
        aria-hidden
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-[12px]",
          attention
            ? "bg-status-caution-bg text-amber-800 shadow-[inset_0_0_0_1px_var(--tide-caution-edge)]"
            : "bg-tide-sunken text-ink-700",
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-body-s text-foreground">{text}</div>
        {sub ? <div className="text-caption text-muted-foreground">{sub}</div> : null}
      </div>
      {at ? <span className="text-caption text-muted-foreground shrink-0 tabular-nums">{at}</span> : null}
      {action ? <div className="shrink-0">{action}</div> : null}
    </li>
  );
}
