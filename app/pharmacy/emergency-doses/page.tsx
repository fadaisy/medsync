import { toV2 } from "@/app/pharmacy/_lib/to-v2";
import { EmergencyDosesBody } from "./body";

export const dynamic = "force-dynamic";

export default async function EmergencyDosesPage({
  searchParams,
}: {
  searchParams: Promise<{ cart?: string; period?: string }>;
}) {
  await toV2("/pharmacy/shelf?view=emergency", await searchParams);
  return <EmergencyDosesBody searchParams={searchParams} />;
}
