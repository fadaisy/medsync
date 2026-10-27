import { toV2 } from "@/app/pharmacy/_lib/to-v2";
import { ControlledBody } from "./body";

export const dynamic = "force-dynamic";

export default async function ControlledPage({
  searchParams,
}: {
  searchParams: Promise<{ medicine?: string; from?: string; to?: string }>;
}) {
  await toV2("/pharmacy/shelf?view=controlled", await searchParams);
  return <ControlledBody searchParams={searchParams} />;
}
