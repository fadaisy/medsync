import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { labV2 } from "../_lib/places";
import { QualityPlace } from "./_views/place";

export const metadata: Metadata = { title: "Quality · Laboratory" };
export const dynamic = "force-dynamic";

/** The Quality place (prompt 5.7): `?tab=today|plans|runs|stock|equipment|eqa|bedside|nc`. */
export default async function QualityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const v2 = await labV2();
  if (!v2.live) notFound();
  return <QualityPlace v2={v2} sp={await searchParams} />;
}
