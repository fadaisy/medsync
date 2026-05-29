import type { Metadata } from "next";
import type { ReactNode } from "react";

import { requireNurseScope } from "@/lib/nurse/scope";
import { NurseShell } from "./_components/nurse-shell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function NurseLayout({ children }: { children: ReactNode }) {
  const scope = await requireNurseScope();
  return <NurseShell scope={scope}>{children}</NurseShell>;
}
