import type { Metadata } from "next";
import type { ReactNode } from "react";

import { signedAvatarUrl } from "@/lib/avatars";
import { requireDoctorScope } from "@/lib/doctor/scope";
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
    </DoctorShell>
  );
}
