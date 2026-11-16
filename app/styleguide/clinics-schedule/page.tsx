import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FixtureClinics } from "@/components/clinics-schedule/entry";
import { adminNavGroups } from "@/lib/hospital-admin/admin-nav";

/**
 * Development fixture: Clinics & schedule on "St. Example Hospital" (Thu 12 Nov 2026), invented names only, booked
 * counts from seeded bookings. No database; every write is answered locally. Off unless MEDSYNC_FIXTURES=1.
 * `?scenario=ready|first|offline`, `?view=` one of the seven views, `?tether=1` for the Tether menu.
 */
export const metadata: Metadata = { title: "Clinics & schedule fixture", robots: { index: false } };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  if (process.env.MEDSYNC_FIXTURES !== "1") notFound();
  const sp = await searchParams;
  const scenario = sp.scenario === "first" || sp.scenario === "offline" ? sp.scenario : "ready";
  const groups = adminNavGroups({ tether: sp.tether === "1" });
  return <FixtureClinics scenario={scenario} view={sp.view} groups={groups} />;
}
