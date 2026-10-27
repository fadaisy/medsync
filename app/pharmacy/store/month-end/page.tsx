import type { Metadata } from "next";

import { toV2 } from "@/app/pharmacy/_lib/to-v2";
import { MonthEndBody } from "./body";

export const metadata: Metadata = { title: "Month end · Pharmacy" };
export const dynamic = "force-dynamic";

export default async function MonthEndPage({
  searchParams,
}: {
  searchParams: Promise<{ place?: string; month?: string }>;
}) {
  await toV2("/pharmacy/store?tab=monthEnd", await searchParams);
  return <MonthEndBody searchParams={searchParams} />;
}
