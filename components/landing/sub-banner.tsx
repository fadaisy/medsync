import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * §04 — Sub-banner highlight pill, sits just above the hero H1.
 *
 * Mirrors Attio's "Meet the Developer Platform, now with MCP" pill — one
 * tight line, one link target. Per spec rule: no overpromising and no
 * fake "new" feature names. Pilot recruitment is the honest "now" story.
 */
export function SubBanner() {
  return (
    <section aria-label="Pilot recruitment" className="flex w-full justify-center pt-4 pb-2">
      <Link
        href="/signup/hospital"
        className={cn(
          "group tap inline-flex items-center gap-2 rounded-full",
          "border-brand-200 bg-brand-50 text-brand-900 hover:bg-brand-100 border px-3 py-1.5 text-[12.5px]",
          "dark:border-brand-900 dark:bg-brand-50/10 dark:text-brand-100 dark:hover:bg-brand-50/15",
          "transition-colors duration-200 hover:shadow-sm",
        )}
      >
        <span className="relative flex size-1.5">
          <span className="bg-brand-500/60 absolute inset-0 animate-ping rounded-full motion-reduce:hidden" />
          <span className="bg-brand-500 dark:bg-brand-400 relative size-1.5 rounded-full" />
        </span>
        <span className="font-medium">
          <span className="font-mono text-[10px] tracking-[0.16em] uppercase">Live</span>
          <span aria-hidden className="mx-2 opacity-50">
            ·
          </span>
          <span>Now inviting founding hospital partners in Uganda</span>
        </span>
        <ArrowRightIcon
          className="ease-expo-out size-3 transition-transform duration-200 group-hover:translate-x-0.5"
          strokeWidth={2}
        />
      </Link>
    </section>
  );
}
