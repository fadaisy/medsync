import type { Metadata } from "next";

import { toV2 } from "@/app/pharmacy/_lib/to-v2";
import { CartsBody } from "./body";

export const metadata: Metadata = { title: "Emergency carts · Pharmacy" };
export const dynamic = "force-dynamic";

export default async function CartsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await toV2("/pharmacy/store?tab=carts", await searchParams);
  return <CartsBody />;
}
