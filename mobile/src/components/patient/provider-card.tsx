import type { ClinicianOption } from "@/lib/booking";
import type { Palette } from "@/theme/tokens";
import type { DimensionValue } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Avatar } from "@/components/ui/avatar";
import { dayLabel } from "@/lib/booking";
import { useStyles, useTheme } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/**
 * A clinician as a tile — the one shape a doctor takes everywhere: the home
 * row and the doctors list draw this same card, so a face and a name look
 * the same wherever they are met.
 *
 * The photo (or monogram) is a disc, never a block: most clinicians have no
 * photo on day one, and a card built around a photo is a card built around
 * an empty tint. Under it the name, the specialty, and the one fact about
 * days — "Next open: Today" in the brand, or "No days open" quietly. A
 * rating shows only when there is one (ADR 0085 §2); its absence is not
 * announced. The whole card is the target; there is no arrow to aim at.
 */
export function ProviderCard({
  option,
  seenBefore = false,
  width,
  onPress,
}: {
  option: ClinicianOption;
  seenBefore?: boolean;
  /** A fixed width in a carousel; a percentage in a grid. */
  width?: DimensionValue;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const nextOpen = Object.keys(option.slotsByDate).sort()[0];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${option.fullName}, ${option.specialty ?? option.cadre}, ${option.departmentName}. ${
        nextOpen ? `Next open ${dayLabel(nextOpen)}` : "No days open"
      }`}
      accessibilityHint="Opens this clinician"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        width !== undefined && { width },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.top}>
        <Avatar name={option.fullName} size={56} uri={option.photoUrl} />
        {option.rating ? (
          <View style={styles.rating}>
            <Ionicons name="star" size={11} color={colors.primary} />
            <Text style={styles.ratingText}>{option.rating.average.toFixed(1)}</Text>
          </View>
        ) : seenBefore ? (
          <View style={styles.rating}>
            <Text style={styles.ratingText}>Seen you</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {option.fullName}
        </Text>
        <Text style={styles.dept} numberOfLines={1}>
          {option.specialty ?? option.cadre}
        </Text>
      </View>

      <Text style={[styles.next, !nextOpen && styles.nextNone]} numberOfLines={1}>
        {nextOpen ? `Next open: ${dayLabel(nextOpen)}` : "No days open"}
      </Text>
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: {
      gap: space[3],
      padding: space[4],
      borderRadius: radius["2xl"],
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    pressed: { opacity: 0.88 },
    top: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
    rating: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      paddingHorizontal: space[2],
      paddingVertical: 3,
      borderRadius: radius.full,
      backgroundColor: c.accent,
    },
    ratingText: { fontFamily: font.bodyMedium, fontSize: 11.5, color: c.accentForeground },
    text: { gap: 1 },
    name: { fontFamily: font.bodyMedium, fontSize: 15, lineHeight: 20, color: c.foreground },
    dept: { fontFamily: font.body, fontSize: 12.5, lineHeight: 17, color: c.mutedForeground },
    next: { fontFamily: font.bodyMedium, fontSize: 12.5, lineHeight: 17, color: c.primary },
    nextNone: { fontFamily: font.body, color: c.mutedForeground },
  });
