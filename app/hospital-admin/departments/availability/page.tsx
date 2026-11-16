import { permanentRedirect } from "next/navigation";

/** Availability is the Departments page's "Unavailable now" view (ADR 0520 phase 2); `?report=1` still opens the report. */
export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  permanentRedirect(
    `/hospital-admin/departments?view=unavailable${sp.report === "1" ? "&report=1" : ""}`,
  );
}
