import type { Metadata } from "next";

import { toV2 } from "@/app/pharmacy/_lib/to-v2";
import { ExpiryBody } from "./body";

export const metadata: Metadata = { title: "Expiry and recall · Pharmacy" };
export const dynamic = "force-dynamic";

export default async function ExpiryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await toV2("/pharmacy/store?tab=expiry", await searchParams);
  return <ExpiryBody />;
}
