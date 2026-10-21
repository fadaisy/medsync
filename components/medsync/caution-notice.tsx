import type { ReactNode } from "react";
import { InfoIcon, TriangleAlertIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Standing information that says what MedSync is not doing (Lab Phase 0 §5.6, Pharmacy Phase 0
 * §5.6). `role="status"`, not an alert, and no close button. Caution is amber with a triangle and
 * the words, never colour alone; neutral is the info variant (the pharmacy's cart notice).
 */
export function CautionNotice({
  lead,
  children,
  tone = "caution",
}: {
  lead: string;
  children?: ReactNode;
  tone?: "caution" | "neutral";
}) {
  const Icon = tone === "caution" ? TriangleAlertIcon : InfoIcon;
  return (
    <div
      role="status"
      className={cn(
        "text-body-s flex items-start gap-2.5 rounded-lg border px-3.5 py-3",
        tone === "caution"
          ? "bg-status-caution-bg border-status-caution-bg dark:text-status-caution-fg text-amber-800"
          : "bg-muted border-border text-foreground",
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      {/* A div, not a p: children may hold a list (the pharmacy's carts notice). */}
      <div>
        <strong className="font-semibold">{lead}</strong> {children}
      </div>
    </div>
  );
}
