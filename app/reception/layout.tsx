import type { Metadata } from "next";
import type { ReactNode } from "react";

import { requireReceptionScope } from "@/lib/reception/scope";
import { ReceptionShell } from "./_components/reception-shell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function ReceptionLayout({ children }: { children: ReactNode }) {
  const scope = await requireReceptionScope();
  return <ReceptionShell scope={scope}>{children}</ReceptionShell>;
}
