import type { ReactNode } from "react";

import { TideScope } from "@/components/medsync/tide-scope";

export default function PrivacyTideLayout({ children }: { children: ReactNode }) {
  return <TideScope group="public">{children}</TideScope>;
}
