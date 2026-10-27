import type { Metadata } from "next";

import { toV2 } from "@/app/pharmacy/_lib/to-v2";
import { WardsBody } from "./body";

export const metadata: Metadata = { title: "Ward stock · Pharmacy" };
export const dynamic = "force-dynamic";

export default async function WardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await toV2("/pharmacy/store?tab=wards", await searchParams);
  return <WardsBody />;
}
