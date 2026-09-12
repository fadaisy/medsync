import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Sticky bottom action bar for primary CTAs on patient surfaces.
 *
 *   - Below `md:`: pinned above the patient tab bar, for
 *     thumb-reachability on phones.
 *   - `md:` and up: in-flow at the bottom of its container with a
 *     right-aligned button row.
 *
 * **`sticky`, never `fixed`.** Every caller renders inside the patient
 * layout's `@container/page` wrapper, and `container-type: inline-size`
 * applies layout containment — which makes that wrapper the containing
 * block for `position: fixed` descendants. A fixed bar there is pinned to
 * the bottom of the page *content*, so it scrolls away and the clearance
 * arithmetic below is measured against the wrong box. `sticky` is immune
 * to containment: it resolves against the scrollport, so the bar floats
 * over scrolled content and comes to rest in flow at the end of the form.
 *
 * `bottom` clears the `MobileTabBar`, which is `fixed bottom-0` and sits a
 * layer above at `z-30` — left at `bottom-0` the tab bar covers the primary
 * CTA outright on every phone. 3.5rem covers the tab bar's own box (`pt-1.5`
 * plus a ~49px link: `py-1.5` + a 20px glyph + `gap-0.5` + an 11px/1.4
 * label) and the term after it covers that bar's safe-area padding, so the
 * two stack rather than overlap. Every caller in the repo is a patient
 * surface under that bar; one that isn't can pass `bottom-0` back through
 * `className`. The safe area is already spent by the bar below, so this one
 * pads flat.
 *
 * In flow it is a rounded, bordered surface rather than an edge-to-edge
 * slab: a sticky element is only as wide as its container, so a top border
 * alone would stop short of the screen edges and read as a broken rule.
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
        // Mobile: sticky above the tab bar, so it floats over scrolled
        // content instead of under the nav.
        "sticky bottom-[calc(3.5rem+max(env(safe-area-inset-bottom),0.5rem))] rounded-xl border px-4 py-3 shadow-lg supports-backdrop-filter:backdrop-blur",
        // Desktop: in-flow, right-aligned, no sticky positioning.
        "md:static md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none",
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
 * Breathing room under the bar. A sticky bar occupies its own row in the
 * flow, so nothing ends up underneath it any more and this no longer has to
 * reserve the bar's full height — it only keeps the resting bar off the tab
 * bar at the end of a scroll. No-op on `md:` and up.
 */
export function BottomActionBarSpacer({ className }: { className?: string }) {
  return <div className={cn("h-4 md:hidden", className)} aria-hidden />;
}
