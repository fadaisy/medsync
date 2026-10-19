import type { Metadata } from "next";

import { redirectIfV2 } from "../_lib/v2-redirect";
import { EquipmentView } from "../quality/_views/equipment";

export const metadata: Metadata = { title: "Equipment · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/** Old route (Lab Phase 3 §5.7): 308 to Quality · Equipment under Lab Workspace v2. */
export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectIfV2("/lab/quality?tab=equipment", searchParams);
  return <EquipmentView v2={false} />;
}
