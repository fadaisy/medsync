import type { Metadata } from "next";
import type { ReactNode } from "react";

import { requireDoctorScope } from "@/lib/doctor/scope";
import { DoctorShell } from "./_components/doctor-shell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DoctorLayout({ children }: { children: ReactNode }) {
  const scope = await requireDoctorScope();
  return <DoctorShell scope={scope}>{children}</DoctorShell>;
}
