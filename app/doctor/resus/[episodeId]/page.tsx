import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ResusDesk } from "@/app/nurse/resus/[episodeId]/_components/resus-desk";
import { ResusDeskV2 } from "@/app/nurse/resus/[episodeId]/_components/v2/desk";
import { resolveCapabilities } from "@/lib/doctor/capabilities";
import { fetchResusPatient } from "@/lib/resus/board";
import { loadDeskV2 } from "@/lib/resus/desk-v2-loader";
import { resusDeskV2 } from "@/lib/resus/feature";
import {
  fetchResusEpisode,
  fetchResusResponders,
  fetchResusRoster,
  fetchResusTimeline,
} from "@/lib/resus/record";
import { requireResusScope } from "@/lib/resus/scope";

export const metadata: Metadata = {
  title: "Resus desk · MedSync",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * /doctor/resus/[episodeId] — the doctor-side ABCDE resus desk. Mirrors the
 * nurse desk page (same loaders + ResusDesk component) with the /doctor base
 * path so the desk's "Board" link stays inside the doctor workspace.
 */
export default async function DoctorResusDeskPage({
  params,
}: {
  params: Promise<{ episodeId: string }>;
}) {
  const { episodeId } = await params;
  if (resusDeskV2()) {
    const initial = await loadDeskV2({ episodeId, basePath: "/doctor/resus" });
    if (!initial) notFound();
    return <ResusDeskV2 initial={initial} />;
  }
  const scope = await requireResusScope(`/doctor/resus/${episodeId}`);

  const episode = await fetchResusEpisode({ episodeId, hospitalId: scope.hospitalId });
  if (!episode) notFound();

  const [patient, timeline, roster, responders, caps] = await Promise.all([
    fetchResusPatient({
      patientUserId: episode.patientUserId,
      hospitalId: scope.hospitalId,
      clinicianUserId: scope.userId,
    }),
    fetchResusTimeline(episodeId),
    fetchResusRoster(episodeId),
    fetchResusResponders(episodeId),
    resolveCapabilities({
      hospitalId: scope.hospitalId,
      departmentId: scope.departmentId,
      cadreCode: scope.cadreCode,
    }),
  ]);

  return (
    <ResusDesk
      basePath="/doctor/resus"
      episode={{
        id: episode.id,
        state: episode.state,
        triggerKind: episode.triggerKind,
        triggerReason: episode.triggerReason,
        startedAtIso: episode.startedAt.toISOString(),
        arrestDetected: episode.arrestDetectedAt !== null,
        disposition: episode.disposition,
      }}
      patient={patient}
      timeline={timeline}
      roster={roster}
      responders={responders}
      scope={{
        userId: scope.userId,
        fullName: scope.fullName,
        cadreCode: scope.cadreCode,
        cadreName: scope.cadreName,
        hospitalName: scope.hospitalName,
        departmentName: scope.departmentName,
        leaderRecommended: scope.leaderRecommended,
        prescribeAuthority: {
          routine: caps.prescription_routine,
          controlled: caps.prescription_controlled,
        },
      }}
    />
  );
}
