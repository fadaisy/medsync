import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Two-column layout used by the multi-step signup pages.
 *
 *   ┌─────────────────────────────┬────────────────────┐
 *   │ form (steps, fields)        │ aside              │
 *   │ ~600px on lg+               │ ~340px on lg+      │
 *   │                             │ (steps + context)  │
 *   └─────────────────────────────┴────────────────────┘
 *
 * On `<lg` viewports the aside collapses below the form so mobile
 * users see the form first. The aside on mobile keeps just the
 * reassurance card; the step list is only shown above the form on
 * mobile (collapsed into pill-style horizontal tabs in the form
 * itself).
 */

interface SignupColumnsProps {
  form: ReactNode;
  aside: ReactNode;
  /** When true, render the aside above the form on mobile (rare; usually false). */
  asideOnTopMobile?: boolean;
}

export function SignupColumns({ form, aside, asideOnTopMobile }: SignupColumnsProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-8",
        "lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10",
        asideOnTopMobile && "flex flex-col-reverse lg:grid",
      )}
    >
      <div className="min-w-0">{form}</div>
      <aside className="flex flex-col gap-4">{aside}</aside>
    </div>
  );
}
