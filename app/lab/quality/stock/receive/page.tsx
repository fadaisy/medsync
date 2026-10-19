import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ReceiveView } from "../../_views/receive";
import { one } from "../../../_lib/place-tabs";
import { labV2 } from "../../../_lib/places";

export const metadata: Metadata = { title: "Receive a delivery · Quality · Laboratory" };
export const dynamic = "force-dynamic";

/** Lab Workspace v2: receive a delivery and accept lots; `?lot=` focuses the lot Needs you opened. */
export default async function QualityReceivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const v2 = await labV2();
  if (!v2.live) notFound();
  return <ReceiveView v2 focusLot={one((await searchParams).lot)} />;
}
