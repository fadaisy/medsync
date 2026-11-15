import type { ReactNode } from "react";

import { tetherTitles } from "@/lib/landing/tether-host";

/** Patient sign-up is already drawn in Tide with its own Cancel and Help; on Tether its tab says Tether (ADR 0510). */
export const generateMetadata = tetherTitles;

export default function PwSignupLayout({ children }: { children: ReactNode }) {
  return children;
}
