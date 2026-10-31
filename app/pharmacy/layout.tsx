import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { PharmacyShell } from "./_components/shell";
import { shellPayload } from "./_lib/shell-payload";

export const metadata: Metadata = {
  title: "Pharmacy",
  robots: { index: false, follow: false },
};

/**
 * The pharmacy workspace (rework PRD §3). `requirePharmacyScope()` enforces sign-in, the second factor, a pharmacy
 * affiliation and `pharmacy.view`; PHARMACY_CORE (or the old PHARMACY_WORKSPACE) switches it on per hospital, and in
 * production the rework's wording must be signed. Otherwise this is the standard not-found page.
 */
export default async function PharmacyLayout({ children }: { children: ReactNode }) {
  const payload = await shellPayload();
  if (!payload) notFound();
  return <PharmacyShell payload={payload}>{children}</PharmacyShell>;
}
