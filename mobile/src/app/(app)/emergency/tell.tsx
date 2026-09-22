import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";

import { PreAlertForm } from "@/components/emergency/pre-alert-form";
import { fetchPatientProfile } from "@/lib/booking";
import { useEmergencySheet } from "@/lib/emergency";
import { usePendingCatalogDraft } from "@/lib/pending-symptoms";

/**
 * E2 for a signed-in patient (PRD §8.3). The picks come from E1's tiles
 * (`picks`) or, when the catalog's interrupt brought them here, from the
 * pending catalog draft — whose submission id rides along so the server
 * can link the pre-alert to what was chosen.
 */
export default function TellScreen() {
  const router = useRouter();
  const { picks } = useLocalSearchParams<{ picks?: string }>();
  const draft = usePendingCatalogDraft();
  const [hospitalId, setHospitalId] = useState<string | null>(null);
  const { sheet } = useEmergencySheet(hospitalId);

  useEffect(() => {
    fetchPatientProfile().then(
      (p) => setHospitalId(p?.hospitalId ?? null),
      () => {},
    );
  }, []);

  const fromTiles = picks ? picks.split(",").filter(Boolean) : [];
  return (
    <PreAlertForm
      sheet={sheet}
      hospitalId={hospitalId}
      initialPicks={fromTiles.length ? fromTiles : (draft?.items ?? [])}
      submissionId={draft?.submissionId ?? null}
      signedIn
      onBack={router.back}
      onSent={(r) =>
        router.replace({
          pathname: "/(app)/emergency/status",
          params: {
            id: r.pre_arrival_id,
            token: r.token,
            sentAt: new Date().toISOString(),
            smsBody: r.sms_fallback_body ?? "",
          },
        })
      }
    />
  );
}
