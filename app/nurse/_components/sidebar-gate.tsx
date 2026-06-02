"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Hides the nurse-workspace sidebar on the full-page assessment surfaces
 * — the triage desk (/nurse/triage/[intakeId]) and the resus desk
 * (/nurse/resus/[episodeId]) — so they run full-bleed (a resus is run at
 * the bedside under pressure; chrome is a distraction). Every other nurse
 * route, incl. the triage + resus worklists, keeps the sidebar. The
 * shell's main column is flex-1, so it expands to fill the freed space.
 */
export function SidebarGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const fullBleed = /^\/nurse\/(triage|resus)\/[^/]+$/.test(pathname ?? "");
  if (fullBleed) return null;
  return <>{children}</>;
}
