import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export type ClinicalStatus =
  | "stable"
  | "critical"
  | "caution"
  | "admitted"
  | "discharged"
  | "pending";

const statusStyles: Record<ClinicalStatus, string> = {
  stable: "bg-status-stable-bg text-status-stable-fg",
  critical: "bg-status-critical-bg text-status-critical-fg",
  caution: "bg-status-caution-bg text-status-caution-fg",
  admitted: "bg-status-admitted-bg text-status-admitted-fg",
  discharged: "bg-status-discharged-bg text-status-discharged-fg",
  pending: "bg-status-pending-bg text-status-pending-fg",
};

interface ClinicalBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status: ClinicalStatus;
}

export function ClinicalBadge({ status, className, children, ...props }: ClinicalBadgeProps) {
  return (
    <span
      data-slot="clinical-badge"
      data-status={status}
      className={cn(
        "inline-flex items-center justify-center px-2.5 py-0.5",
        "text-[11px] leading-[1.4] font-medium",
        "rounded-[5px]",
        statusStyles[status],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
