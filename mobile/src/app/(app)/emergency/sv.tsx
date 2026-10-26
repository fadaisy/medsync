import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { View } from "react-native";

import { CalmScreen } from "@/components/emergency/calm-screen";
import { Button, TextLink } from "@/components/tide";
import { fetchPatientProfile } from "@/lib/booking";
import { preAlertLive, useEmergencySheet } from "@/lib/emergency";

/**
 * The sexual-violence route (PRD §5.5): a calm screen — not red, no alarm,
 * and NO detail collected in the app. It says why time matters, offers the
 * support line once verified, the general line, the nearest facility
 * (the pre-alert, when on) and a visit today.
 */
export default function SexualViolenceScreen() {
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
    ...verified.filter((c) => c.kind === "sv"),
    ...verified.filter((c) => c.kind === "general").slice(0, 1),
  ];

  return (
    <CalmScreen
      title="Care is here"
      lead="Care within 72 hours matters. Go to a hospital as soon as you can — you decide what to share."
      body="Nothing about what happened is recorded in this app. At the hospital you can ask to speak to someone privately."
      contacts={contacts}
      fallback="No support line is verified here yet. Go to the nearest hospital's emergency entrance."
      onBack={router.back}
    >
      {preAlertLive() ? (
        <Button
          variant="outline"
          label="Tell a hospital I'm coming"
          onPress={() => router.push("/(app)/emergency/tell")}
        />
      ) : null}
      <View style={{ alignItems: "center" }}>
        <TextLink label="Book a visit today" onPress={() => router.push("/(app)/book")} />
      </View>
    </CalmScreen>
  );
}
