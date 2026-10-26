import type { ReactNode } from "react";

import { TideScope } from "@/components/medsync/tide-scope";

export default function TermsTideLayout({ children }: { children: ReactNode }) {
  return <TideScope group="public">{children}</TideScope>;
}
