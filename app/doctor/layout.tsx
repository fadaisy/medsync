import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ArrestAlarm } from "@/components/resus/arrest-alarm";
import { signedAvatarUrl } from "@/lib/avatars";
import { requireDoctorScope } from "@/lib/doctor/scope";
import { resusDeskV2 } from "@/lib/resus/feature";
import { DoctorShell } from "./_components/doctor-shell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DoctorLayout({ children }: { children: ReactNode }) {
  const scope = await requireDoctorScope();
  const avatarUrl = await signedAvatarUrl(scope.avatarPath);
  return (
    <DoctorShell scope={scope} avatarUrl={avatarUrl}>
      {children}
      {resusDeskV2() ? (
        <ArrestAlarm hospitalId={scope.hospitalId} resusBase="/doctor/resus" />
      ) : null}
    </DoctorShell>
  );
}
