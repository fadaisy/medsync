import type { ReactNode } from "react";

import { TideScope } from "@/components/medsync/tide-scope";

export default function EmergencyTideLayout({ children }: { children: ReactNode }) {
  return (
    <TideScope group="public" light>
      {children}
    </TideScope>
  );
}
