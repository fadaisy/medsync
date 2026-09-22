import { useEffect, useState } from "react";
import { useRouter } from "expo-router";

import { CalmScreen } from "@/components/emergency/calm-screen";
import { Button } from "@/components/ui/button";
import { fetchPatientProfile } from "@/lib/booking";
import { preAlertLive, useEmergencySheet } from "@/lib/emergency";

/**
 * The self-harm route (PRD §5.5): a calm screen — not red, no alarm, no
 * questionnaire. Crisis contacts once verified (Gate A item 2: none seeded
 * yet), then the general line; the hospital's own number stands in until
 * they are sourced (ADR 0098 ruling 8). Offers the pre-alert when it is on.
 */
export default function CrisisScreen() {
  const router = useRouter();
  const [hospitalId, setHospitalId] = useState<string | null>(null);
  const { sheet } = useEmergencySheet(hospitalId);
  useEffect(() => {
    fetchPatientProfile().then(
      (p) => setHospitalId(p?.hospitalId ?? null),
      () => {},
    );
  }, []);

  const verified = (sheet?.contacts ?? []).filter((c) => !c.draft);
  const contacts = [
    ...verified.filter((c) => c.kind === "crisis"),
    ...verified.filter((c) => c.kind === "general").slice(0, 1),
  ];

  return (
    <CalmScreen
      title="You are not alone"
      lead="You don't have to go through this alone."
      body="Talking to someone now can help. These people are there to listen."
      contacts={contacts}
      fallback="No crisis line is verified here yet. Go to the nearest hospital, or ask someone you trust to take you."
      onBack={router.back}
    >
      {preAlertLive() ? (
        <Button
          variant="secondary"
          label="Tell a hospital I'm coming"
          onPress={() => router.push("/(app)/emergency/tell")}
        />
      ) : null}
    </CalmScreen>
  );
}
