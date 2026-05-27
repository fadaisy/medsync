import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Sticky bottom action bar for primary CTAs on patient surfaces.
 *
 *   - Below `md:`: pinned to the bottom of the viewport, full-width,
 *     safe-area-padded for thumb-reachability on phones.
 *   - `md:` and up: in-flow at the bottom of its container with a
 *     right-aligned button row.
 *
 * The bar dims its own backdrop with a soft top shadow on mobile so
 * it never disappears against page content as the user scrolls.
 *
 * Use exactly one per screen. Layout in the children: `<div>` of
 * `<Button>`s; the bar handles spacing + safe-area.
 */
export function BottomActionBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border bg-background/95 supports-backdrop-filter:bg-background/80 z-20",
        // Mobile: fixed to viewport bottom with safe-area padding +
        // a soft shadow so it floats over scrolled content.
        "fixed inset-x-0 bottom-0 border-t px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.18)] supports-backdrop-filter:backdrop-blur",
        // Desktop: in-flow, right-aligned, no fixed positioning.
        "md:relative md:inset-auto md:bottom-auto md:border-t-0 md:bg-transparent md:p-0 md:shadow-none",
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-xl items-center justify-end gap-2 md:max-w-none">
        {children}
      </div>
    </div>
  );
}

/**
 * Spacer the surrounding scroll container can drop in so the last
 * row of content doesn't end up underneath the fixed BottomActionBar
 * on mobile. No-op on `md:` and up.
 */
export function BottomActionBarSpacer({ className }: { className?: string }) {
  return <div className={cn("h-24 md:hidden", className)} aria-hidden />;
}
