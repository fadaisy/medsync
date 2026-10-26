import type { HouseholdMember, HouseholdRelationship } from "@/lib/booking";
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ActivityIndicator, Switch, Text, View } from "react-native";

import {
  Avatar,
  Button,
  Card,
  Chip,
  ChipRow,
  FieldLabel,
  Note,
  Screen,
  SectionHead,
  TextField,
} from "@/components/tide";
import { addHouseholdMember, fetchHousehold, HOUSEHOLD_RELATIONSHIPS } from "@/lib/booking";
import { useTide } from "@/theme/theme";
import { tSpace, tType } from "@/theme/tide";

/**
 * People I book for — "a son with the only smartphone" (PRD §2.9, Gate D).
 *
 * The list is the account's live `booking_agents` rows; adding someone is one
 * POST to `pt-add-household-member`, which mints the encrypted provisional
 * record (the phone cannot encrypt) and refuses a minor with its own
 * sentence. Adults only at this gate: the switch is required, and the
 * server's refusal — "Booking for a child is not available yet." — reaches
 * the well verbatim. No clinical question is asked here or anywhere on the
 * way to a booking.
 *
 * A member's own phone is asked for because a confidential line's receipt
 * goes there, never to this account (§2.9). Removal has no writer yet.
 */
export default function HouseholdScreen() {
  const t = useTide();

  const [members, setMembers] = useState<HouseholdMember[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const [label, setLabel] = useState("");
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("");
  const [dob, setDob] = useState("");
  const [relationship, setRelationship] = useState<HouseholdRelationship | null>(null);
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadFailed(false);
    fetchHousehold().then(setMembers, () => setLoadFailed(true));
  }, []);

  useFocusEffect(load);

  const ageYears = age.trim() === "" ? null : Number(age.trim());
  const dobOk = dob.trim() === "" || /^\d{4}-\d{2}-\d{2}$/.test(dob.trim());
  const ready =
    label.trim().length > 0 &&
    phone.trim().length > 0 &&
    relationship !== null &&
    adult &&
    dobOk &&
    (dob.trim() !== "" || (ageYears !== null && Number.isInteger(ageYears)));

  const onAdd = async () => {
    if (!ready || !relationship || busy) return;
    setBusy(true);
    setError(null);
    setAdded(null);
    const res = await addHouseholdMember({
      label,
      phone,
      dateOfBirth: dob.trim() || null,
      ageYears,
      declaredAdult: adult,
      relationship,
    });
    setBusy(false);
    if (!res.ok) {
      // The server's sentence, verbatim — the minor refusal included.
      setError(res.error);
      return;
    }
    setAdded(label.trim());
    setLabel("");
    setPhone("");
    setAge("");
    setDob("");
    setRelationship(null);
    setAdult(false);
    load();
  };

  // Back is `router.back()`, the Tide back link's default; Help is the Screen's red disc.
  const chrome = { back: {}, title: "People I book for", helpSource: "household" };

  if (loadFailed) {
    return (
      <Screen {...chrome}>
        <View style={{ gap: tSpace[3] }}>
          <Note tone="plain">
            {"Couldn't load the people you book for. Check your connection and try again."}
          </Note>
          <Button label="Try again" variant="outline" onPress={load} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      {...chrome}
      subtitle="Book a visit for an adult in your household. They get their own booking code."
      footer={
        <>
          {/* Amber, not red: a refused member is not a clinical emergency. */}
          {error ? (
            <View accessibilityLiveRegion="polite">
              <Note tone="caution" icon="alert">
                {error}
              </Note>
            </View>
          ) : null}
          <Button
            label="Add this person"
            busy={busy}
            disabled={!ready}
            onPress={() => void onAdd()}
          />
        </>
      }
    >
      {members === null ? (
        <ActivityIndicator color={t.ink} accessibilityLabel="Loading" />
      ) : members.length === 0 ? (
        <Text style={[tType.bodyM, { color: t.ink2 }]}>Nobody yet.</Text>
      ) : (
        <View style={{ gap: tSpace[2.5] }}>
          {members.map((m) => (
            <Card key={m.id} style={{ flexDirection: "row", alignItems: "center", gap: tSpace[3] }}>
              <Avatar initials={initialsOf(m.label)} size={44} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[tType.label, { color: t.ink }]} numberOfLines={1}>
                  {m.label}
                </Text>
                <Text style={[tType.bodyS, { color: t.ink2 }]}>
                  {HOUSEHOLD_RELATIONSHIPS.find((r) => r.value === m.relationship)?.label ??
                    m.relationship}
                </Text>
              </View>
            </Card>
          ))}
        </View>
      )}

      {added ? (
        <View accessibilityLiveRegion="polite">
          <Note tone="info" icon="check">{`${added} is on your list.`}</Note>
        </View>
      ) : null}

      <View style={{ gap: tSpace[3.5] }}>
        <SectionHead title="Add someone" />
        <TextField
          label="Their name"
          value={label}
          onChangeText={setLabel}
          maxLength={80}
          inputProps={{ returnKeyType: "done" }}
        />
        <View style={{ gap: tSpace[1.5] }}>
          <TextField
            label="Their phone number"
            placeholder="+256XXXXXXXXX"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            inputProps={{ returnKeyType: "done" }}
          />
          <Text style={[tType.bodyS, { color: t.ink2 }]}>
            Their own number. Booking messages for them go there.
          </Text>
        </View>
        <TextField
          label="Age in years"
          value={age}
          onChangeText={setAge}
          keyboardType="number-pad"
          maxLength={3}
          inputProps={{ returnKeyType: "done" }}
        />
        <TextField
          label="Date of birth (optional, YYYY-MM-DD)"
          placeholder="1980-06-21"
          value={dob}
          onChangeText={setDob}
          keyboardType="numbers-and-punctuation"
          maxLength={10}
          inputProps={{ returnKeyType: "done" }}
        />
        <View style={{ gap: tSpace[1.5] }}>
          <FieldLabel>Who are they to you?</FieldLabel>
          <ChipRow>
            {HOUSEHOLD_RELATIONSHIPS.map((r) => (
              <Chip
                key={r.value}
                label={r.label}
                selected={relationship === r.value}
                onPress={() => setRelationship(r.value)}
              />
            ))}
          </ChipRow>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: tSpace[3],
            minHeight: 44,
          }}
        >
          <Text style={[tType.labelS, { flex: 1, color: t.ink }]}>
            This person is an adult (18 or older)
          </Text>
          <Switch
            value={adult}
            onValueChange={setAdult}
            accessibilityLabel="This person is an adult, 18 or older"
            trackColor={{ true: t.accentPressed, false: t.primaryOff }}
            thumbColor={t.onBand}
            ios_backgroundColor={t.primaryOff}
          />
        </View>
      </View>
    </Screen>
  );
}

/** "Amina Okello" → "AO": the first and last word's first letter. */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
  return ((words[0]?.[0] ?? "") + last).toUpperCase();
}
