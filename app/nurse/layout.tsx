import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ArrestAlarm } from "@/components/resus/arrest-alarm";
import { requireNurseScope } from "@/lib/nurse/scope";
import { resusDeskV2 } from "@/lib/resus/feature";
import { wardBuilderLiveFor } from "@/lib/wards/feature";
import { NurseShell } from "./_components/nurse-shell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function NurseLayout({ children }: { children: ReactNode }) {
  const scope = await requireNurseScope();
  return (
    <NurseShell scope={scope} flags={{ wardBuilder: wardBuilderLiveFor(scope.hospitalId) }}>
      {children}
      {resusDeskV2() ? (
        <ArrestAlarm hospitalId={scope.hospitalId} resusBase="/nurse/resus" />
      ) : null}
    </NurseShell>
  );
}
