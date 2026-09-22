import type { Palette } from "@/theme/tokens";
import { StyleSheet, Text, View } from "react-native";

import { Watermark } from "@/components/emergency/watermark";
import { useStyles } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/**
 * ⚠ DRAFT — PENDING CLINICAL SAFETY OFFICER SIGN-OFF (PRD §5.6; Gate A
 * item 5). The two cards the owner asked to sign first, in the PRD's own
 * words; non-drug, WHO Basic Emergency Care-consistent one-liners. Behind
 * `EXPO_PUBLIC_FEATURE_FIRST_AID_CARDS` (off), and under the watermark
 * until a signed version exists. Reviewer: replace the array, leave the
 * component alone.
 */
export const FIRST_AID_CARDS: readonly { key: string; text: string }[] = [
  { key: "bleeding_pressure", text: "Press firmly on bleeding with a clean cloth." },
  { key: "note_the_time", text: "Note the time the weakness started." },
];

export function FirstAidCards() {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.block}>
      <Watermark>First-aid cards are drafts awaiting sign-off.</Watermark>
      <Text accessibilityRole="header" style={styles.title}>
        While you wait
      </Text>
      {FIRST_AID_CARDS.map((card) => (
        <View key={card.key} style={styles.card}>
          <Text style={styles.text}>{card.text}</Text>
        </View>
      ))}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    block: { gap: space[2] },
    title: { fontFamily: font.bodyMedium, fontSize: 16.5, lineHeight: 22, color: c.foreground },
    card: {
      padding: space[3],
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    text: { fontFamily: font.body, fontSize: 15, lineHeight: 22, color: c.foreground },
  });
