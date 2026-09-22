import { useCallback, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { EmergencySheet } from "@/components/emergency/emergency-sheet";
import { fetchPatientProfile } from "@/lib/booking";
import { draftContactsVisible } from "@/lib/emergency";

/**
 * The Emergency tab is E1 (ADR 0098 ruling 7; PRD §8.2) — the sheet with
 * the patient's own hospital, whose registered emergency line rides first.
 * `from=catalog` is the symptom catalog's interrupt: no tiles, one haptic.
 *
 * The sheet draws before anything is fetched: its last good answer is
 * cached on the phone, and a patient mid-stroke on a 2G connection should
 * not wait for a profile read to be told where to go. A failed read is the
 * same as no profile — the national sheet — and no number is ever invented.
 */
export default function EmergencyScreen() {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [hospitalId, setHospitalId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchPatientProfile().then(
        (p) => setHospitalId(p?.hospitalId ?? null),
        () => {},
      );
      // `from=catalog` is one arrival's context: a tab keeps its params, so
      // it is cleared on the way out or the tiles would stay hidden all session.
      return () => {
        if (from) router.setParams({ from: undefined });
      };
    }, [from, router]),
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
