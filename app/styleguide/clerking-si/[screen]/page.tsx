import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DX_CATALOGUE, DX_SIGNOFF, dxTermUuid } from "@/lib/clerking/impression/load";
import { v2Payload } from "@/tests/clerking/fixtures";
import { FixtureDesk } from "../_components/fixture-desk";

/**
 * Development fixture (D-SI-29): the v2 clerking desk on steps 08 and 09 from the synthetic test
 * fixtures, for screenshots, axe and Playwright. Off unless MEDSYNC_FIXTURES=1; no database, no
 * patient data (Patient Three-3 is synthetic).
 */
export const metadata: Metadata = { title: "Clerking fixture", robots: { index: false } };

const SCREENS = ["summary", "impression"] as const;

export default async function Page({ params }: { params: Promise<{ screen: string }> }) {
  if (process.env.MEDSYNC_FIXTURES !== "1") notFound();
  const { screen } = await params;
  const step = SCREENS.find((s) => s === screen.split("-")[0]);
  if (!step) notFound();
  const p = v2Payload();
  p.clerking!.dx = {
    catalogueUrl: "/api/clerking/dx-catalogue?v=fixture",
    catalogueVersion: DX_CATALOGUE.version,
    signoff: DX_SIGNOFF,
  };
  p.diagnoses = [];
  if (!screen.endsWith("empty"))
    p.diagnoses = [
      {
        id: "00000000-0000-4000-8000-000000000001",
        display: "Diabetes, type not yet determined",
        code: null,
        verification: "provisional",
        rank: "primary",
        ...{
          logicalId: "00000000-0000-4000-8000-0000000000a1",
          termId: dxTermUuid("dx.dm_type_unknown"),
        },
      },
      {
        id: "00000000-0000-4000-8000-000000000002",
        display: "Sepsis",
        code: null,
        verification: "differential",
        rank: "secondary",
        ...{ logicalId: "00000000-0000-4000-8000-0000000000a2", termId: dxTermUuid("dx.sepsis") },
      },
    ];
  return <FixtureDesk p={p} step={step} />;
}
