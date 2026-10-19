import type { Metadata } from "next";

import { redirectIfV2 } from "../_lib/v2-redirect";
import { OlderView } from "../bench/_views/older";

export const metadata: Metadata = { title: "Older results · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/** Lab Workspace v2: 308 to /lab/bench/older when the v2 flag is on; the Phase 0 page otherwise. */
export default async function Page() {
  await redirectIfV2("/lab/bench/older");
  return <OlderView />;
}
