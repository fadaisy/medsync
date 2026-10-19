import type { Metadata } from "next";

import { redirectIfV2 } from "../_lib/v2-redirect";
import { RejectedView } from "../bench/_views/rejected";

export const metadata: Metadata = { title: "Rejected · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/** Lab Workspace v2: 308 to /lab/bench?stage=rejected when the v2 flag is on; the Phase 0 page otherwise. */
export default async function Page() {
  await redirectIfV2("/lab/bench?stage=rejected");
  return <RejectedView />;
}
