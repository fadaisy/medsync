import { toV2 } from "../../_lib/to-v2";
import { NationalListBody } from "./body";

export const dynamic = "force-dynamic";

/** Pharmacy Workspace v2 (D-PW-09): with the flag on this list answers a 307 to its new home; off, the old page. */
export default async function NationalListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; vital?: string }>;
}) {
  const sp = await searchParams;
  await toV2("/pharmacy/setup?view=national", sp);
  return <NationalListBody searchParams={Promise.resolve(sp)} />;
}
