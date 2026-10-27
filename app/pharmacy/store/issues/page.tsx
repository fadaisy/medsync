import type { Metadata } from "next";

import { toV2 } from "@/app/pharmacy/_lib/to-v2";
import { IssuesBody } from "./body";

export const metadata: Metadata = { title: "Issues and requisitions · Pharmacy" };
export const dynamic = "force-dynamic";

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await toV2("/pharmacy/store?tab=issues", await searchParams);
  return <IssuesBody />;
}
