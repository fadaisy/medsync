"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Hides the nurse-workspace sidebar on the full-page triage desk
 * (/nurse/triage/[intakeId]) so the assessment surface is full-bleed.
 * Every other nurse route (incl. the triage worklist /nurse/triage)
 * keeps the sidebar for navigation. The shell's main column is flex-1,
 * so it expands to fill the freed space.
 */
export function SidebarGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isTriageDesk = /^\/nurse\/triage\/[^/]+$/.test(pathname ?? "");
  if (isTriageDesk) return null;
  return <>{children}</>;
}
