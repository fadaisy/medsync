import type { Metadata } from "next";

import { toV2 } from "@/app/pharmacy/_lib/to-v2";
import { DeliveriesBody } from "./body";

export const metadata: Metadata = { title: "Deliveries · Pharmacy" };
export const dynamic = "force-dynamic";

export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await toV2("/pharmacy/store?tab=deliveries", await searchParams);
  return <DeliveriesBody />;
}
