import type { ReactNode } from "react";

import { TideScope } from "@/components/medsync/tide-scope";

export default function NurseResusTideLayout({ children }: { children: ReactNode }) {
  return <TideScope group="resus" light>{children}</TideScope>;
}
