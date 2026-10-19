import type { Metadata } from "next";

import { redirectIfV2 } from "../_lib/v2-redirect";
import { ReleasedView } from "../bench/_views/released";

export const metadata: Metadata = { title: "Released today · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/** Lab Workspace v2: 308 to /lab/bench?stage=released when the v2 flag is on; the Phase 0 page otherwise. */
export default async function Page() {
  await redirectIfV2("/lab/bench?stage=released");
  return <ReleasedView />;
}
