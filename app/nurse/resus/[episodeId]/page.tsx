import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { resolveCapabilities } from "@/lib/doctor/capabilities";
import { fetchResusPatient } from "@/lib/resus/board";
import {
  fetchResusEpisode,
  fetchResusResponders,
  fetchResusRoster,
  fetchResusTimeline,
} from "@/lib/resus/record";
import { requireResusScope } from "@/lib/resus/scope";
import { ResusDesk } from "./_components/resus-desk";

export const metadata: Metadata = {
  title: "Resus desk · MedSync",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * /nurse/resus/[episodeId] — the full-bleed ABCDE resuscitation desk.
 * Sidebar is hidden (SidebarGate) so the surface runs edge-to-edge at the
 * bedside. notFound() if the episode is not in the clinician's hospital.
 */
export default async function ResusDeskPage({
  params,
}: {
  params: Promise<{ episodeId: string }>;
}) {
  const { episodeId } = await params;
  const scope = await requireResusScope(`/nurse/resus/${episodeId}`);

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
