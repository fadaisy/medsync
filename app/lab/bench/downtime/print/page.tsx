import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PrintFormsView, printRange } from "../_views/print-forms";
import { one } from "../../../_lib/place-tabs";
import { labV2 } from "../../../_lib/places";

export const metadata: Metadata = { title: "Downtime forms · Laboratory" };
export const dynamic = "force-dynamic";

/** The paper forms to print (§5.9; prompt 5.10): the same sheets as before, inside the Bench. */
export default async function BenchDowntimePrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const v2 = await labV2();
  if (!v2.live || !v2.flags.downtime) notFound();
  const sp = await searchParams;
  const range = printRange(one(sp.from), one(sp.to));
  if (!range) notFound();
  return <PrintFormsView scope={v2.scope} a={range.a} b={range.b} />;
}
