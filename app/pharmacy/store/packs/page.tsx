import type { Metadata } from "next";

import { toV2 } from "../../_lib/to-v2";
import { PacksBody } from "./body";

export const metadata: Metadata = { title: "Signed packs · Pharmacy" };
export const dynamic = "force-dynamic";

/** Pharmacy Workspace v2 (D-PW-09): with the flag on this list answers a 307 to its new home; off, the old page. */
export default async function PacksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await toV2("/pharmacy/setup", await searchParams);
  return <PacksBody />;
}
