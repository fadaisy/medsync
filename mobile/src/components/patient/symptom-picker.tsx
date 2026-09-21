import type { BookingSymptomOption } from "@/lib/booking";
import type { Palette } from "@/theme/tokens";
import type { BookingSymptom, SymptomDuration } from "@shared/symptoms";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  MAX_SYMPTOM_LABEL,
  MAX_SYMPTOMS,
  SYMPTOM_DURATIONS,
  SYMPTOM_SYSTEMS,
  SYMPTOMS_NOTE,
  symptomSystemLabel,
} from "@shared/symptoms";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { Section } from "@/components/ui/section";
import { useStyles, useTheme } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/**
 * A chosen symptom while the patient is still choosing: the duration is null
 * until they tap one. `completeSymptoms` is the only way out of this shape.
 */
export interface SymptomDraft {
  code: string | null;
  label: string;
  duration: SymptomDuration | null;
}

/**
 * The drafts as the wire shape, or null while any still lacks a duration —
 * the one thing the sheet's Confirm gates on. Empty in, empty out: nothing
 * chosen is a booking with no `symptoms`, not a blocked one.
 */
export function completeSymptoms(drafts: readonly SymptomDraft[]): BookingSymptom[] | null {
  const out: BookingSymptom[] = [];
  for (const d of drafts) {
    if (!d.duration) return null;
    out.push({ code: d.code, label: d.label, duration: d.duration });
  }
  return out;
}

const matches = (o: BookingSymptomOption, q: string) =>
  o.display.toLowerCase().includes(q) || o.synonyms.some((s) => s.toLowerCase().includes(q));

/**
 * "What is bothering you?" — the descriptive symptom list a booking may
 * carry (ADR 0095). Words for the clinic and nothing else: the chips are the
 * catalogue in its own order, flat, with none of its decision-support flags;
 * nothing here ranks, routes or colours a choice. Optional throughout.
 */
export function SymptomPicker({
  options,
  value,
  onChange,
}: {
  options: BookingSymptomOption[];
  value: SymptomDraft[];
  onChange: (next: SymptomDraft[]) => void;
}) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState("");
  const [focused, setFocused] = useState<"search" | "custom" | null>(null);

  const full = value.length >= MAX_SYMPTOMS;
  const has = (label: string) => value.some((v) => v.label.toLowerCase() === label.toLowerCase());
  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => matches(o, q)) : options;
  // The catalogue's systems in the lay order, then anything it does not name.
  const named = new Set<string>(SYMPTOM_SYSTEMS.map((s) => s.code));
  const systems = [
    ...SYMPTOM_SYSTEMS.map((s) => s.code),
    ...new Set(shown.filter((o) => !named.has(o.system)).map((o) => o.system)),
  ];

  const toggle = (o: BookingSymptomOption) => {
    if (value.some((v) => v.code === o.code)) {
      onChange(value.filter((v) => v.code !== o.code));
    } else if (!full) {
      onChange([...value, { code: o.code, label: o.display, duration: null }]);
    }
  };
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));
  const setDuration = (i: number, duration: SymptomDuration) =>
    onChange(value.map((v, j) => (j === i ? { ...v, duration } : v)));
  const addCustom = () => {
    const label = custom.trim();
    if (!label || full || has(label)) return;
    onChange([...value, { code: null, label, duration: null }]);
    setCustom("");
  };

  return (
    <Section title="What is bothering you?">
      <Text style={styles.lede}>Optional. Choose anything that fits, or type your own.</Text>

      {value.map((v, i) => (
        <View key={`${v.code ?? "custom"}:${v.label}`} style={styles.chosen}>
          <View style={styles.chosenHead}>
            <Text style={styles.chosenLabel}>{v.label}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${v.label}`}
              onPress={() => remove(i)}
              style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
            >
              <Ionicons name="close" size={20} color={colors.foreground} />
            </Pressable>
          </View>
          <Text style={styles.eyebrow}>Duration</Text>
          <ChipRow>
            {SYMPTOM_DURATIONS.map((d) => (
              <Chip
                key={d.code}
                label={d.label}
                selected={v.duration === d.code}
                onPress={() => setDuration(i, d.code)}
              />
            ))}
          </ChipRow>
        </View>
      ))}

      <TextInput
        value={query}
        onChangeText={setQuery}
        onFocus={() => setFocused("search")}
        onBlur={() => setFocused(null)}
        placeholder="Search the list"
        placeholderTextColor={colors.mutedForeground}
        selectionColor={colors.primary}
        autoCorrect={false}
        accessibilityLabel="Search"
        style={[styles.input, focused === "search" && styles.inputFocused]}
      />

      {systems.map((code) => {
        const group = shown.filter((o) => o.system === code);
        if (group.length === 0) return null;
        return (
          <View key={code} style={styles.group}>
            <Text style={styles.eyebrow}>{symptomSystemLabel(code)}</Text>
            <ChipRow>
              {group.map((o) => {
                const chosen = value.some((v) => v.code === o.code);
                return (
                  <Chip
                    key={o.code}
                    role="button"
                    label={o.display}
                    selected={chosen}
                    disabled={!chosen && full}
                    onPress={() => toggle(o)}
                  />
                );
              })}
            </ChipRow>
          </View>
        );
      })}
      {q && shown.length === 0 ? (
        <Text style={styles.lede}>Nothing in the list matches. Type it in below.</Text>
      ) : null}

      <View style={styles.custom}>
        <Text style={styles.eyebrow}>Something else</Text>
        <TextInput
          value={custom}
          onChangeText={setCustom}
          onFocus={() => setFocused("custom")}
          onBlur={() => setFocused(null)}
          onSubmitEditing={addCustom}
          maxLength={MAX_SYMPTOM_LABEL}
          placeholder="In your own words"
          placeholderTextColor={colors.mutedForeground}
          selectionColor={colors.primary}
          returnKeyType="done"
          accessibilityLabel="Something else"
          style={[styles.input, focused === "custom" && styles.inputFocused]}
        />
        <Button
          variant="secondary"
          label="Add"
          disabled={!custom.trim() || full}
          onPress={addCustom}
        />
      </View>

      <Text style={styles.note}>{SYMPTOMS_NOTE}</Text>
    </Section>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    lede: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: c.mutedForeground },
    eyebrow: {
      fontFamily: font.body,
      fontSize: 12.5,
      letterSpacing: 0.3,
      color: c.mutedForeground,
    },
    group: { gap: space[2] },

    // One chosen entry: its words, a way out, and its duration underneath.
    chosen: {
      gap: space[2],
      padding: space[3],
      borderRadius: radius.lg,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    chosenHead: { flexDirection: "row", alignItems: "center", gap: space[2] },
    chosenLabel: {
      flex: 1,
      fontFamily: font.bodyMedium,
      fontSize: 15,
      lineHeight: 20,
      color: c.foreground,
    },
    remove: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.muted,
    },
    pressed: { opacity: 0.7 },

    // The same well as the note field: muted, a hairline, primary on focus.
    input: {
      fontFamily: font.body,
      fontSize: 14.5,
      lineHeight: 21,
      color: c.foreground,
      minHeight: 48,
      paddingHorizontal: space[4],
      paddingVertical: space[3],
      borderRadius: radius.lg,
      backgroundColor: c.muted,
      borderWidth: 1,
      borderColor: c.border,
    },
    inputFocused: { borderColor: c.primary },
    custom: { gap: space[2] },

    note: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: c.mutedForeground },
  });
