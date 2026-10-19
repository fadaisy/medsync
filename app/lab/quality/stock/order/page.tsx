import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OrderView } from "../../_views/order";
import { one } from "../../../_lib/place-tabs";
import { labV2 } from "../../../_lib/places";

export const metadata: Metadata = { title: "Order request · Quality · Laboratory" };
export const dynamic = "force-dynamic";

/** Lab Workspace v2: the printable order request (one item with `?item=`, else everything below minimum). */
export default async function QualityOrderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const v2 = await labV2();
  if (!v2.live) notFound();
  return <OrderView item={one((await searchParams).item)} />;
}
