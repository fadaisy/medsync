import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Figtree } from "next/font/google";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { patientWebTideOn } from "@/lib/patient-web/routes";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Figtree with Latin Extended-A, for Luganda's ŋ (§4.2). Geist Mono comes from the root layout. */
const figtree = Figtree({
  subsets: ["latin", "latin-ext"],
  variable: "--font-patient-web",
  display: "swap",
});

/**
 * The new patient web (PROMPT-PATIENT-WEB-TIDE). Served at the old URLs by proxy.ts while PATIENT_WEB_TIDE is on
 * (D-PW-10); off, every `/pw` path is a 404 and the old pages serve.
 */
export default async function PatientWebLayout({ children }: { children: ReactNode }) {
  // Read the flag per request: a page prerendered at build would bake in the build's flag (a 404, or the reverse).
  await connection();
  if (!patientWebTideOn()) notFound();
  return <div className={`${figtree.variable} contents`}>{children}</div>;
}
