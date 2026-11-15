import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { ScreenLive } from "@/components/clinic-floor/board";
import { toVisit } from "@/components/clinic-floor/shared";
import { FLOOR } from "@/content/clinic-floor/floor";
import { fill } from "@/content/lab-workspace-v2";
import { clinicFloorLiveFor } from "@/lib/clinic-floor/feature";
import { loadFloorData } from "@/lib/clinic-floor/load";
import { doctorStates, projectFloor, screenFeed } from "@/lib/clinic-floor/model";
import { isTetherHost } from "@/lib/landing/feature";
import { requireTriageScope } from "@/lib/triage/scope";

/**
 * The waiting-room screen (ADR 0494) on a signed-in staff device. The page reads the floor on the server and
 * sends the screen ONLY the feed: booking codes and rooms (S3). `?clinic=<department id>`; refreshes itself.
 */
export const metadata: Metadata = { title: "Waiting-room screen", robots: { index: false } };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ clinic?: string }>;
}) {
  const scope = await requireTriageScope();
  // ADR 0509: on the Tether domain the floor is always on.
  const tether = isTetherHost((await headers()).get("host"));
  if (!tether && !clinicFloorLiveFor(scope.hospitalId)) notFound();
  const [data, sp] = await Promise.all([loadFloorData(scope), searchParams]);
  const cl = data.clinics.find((c) => c.id === sp.clinic) ?? data.clinics[0];
  if (!cl) notFound();
  const rows = projectFloor(data.people.map(toVisit), data.events).filter(
    (r) => r.departmentId === cl.id,
  );
  const doctors = doctorStates(data.events);
  const late = data.events
    .filter((e) => e.kind === "running_late" && e.departmentId === cl.id)
    .at(-1)?.note;
  return (
    <ScreenLive
      head={fill(FLOOR.screen.head, { hospital: data.hospitalName, clinic: cl.name })}
      feed={screenFeed(rows, doctors)}
      late={!!late}
    />
  );
}
