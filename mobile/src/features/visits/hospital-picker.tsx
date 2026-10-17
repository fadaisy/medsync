import type { HospitalOption } from "@/data/visits";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { Button, Card, FieldError, Note, Press } from "@/components/tide";
import { chooseHospital, loadHospitals } from "@/data/visits";
import { pickStyle } from "@/features/visits/parts";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

/**
 * "Choose your hospital": both doors and the doctors on Home need one, and
 * nothing is shown in its place. Every active hospital (ADR 0086), and the
 * same write the web makes (`patient_profiles.primary_facility_id`, RLS).
 * `onChosen` re-reads the screen.
 */
export function HospitalPicker({ onChosen }: { onChosen: () => void }) {
  const t = useTide();
  const [list, setList] = useState<HospitalOption[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadHospitals().then(
      (h) => live && setList(h),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  const choose = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await chooseHospital(id);
      onChosen();
    } catch {
      setError("Couldn't save your hospital. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card style={{ gap: tSpace[2.5] }}>
      <Text accessibilityRole="header" style={[tType.label, { color: t.ink }]}>
        Choose your hospital first
      </Text>
      <Text style={[tType.bodyS, { color: t.ink2 }]}>
        We show its clinics, doctors and open days. You can change it later.
      </Text>
      {failed ? (
        <View style={{ gap: tSpace[2] }}>
          <Note tone="plain">{"Couldn't load the hospitals. Check your connection."}</Note>
          <Button
            label="Try again"
            variant="outline"
            size="md"
            onPress={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
          />
        </View>
      ) : list === null ? (
        <ActivityIndicator color={t.ink} accessibilityLabel="Loading the hospitals" />
      ) : list.length === 0 ? (
        <Note tone="plain">No hospital is on MedSync yet.</Note>
      ) : (
        list.map((h) => (
          <Press
            key={h.id}
            onPress={() => void choose(h.id)}
            disabled={busy !== null}
            accessibilityLabel={`Choose ${h.name}`}
            style={{
              minHeight: 52,
              padding: tSpace[3],
              borderRadius: tRadius.row,
              gap: 2,
              opacity: busy !== null && busy !== h.id ? 0.5 : 1,
              ...pickStyle(t, busy === h.id),
            }}
          >
            <Text style={[tType.labelS, { color: t.ink }]}>{h.name}</Text>
            {h.district ? (
              <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.ink2 }]}>
                {h.district}
              </Text>
            ) : null}
          </Press>
        ))
      )}
      {error ? <FieldError>{error}</FieldError> : null}
    </Card>
  );
}
