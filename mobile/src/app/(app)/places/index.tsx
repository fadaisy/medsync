import { useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";

import { Button, Card, Icon, Note, Pill, Press, Screen, TextLink } from "@/components/tide";
import { OFF_WORDS, placeLabel, setHome, usePlaces } from "@/data/places";
import { useTide } from "@/theme/theme";
import { tSpace, tType } from "@/theme/tide";

/**
 * My places (ADR 0402): the places the patient pinned, home first. Real,
 * from `patient_places` under patient-only RLS; the last good list stays on
 * the phone for reading offline. Tap a place to move, rename or delete it.
 */
export default function PlacesScreen() {
  const t = useTide();
  const router = useRouter();
  const p = usePlaces();
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const makeHome = async (id: string) => {
    setBusy(id);
    setProblem(null);
    const r = await setHome(id);
    setBusy(null);
    if (r === "off") setProblem(OFF_WORDS);
    else if (r === "failed")
      setProblem("Couldn't change your home. Check your connection and try again.");
  };

  return (
    <Screen
      back={{ label: "Me" }}
      title="My places"
      helpSource="places"
      gap={tSpace[3]}
      footer={
        p.off ? undefined : (
          <Button
            label="Add a place"
            icon="plus"
            onPress={() => router.push({ pathname: "/places/[id]", params: { id: "new" } })}
          />
        )
      }
    >
      <Text key="sub" style={[tType.bodyS, { color: t.ink2, marginTop: -tSpace[2] }]}>
        Only you can see these. We use your home place to suggest clinics near you.
      </Text>
      {p.off ? (
        <Note key="off" tone="plain">
          {OFF_WORDS}
        </Note>
      ) : p.loading ? (
        <ActivityIndicator key="loading" color={t.ink} accessibilityLabel="Loading your places" />
      ) : p.error ? (
        <View key="error" style={{ gap: tSpace[2] }}>
          <Note tone="plain" icon="alert">
            {"Couldn't load your places. Check your connection."}
          </Note>
          <Button label="Try again" variant="outline" size="md" onPress={p.retry} />
        </View>
      ) : p.places.length === 0 ? (
        <Note key="empty" tone="plain" icon="mapPin">
          No places saved yet. Add your home so we can suggest clinics near you.
        </Note>
      ) : null}
      {p.places.map((pl) => {
        const label = placeLabel(pl);
        return (
          <Card key={pl.id}>
            <Press
              onPress={() => router.push({ pathname: "/places/[id]", params: { id: pl.id } })}
              accessibilityLabel={`${label}${pl.isHome ? ", your home" : ""}. ${pl.address ?? "No address"}. Edit`}
              haptic={false}
              style={{ flexDirection: "row", alignItems: "center", gap: tSpace[3], minHeight: 44 }}
            >
              <Icon name={pl.kind === "home" ? "home" : "mapPin"} size={20} color={t.ink2} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[tType.label, { color: t.ink }]}>{label}</Text>
                <Text style={[tType.bodyS, { color: t.ink2 }]}>{pl.address ?? "No address"}</Text>
              </View>
              {pl.isHome ? <Pill label="Home" bg={t.surface2} /> : null}
              <Icon name="forward" size={20} color={t.ink3} />
            </Press>
            {!pl.isHome ? (
              <TextLink
                label={busy === pl.id ? "Saving…" : "Make this my home"}
                onPress={busy ? undefined : () => void makeHome(pl.id)}
              />
            ) : null}
          </Card>
        );
      })}
      {problem ? (
        <Note key="problem" tone="plain" icon="alert">
          {problem}
        </Note>
      ) : null}
    </Screen>
  );
}
