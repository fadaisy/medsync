import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Compact pill — for status, type, and other taxonomy values inside a table
 * cell or a list row. Tone maps to DESIGN-medsync.md clinical status colours.
 *
 * It lives here rather than in `data-table.tsx` for the same reason
 * `lib/patient/appointments.ts` keeps its constants out of a `server-only`
 * module: `data-table.tsx` is `"use client"` for the sortable table's
 * keyboard handling, and a `<span>` with a class map has no business dragging
 * that module into the bundle of every Server Component that shows a status.
 * `data-table.tsx` re-exports everything below, so existing importers across
 * the doctor, nurse, admin and hospital-admin surfaces are untouched.
 */
export type PillTone =
  | "neutral"
  | "stable"
  | "caution"
  | "critical"
  | "admitted"
  | "discharged"
  | "pending"
  | "sensitive"
  | "info"
  | "notice";

// The six clinical statuses resolve to the design-system status tokens, so a Pill
// and a ClinicalBadge render the same status identically. The tokens are defined
// in both :root and .dark (app/globals.css), so they flip on their own — no dark:
// variants here, and none wanted: a hand-written override would drift again.
const PILL_TONES: Record<PillTone, string> = {
  neutral: "bg-gray-100 text-gray-700",
  stable: "bg-status-stable-bg text-status-stable-fg",
  caution: "bg-status-caution-bg text-status-caution-fg",
  critical: "bg-status-critical-bg text-status-critical-fg",
  admitted: "bg-status-admitted-bg text-status-admitted-fg",
  discharged: "bg-status-discharged-bg text-status-discharged-fg",
  pending: "bg-status-pending-bg text-status-pending-fg",
  sensitive: "bg-status-caution-bg text-status-caution-fg ring-status-caution-fg/25 ring-1",
  // ADR 0095: two more non-clinical tones so every availability kind has its
  // own tint. Tailwind's own ramps, so these carry dark: variants themselves.
  info: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200",
  notice: "bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-200",
};

export interface PillProps {
  tone?: PillTone;
  children: ReactNode;
  className?: string;
}

export function Pill({ tone = "neutral", children, className }: PillProps) {
  return (
    <span
      className={cn(
        "text-caption inline-flex items-center rounded px-2 py-0.5 font-medium",
        PILL_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
