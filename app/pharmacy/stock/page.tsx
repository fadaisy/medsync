import { toV2 } from "@/app/pharmacy/_lib/to-v2";
import { StockBody } from "./body";

export const dynamic = "force-dynamic";

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await toV2("/pharmacy/shelf", await searchParams);
  return <StockBody />;
}
