import type { SP } from "@/lib/lab/redirects";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { labV2 } from "../_lib/places";
import { ReportsPlace } from "./_views/place";

export const metadata: Metadata = { title: "Reports · Laboratory" };
export const dynamic = "force-dynamic";

/** The Reports place (prompt 5.9): `?tab=indicators|register|hmis|downloads`. */
export default async function LabReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (!(await labV2()).live) notFound();
  return <ReportsPlace sp={await searchParams} />;
}
