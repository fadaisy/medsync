import type { ReactNode } from "react";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A collapsible segment of the side panel (owner, 2026-10-08): the native <details>, so it opens
 * and closes with no state of ours, from the keyboard too. `aside` sits beside the title (a count,
 * a status word, a button); a button there should `preventDefault` so it does not fold the segment.
 */
export function Fold({
  title,
  aside,
  level = "segment",
  defaultOpen = true,
  className,
  children,
}: {
  title: ReactNode;
  aside?: ReactNode;
  /** "segment": a panel heading (Flags, Diabetes, Note); "part": a heading inside one. */
  level?: "segment" | "part";
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className={cn("group/fold", className)}>
      <summary className="focus-visible:shadow-focus flex cursor-pointer list-none items-center justify-between gap-3 rounded-xs outline-none [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-1.5">
          <ChevronDownIcon
            aria-hidden
            className="text-muted-foreground ease-expo-out size-3.5 shrink-0 -rotate-90 transition-transform duration-150 group-open/fold:rotate-0 motion-reduce:transition-none"
          />
          <span
            className={
              level === "segment"
                ? "text-heading-s text-foreground"
                : "text-caption text-muted-foreground tracking-[0.06em] uppercase"
            }
          >
            {title}
          </span>
        </span>
        {aside}
      </summary>
      <div className={level === "segment" ? "pt-3" : "pt-1.5"}>{children}</div>
    </details>
  );
}
