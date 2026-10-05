import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { standardVisitMidway } from "@/tests/emr/ui/desk-fixtures";
import { FixtureClose } from "./fixture";

/**
 * Development fixture: the close dialog and the patient copy (ADRs 0197–0203) on synthetic data, for
 * screenshots and axe. No database and no patient data. Off unless MEDSYNC_FIXTURES=1.
 * Screens: close-admit, close-admit-wait, close-home, close-home-noclinic, close-refer, copy, patient-visit.
 */
export const metadata: Metadata = { title: "Encounter closure fixture", robots: { index: false } };

const SCREENS = [
  "close-admit",
  "close-admit-wait",
  "close-home",
  "close-home-noclinic",
  "close-refer",
  "copy",
  "patient-visit",
] as const;
export type Screen = (typeof SCREENS)[number];

export default async function Page({ params }: { params: Promise<{ screen: string }> }) {
  if (process.env.MEDSYNC_FIXTURES !== "1") notFound();
  const { screen } = await params;
  const s = SCREENS.find((x) => x === screen);
  if (!s) notFound();
  return <FixtureClose screen={s} desk={standardVisitMidway()} />;
}
