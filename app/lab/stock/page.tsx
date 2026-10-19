import type { Metadata } from "next";

import { redirectIfV2 } from "../_lib/v2-redirect";
import { StockView } from "../quality/_views/stock";

export const metadata: Metadata = { title: "Stock and lots · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/** Old route (Lab Phase 3 §5.5): 308 to Quality · Stock and lots under Lab Workspace v2 (keeps `f`). */
export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  await redirectIfV2("/lab/quality?tab=stock", searchParams);
  return <StockView v2={false} f={(await searchParams).f} />;
}
