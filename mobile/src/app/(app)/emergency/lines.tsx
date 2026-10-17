import { useCallback, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { EmergencySheet } from "@/components/emergency/emergency-sheet";
import { fetchPatientProfile } from "@/lib/booking";
import { draftContactsVisible } from "@/lib/emergency";

/**
 * E1 (ADR 0098 ruling 7; PRD §8.2) — the sheet with the patient's own
 * hospital, whose registered emergency line rides first. It was the
 * Emergency tab; under Tide (ADR 0340) Help is the red door and opens this
 * from "All emergency lines", and the symptom catalog's interrupt lands here.
 * `from=catalog` is the symptom catalog's interrupt: no tiles, one haptic.
 *
 * The sheet draws before anything is fetched: its last good answer is
 * cached on the phone, and a patient mid-stroke on a 2G connection should
 * not wait for a profile read to be told where to go. A failed read is the
 * same as no profile — the national sheet — and no number is ever invented.
 */
export default function EmergencyLinesScreen() {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [hospitalId, setHospitalId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchPatientProfile().then(
        (p) => setHospitalId(p?.hospitalId ?? null),
        () => {},
      );
    }, []),
  );

  return (
    <EmergencySheet
      hospitalId={hospitalId}
      from={from}
      showDrafts={draftContactsVisible()}
      onTell={(picks) =>
        router.push({ pathname: "/(app)/emergency/tell", params: { picks: picks.join(",") } })
      }
      onOpenStatus={(p) =>
        router.push({
          pathname: "/(app)/emergency/status",
          params: { id: p.id, token: p.token, sentAt: p.sentAt, smsBody: p.smsBody ?? "" },
        })
      }
    />
  );
}
