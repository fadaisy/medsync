"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Hides the doctor-workspace chrome (sidebar + top bar) on the full-page
 * bedside surfaces — the resus desk (/doctor/resus/[episodeId]), the triage
 * desk (/doctor/triage/[intakeId]) and the encounter clerking workspace
 * (/doctor/encounters/[encounterId]) — so they run full-bleed, matching the
 * nurse SidebarGate. Every other doctor route keeps the chrome.
 */
export function FullBleedGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const fullBleed = /^\/doctor\/(resus|triage|encounters)\/[^/]+$/.test(pathname ?? "");
  if (fullBleed) return null;
  return <>{children}</>;
}
