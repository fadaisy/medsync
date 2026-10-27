import { toV2 } from "../_lib/to-v2";
import { DowntimeBody } from "./body";

export const dynamic = "force-dynamic";

/** Pharmacy Workspace v2 (D-PW-09): with the flag on this list answers a 307 to its new home; off, the old page. */
export default async function DowntimePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await toV2("/pharmacy/setup?view=downtime", await searchParams);
  return <DowntimeBody />;
}
