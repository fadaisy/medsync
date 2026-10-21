import type { ReactNode } from "react";

import { TideScope } from "@/components/medsync/tide-scope";

export default function HmisTideLayout({ children }: { children: ReactNode }) {
  return <TideScope group="staff-other">{children}</TideScope>;
}
