import type { HouseholdMember, HouseholdRelationship } from "@/lib/booking";
import type { Palette } from "@/theme/tokens";
import { useCallback, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { EmergencyButton } from "@/components/patient/emergency-button";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { Empty } from "@/components/ui/empty";
import { Screen } from "@/components/ui/screen";
import { Section } from "@/components/ui/section";
import { addHouseholdMember, fetchHousehold, HOUSEHOLD_RELATIONSHIPS } from "@/lib/booking";
import { useStyles, useTheme } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

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
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);

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

  const chrome = { title: "People I book for", onBack: router.back, trailing: <EmergencyButton /> };

  if (loadFailed) {
    return (
      <Screen {...chrome}>
        <Empty
          icon="cloud-offline-outline"
          title="Couldn't load the people you book for."
          hint="Check your connection and try again."
          action={<Button variant="secondary" label="Try again" onPress={load} />}
        />
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Screen
        {...chrome}
        footer={
          <>
            {error ? (
              <View style={styles.well}>
                <Ionicons name="alert-circle-outline" size={18} color={colors.status.cautionFg} />
                <Text style={styles.wellText} accessibilityLiveRegion="polite">
                  {error}
                </Text>
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
        <View style={styles.stack}>
          <Text style={styles.lede}>
            Book a visit for an adult in your household. They get their own booking code.
          </Text>

          {members === null ? (
            <ActivityIndicator color={colors.primary} accessibilityLabel="Loading" />
          ) : members.length === 0 ? (
            <Text style={styles.none}>Nobody yet.</Text>
          ) : (
            <View style={styles.rows}>
              {members.map((m) => (
                <View key={m.id} style={styles.row}>
                  <Avatar name={m.label} size={44} />
                  <View style={styles.rowText}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {m.label}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {HOUSEHOLD_RELATIONSHIPS.find((r) => r.value === m.relationship)?.label ??
                        m.relationship}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {added ? (
            <Text style={styles.notice} accessibilityLiveRegion="polite">
              {added} is on your list.
            </Text>
          ) : null}

          <Section title="Add someone">
            <Field label="Their name" value={label} onChangeText={setLabel} maxLength={80} />
            <Field
              label="Their phone number"
              hint="Their own number. Booking messages for them go there."
              placeholder="+256XXXXXXXXX"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            <Field
              label="Age in years"
              value={age}
              onChangeText={setAge}
              keyboardType="number-pad"
              maxLength={3}
            />
            <Field
              label="Date of birth (optional, YYYY-MM-DD)"
              placeholder="1980-06-21"
              value={dob}
              onChangeText={setDob}
              keyboardType="numbers-and-punctuation"
              maxLength={10}
            />
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Who are they to you?</Text>
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
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>This person is an adult (18 or older)</Text>
              <Switch
                value={adult}
                onValueChange={setAdult}
                accessibilityLabel="This person is an adult, 18 or older"
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.card}
              />
            </View>
          </Section>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

/** The sunken field the visit screen uses, with its eyebrow label and optional why. */
function Field({
  label,
  hint,
  placeholder,
  value,
  onChangeText,
  keyboardType,
  maxLength,
}: {
  label: string;
  hint?: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  keyboardType?: "default" | "phone-pad" | "number-pad" | "numbers-and-punctuation";
  maxLength?: number;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, focused && styles.fieldLabelFocused]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType={keyboardType}
        maxLength={maxLength}
        accessibilityLabel={label}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        selectionColor={colors.primary}
        returnKeyType="done"
        style={[styles.input, focused && styles.inputFocused]}
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    fill: { flex: 1 },
    stack: { flexGrow: 1, gap: space[5] },
    lede: {
      fontFamily: font.body,
      fontSize: 14.5,
      lineHeight: 21,
      color: c.mutedForeground,
      marginTop: -space[3],
    },
    none: { fontFamily: font.body, fontSize: 14.5, lineHeight: 21, color: c.mutedForeground },
    notice: { fontFamily: font.bodyMedium, fontSize: 14.5, lineHeight: 21, color: c.primary },

    rows: { gap: space[3] },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: space[3],
      padding: space[3],
      borderRadius: radius["2xl"],
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    rowText: { flex: 1, gap: 2 },
    rowName: { fontFamily: font.bodyMedium, fontSize: 16, lineHeight: 22, color: c.foreground },
    rowMeta: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: c.mutedForeground },

    field: { gap: space[2] },
    fieldLabel: {
      fontFamily: font.body,
      fontSize: 12.5,
      letterSpacing: 0.3,
      color: c.mutedForeground,
    },
    fieldLabelFocused: { fontFamily: font.bodyMedium, color: c.primary },
    input: {
      minHeight: 48,
      paddingHorizontal: space[4],
      paddingVertical: space[3],
      borderRadius: radius.lg,
      backgroundColor: c.muted,
      borderWidth: 1,
      borderColor: c.border,
      fontFamily: font.body,
      fontSize: 14.5,
      lineHeight: 21,
      color: c.foreground,
    },
    inputFocused: { borderColor: c.primary },
    fieldHint: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: c.mutedForeground },

    switchRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: space[3],
      minHeight: 44,
    },
    switchLabel: { fontFamily: font.bodyMedium, fontSize: 15, lineHeight: 21, color: c.foreground },

    // Amber, not red: a refused member is not a clinical emergency.
    well: {
      flexDirection: "row",
      gap: space[2],
      alignItems: "flex-start",
      padding: space[3],
      borderRadius: radius.lg,
      backgroundColor: c.status.cautionBg,
      borderWidth: 1,
      borderColor: c.status.cautionFg,
    },
    wellText: {
      flex: 1,
      fontFamily: font.body,
      fontSize: 14.5,
      lineHeight: 21,
      color: c.foreground,
    },
  });
