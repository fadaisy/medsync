import type { Metadata } from "next";

import { toV2 } from "@/app/pharmacy/_lib/to-v2";
import { OrdersBody } from "./body";

export const metadata: Metadata = { title: "Orders · Pharmacy" };
export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await toV2("/pharmacy/store?tab=orders", await searchParams);
  return <OrdersBody />;
}
