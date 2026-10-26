import type { ReactNode } from "react";

import { PatientShell } from "@/components/tide/shell";

/**
 * Help and safety (Step 7): outside app/pw/patient, so no rail, no patient scope and no redirect; it opens
 * signed out (ADR 0098 ruling 7, S23). Forced light on every page here (L11, S22): Help, the lines, the calm
 * screens and the pre-alert keep their light values under the OS's dark mode and the app's Dark theme.
 */
export default function HelpLayout({ children }: { children: ReactNode }) {
  return (
    <PatientShell bare light>
      {children}
    </PatientShell>
  );
}
