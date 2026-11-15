import type { ReactNode } from "react";

import { TideScope } from "@/components/medsync/tide-scope";
import { onTetherHost, tetherTitles } from "@/lib/landing/tether-host";

export const generateMetadata = tetherTitles;

/** On the Tether domain the wait after signing up is Tether's too: Tide, and the Tether name (ADR 0510). */
export default async function OnboardingTideLayout({ children }: { children: ReactNode }) {
  return (
    <TideScope group="public" force={await onTetherHost()}>
      {children}
    </TideScope>
  );
}
