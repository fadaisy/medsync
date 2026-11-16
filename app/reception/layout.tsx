import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";

import { TideScope } from "@/components/medsync/tide-scope";
import { isTetherHost } from "@/lib/landing/feature";
import { receptionDeskLiveFor } from "@/lib/reception/feature";
import { requireReceptionScope } from "@/lib/reception/scope";
import { ReceptionShell } from "./_components/reception-shell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function ReceptionLayout({ children }: { children: ReactNode }) {
  const scope = await requireReceptionScope();
  // The same rule as app/reception/page.tsx: on Tether, or behind RECEPTION_DESK, `/reception` is the desk.
  const deskLive =
    isTetherHost((await headers()).get("host")) || receptionDeskLiveFor(scope.hospitalId);
  return (
    <ReceptionShell scope={scope} deskLive={deskLive}>
      <TideScope group="reception">{children}</TideScope>
    </ReceptionShell>
  );
}
