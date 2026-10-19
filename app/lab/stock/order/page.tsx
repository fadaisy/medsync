import type { Metadata } from "next";

import { redirectIfV2 } from "../../_lib/v2-redirect";
import { OrderView } from "../../quality/_views/order";

export const metadata: Metadata = { title: "Order request · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/** Old route (Lab Phase 3 §5.5): 308 to /lab/quality/stock/order under Lab Workspace v2 (keeps `item`). */
export default async function OrderRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  await redirectIfV2("/lab/quality/stock/order", searchParams);
  return <OrderView item={(await searchParams).item} />;
}
