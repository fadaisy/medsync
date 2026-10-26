import type { Place, PlaceKind } from "@/data/places";
import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";

import {
  Button,
  Chip,
  ChipRow,
  FieldLabel,
  Note,
  PlaceMap,
  Screen,
  TextField,
  TextLink,
} from "@/components/tide";
import {
  addPlace,
  ADDRESS_MAX,
  deletePlace,
  kindWords,
  LABEL_MAX,
  labelProblem,
  OFF_WORDS,
  PLACE_CONSENT,
  PLACE_KINDS,
  placeLabel,
  updatePlace,
  usePlaces,
} from "@/data/places";
import { CheckRow } from "@/features/auth/steps";
import { useTide } from "@/theme/theme";
import { tSpace, tType } from "@/theme/tide";

/**
 * Add a place (`id` "new") or edit one: move the pin, change the label
 * (Home, Work, or the patient's own word), fix the address, or delete it
 * after an in-page confirm. A new place is saved only with PLACE_CONSENT.
 */
export default function PlaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const p = usePlaces();
  const t = useTide();
  const isNew = id === "new";
  const place = isNew ? null : (p.places.find((x) => x.id === id) ?? null);
  const hasHome = p.places.some((x) => x.isHome);

  if (!isNew && !place)
    return (
      <Screen back={{ label: "My places" }} title="Place" helpSource="places">
        {p.loading ? (
          <ActivityIndicator key="loading" color={t.ink} accessibilityLabel="Loading the place" />
        ) : (
          <Note key="gone" tone="plain">
            {p.off ? OFF_WORDS : "This place is not on this phone. It may have been deleted."}
          </Note>
        )}
      </Screen>
    );
  // Keyed so the form starts from the loaded place.
  return <PlaceForm key={place?.id ?? "new"} place={place} makeHome={!place && !hasHome} />;
}

function PlaceForm({ place, makeHome }: { place: Place | null; makeHome: boolean }) {
  const t = useTide();
  const router = useRouter();
  const [kind, setKind] = useState<PlaceKind>(place?.kind ?? "home");
  const [custom, setCustom] = useState(place?.customLabel ?? "");
  const [pin, setPin] = useState(place ? { lat: place.lat, lng: place.lng } : null);
  const [address, setAddress] = useState(place?.address ?? "");
  // The words the geocoder filled in: a new pin may replace them, never what the patient typed.
  const [autoAddress, setAutoAddress] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const labelError = labelProblem(kind, custom);
  const canSave = pin !== null && labelError === null && (place !== null || consent);

  const done = (r: "saved" | "off" | "failed", failed: string) => {
    setBusy(false);
    if (r === "saved") router.back();
    else setProblem(r === "off" ? OFF_WORDS : failed);
  };

  const save = async () => {
    if (!pin || !canSave) return;
    setBusy(true);
    setProblem(null);
    const input = { kind, customLabel: custom, lat: pin.lat, lng: pin.lng, address };
    // The first home saved becomes the home clinics are suggested from.
    const r = place
      ? await updatePlace(place.id, input)
      : await addPlace(input, makeHome && kind === "home", new Date());
    done(r, "Couldn't save this place. Check your connection and try again.");
  };

  const remove = async () => {
    if (!place) return;
    setBusy(true);
    setProblem(null);
    done(await deletePlace(place.id), "Couldn't delete this place. Check your connection.");
  };

  return (
    <Screen
      back={{ label: "My places" }}
      title={place ? placeLabel(place) : "Add a place"}
      helpSource="places"
      gap={tSpace[4]}
      footer={
        <Button
          label={place ? "Save changes" : "Save this place"}
          onPress={() => void save()}
          disabled={!canSave}
          busy={busy && !confirmDelete}
        />
      }
    >
      <View key="label" style={{ gap: tSpace[1.5] }}>
        <FieldLabel>Label</FieldLabel>
        <ChipRow>
          {PLACE_KINDS.map((k) => (
            <Chip key={k} label={kindWords(k)} selected={kind === k} onPress={() => setKind(k)} />
          ))}
        </ChipRow>
      </View>
      {kind === "other" ? (
        <TextField
          key="custom"
          label="Name this place"
          value={custom}
          onChangeText={setCustom}
          placeholder="e.g. Mum's house"
          maxLength={LABEL_MAX}
          state={labelError ? "idle" : "good"}
          error={labelError}
        />
      ) : null}
      <View key="map" style={{ gap: tSpace[1.5] }}>
        <FieldLabel>Where it is</FieldLabel>
        <PlaceMap
          value={pin}
          onPick={(pick) => {
            setPin({ lat: pick.lat, lng: pick.lng });
            const words = pick.geo?.address;
            if (words && (address === "" || address === autoAddress)) {
              setAddress(words);
              setAutoAddress(words);
            }
          }}
        />
      </View>
      <TextField
        key="address"
        label="Address"
        optional
        value={address}
        onChangeText={setAddress}
        placeholder="e.g. Bwaise II, near the market"
        maxLength={ADDRESS_MAX}
        multiline
      />
      {place ? null : (
        <CheckRow
          key="consent"
          checked={consent}
          onToggle={() => setConsent((c) => !c)}
          title={PLACE_CONSENT.title}
          sub={PLACE_CONSENT.words}
        />
      )}
      {problem ? (
        <Note key="problem" tone="plain" icon="alert">
          {problem}
        </Note>
      ) : null}
      {place && !confirmDelete ? (
        <TextLink key="delete" label="Delete this place" onPress={() => setConfirmDelete(true)} />
      ) : null}
      {place && confirmDelete ? (
        <View key="confirm" style={{ gap: tSpace[2] }}>
          <Text style={[tType.label, { color: t.ink }]}>
            Delete {placeLabel(place)}? This can&apos;t be undone.
          </Text>
          <View style={{ flexDirection: "row", gap: tSpace[2] }}>
            <Button
              label="Delete"
              size="md"
              busy={busy}
              onPress={() => void remove()}
              style={{ flex: 1 }}
            />
            <Button
              label="Keep it"
              variant="outline"
              size="md"
              disabled={busy}
              onPress={() => setConfirmDelete(false)}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : null}
    </Screen>
  );
}
