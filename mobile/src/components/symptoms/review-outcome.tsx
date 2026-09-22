import type { Palette } from "@/theme/tokens";
import type { CatalogItem, Classification, ServiceLineHint } from "@shared/symptom-catalog/types";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { CATALOG } from "@shared/symptom-catalog/catalog.v0.1";
import { t } from "@shared/symptom-catalog/classify";
import { MAX_FREE_TEXT, TIER_LABEL_KEY } from "@shared/symptom-catalog/types";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { Button } from "@/components/ui/button";
import { useStyles, useTheme } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/** Navigation, not diagnosis: where the routine outcome points (PRD §2 non-goals). */
const SERVICE_LINE_WORD: Record<ServiceLineHint, string> = {
  general: "the general clinic",
  cardiology: "the heart clinic",
  diabetes_ncd: "the diabetes and pressure clinic",
  renal: "the kidney clinic",
  eye: "the eye clinic",
  ent: "the ear, nose and throat clinic",
  maternity: "the maternity clinic",
  paediatrics: "the children's clinic",
  mental_health: "the mental health clinic",
  surgery: "the surgical clinic",
  dermatology: "the skin clinic",
  orthopaedics: "the bones and joints clinic",
  tb: "the TB clinic",
};

/**
 * S4 (PRD §7.2): what was chosen, the tier as a word, "Because you chose…",
 * and the one next step per tier — the Emergency sheet, a same-day slot or
 * today's queue, or a booking. The catalog's own sentence (`catalog.note`)
 * closes every outcome; nothing here reassures. Local classification shows
 * at once; the server's answer replaces it when the submit lands.
 *
 * Amber is the Urgent tier's colour (PRD §5.2) and it is never alone: the
 * word sits on it. No red in this file — the emergency tier's action is a
 * plain primary button that leads to the red sheet.
 */
export function ReviewOutcome({
  items,
  classification,
  freeText,
  onFreeText,
  hospitalName,
  busy,
  error,
  noSlot,
  onSameDay,
  onQueue,
  onBook,
  onGetHelp,
}: {
  /** The chosen items, catalog order. */
  items: CatalogItem[];
  classification: Classification;
  freeText: string;
  onFreeText: (next: string) => void;
  hospitalName: string | null;
  busy: boolean;
  error: string | null;
  /** The same-day path found nothing today: offer the queue instead. */
  noSlot: boolean;
  onSameDay: () => void;
  onQueue: () => void;
  onBook: () => void;
  onGetHelp: () => void;
}) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [noteFocused, setNoteFocused] = useState(false);
  const { tier, reasons, serviceLineHint } = classification;
  const tierWord = t(CATALOG, TIER_LABEL_KEY[tier]);
  const because = items.filter((i) => reasons.includes(i.key)).map((i) => t(CATALOG, i.labelKey));
  const where = hospitalName ?? "your hospital";

  return (
    <View style={styles.stack}>
      <View style={[styles.tierCard, tier === "U" && styles.tierCardUrgent]}>
        <Ionicons
          name={tier === "R" ? "calendar-outline" : "alert-circle-outline"}
          size={22}
          color={tier === "U" ? colors.status.cautionFg : colors.foreground}
        />
        <View style={styles.tierText}>
          <Text accessibilityRole="header" style={styles.tierWord}>
            {tierWord}
          </Text>
          {because.length > 0 ? (
            <Text style={styles.because}>Because you chose: {because.join(" · ")}</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.list}>
        <Text style={styles.caption}>What you told us</Text>
        {items.map((item) => (
          <View key={item.key} style={styles.entry}>
            <Text style={styles.entryLabel}>{t(CATALOG, item.labelKey)}</Text>
            <Text style={styles.entryTier}>{t(CATALOG, TIER_LABEL_KEY[item.tier])}</Text>
          </View>
        ))}
      </View>

      {tier !== "E" ? (
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, noteFocused && styles.fieldLabelFocused]}>
            Anything else to tell the clinic? (optional)
          </Text>
          <TextInput
            value={freeText}
            onChangeText={onFreeText}
            onFocus={() => setNoteFocused(true)}
            onBlur={() => setNoteFocused(false)}
            multiline
            maxLength={MAX_FREE_TEXT}
            placeholder="In your own words. The clinic reads this; nothing else does."
            placeholderTextColor={colors.mutedForeground}
            selectionColor={colors.primary}
            accessibilityLabel="Anything else to tell the clinic? Optional."
            style={[styles.input, noteFocused && styles.inputFocused]}
          />
        </View>
      ) : null}

      {error ? (
        <View style={styles.well}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.status.cautionFg} />
          <Text style={styles.wellText} accessibilityLiveRegion="polite">
            {error}
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        {tier === "E" ? (
          <>
            <Button label={tierWord} onPress={onGetHelp} />
            <Button variant="link" label="Book a visit instead" onPress={onBook} disabled={busy} />
          </>
        ) : null}
        {tier === "U" ? (
          noSlot ? (
            <Button label="Join today's queue" busy={busy} onPress={onQueue} />
          ) : (
            <>
              <Text style={styles.lede}>The earliest place today at {where}.</Text>
              <Button label={tierWord} busy={busy} onPress={onSameDay} />
            </>
          )
        ) : null}
        {tier === "R" ? (
          <>
            {serviceLineHint ? (
              <Text style={styles.lede}>Start with {SERVICE_LINE_WORD[serviceLineHint]}.</Text>
            ) : null}
            <Button label={tierWord} busy={busy} onPress={onBook} />
          </>
        ) : null}
      </View>

      <Text style={styles.note}>{t(CATALOG, "catalog.note")}</Text>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    stack: { gap: space[5] },
    tierCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: space[3],
      padding: space[4],
      borderRadius: radius.xl,
      backgroundColor: c.muted,
      borderWidth: 1,
      borderColor: c.border,
    },
    tierCardUrgent: { backgroundColor: c.status.cautionBg, borderColor: c.status.cautionFg },
    tierText: { flex: 1, gap: space[1] },
    tierWord: {
      fontFamily: font.display,
      fontSize: 24,
      lineHeight: 30,
      letterSpacing: -0.3,
      color: c.foreground,
    },
    because: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: c.foreground },
    list: { gap: space[2] },
    caption: {
      fontFamily: font.body,
      fontSize: 12.5,
      letterSpacing: 0.3,
      color: c.mutedForeground,
    },
    entry: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: space[3],
      paddingHorizontal: space[3],
      paddingVertical: space[2],
      borderRadius: radius.lg,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    entryLabel: {
      flex: 1,
      fontFamily: font.bodyMedium,
      fontSize: 14.5,
      lineHeight: 20,
      color: c.foreground,
    },
    entryTier: { fontFamily: font.body, fontSize: 12.5, color: c.mutedForeground },
    field: { gap: space[2] },
    fieldLabel: {
      fontFamily: font.body,
      fontSize: 12.5,
      letterSpacing: 0.3,
      color: c.mutedForeground,
    },
    fieldLabelFocused: { fontFamily: font.bodyMedium, color: c.primary },
    input: {
      fontFamily: font.body,
      fontSize: 16,
      lineHeight: 22,
      color: c.foreground,
      minHeight: 72,
      paddingHorizontal: space[4],
      paddingVertical: space[3],
      borderRadius: radius.lg,
      backgroundColor: c.muted,
      borderWidth: 1,
      borderColor: c.border,
      textAlignVertical: "top",
    },
    inputFocused: { borderColor: c.primary },
    actions: { gap: space[3] },
    lede: { fontFamily: font.body, fontSize: 14.5, lineHeight: 21, color: c.foreground },
    note: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: c.mutedForeground },
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
