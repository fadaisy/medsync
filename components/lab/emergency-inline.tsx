import Link from "next/link";
import { SirenIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The Emergency link for a workspace top bar (Lab Workspace v2, prompt 5.1): the same red pill and the same
 * word, in the page instead of floating. `data-emergency-inline` stands the floating pill down, so a page
 * never shows two and never none.
 */
export function EmergencyInline({ label, className }: { label: string; className?: string }) {
  return (
    <Link
      href="/emergency"
      data-emergency-inline
      aria-label={`${label} — get help now`}
      className={cn(
        buttonVariants({ variant: "emergency", size: "md" }),
        "h-9 rounded-full px-3.5 shadow-[0_6px_16px_-6px_rgba(220,38,38,0.6)]",
        className,
      )}
    >
      <SirenIcon aria-hidden className="size-4" strokeWidth={2} />
      {label}
    </Link>
  );
}
