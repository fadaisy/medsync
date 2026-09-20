import type { ClinicianOption } from "@/lib/booking";
import type { Palette } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Avatar } from "@/components/ui/avatar";
import { Rating } from "@/components/ui/rating";
import { dayLabel } from "@/lib/booking";
import { useStyles, useTheme } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/**
 * One doctor in a list — the reference's row: photo or monogram, name,
 * specialty (or the department when the affiliation names none), and the
 * rating or its honest absence (ADR 0085 §1, §2). The home shows up to three;
 * the doctors list shows them all. Both import this so the row cannot drift.
 *
 * `onPress` opens the doctor page. The one thing the row says about days is
 * whether there is one: "Next open: Thu 18 Sep" or "No days open yet" — so a
 * patient scanning the roster (ADR 0086) is not sent into a page with nothing
 * to pick. Times and counts live on that page.
 */
export function DoctorRow({
  option,
  onPress,
  tile = false,
}: {
  option: ClinicianOption;
  onPress: () => void;
  /** Two a row in a grid: avatar over name over the next open day; no chevron. */
  tile?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const nextOpen = Object.keys(option.slotsByDate).sort()[0];

  if (tile) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityHint="Opens this doctor"
        onPress={onPress}
        style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
      >
        <Avatar name={option.fullName} size={44} uri={option.photoUrl} />
        <Text style={styles.who} numberOfLines={1}>
          {option.fullName}
        </Text>
        <Text style={styles.what} numberOfLines={1}>
          {option.specialty ?? option.cadre}
        </Text>
        <Text style={[styles.when, !nextOpen && styles.whenNone]} numberOfLines={1}>
          {nextOpen ? `Next ${dayLabel(nextOpen)}` : "No days open"}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Opens this doctor"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Avatar name={option.fullName} size={56} uri={option.photoUrl} />
      <View style={styles.text}>
        <Text style={styles.who} numberOfLines={1}>
          {option.fullName}
        </Text>
        <Text style={styles.what} numberOfLines={1}>
          {option.specialty ?? option.cadre} · {option.departmentName}
        </Text>
        <Rating rating={option.rating} size="sm" />
        <Text style={[styles.when, !nextOpen && styles.whenNone]} numberOfLines={1}>
          {nextOpen ? `Next open: ${dayLabel(nextOpen)}` : "No days open yet"}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={colors.mutedForeground}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    // The same card the visits list draws: a raised surface with an edge, so
    // a white card on a white page still has an outline.
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
    tile: {
      gap: 2,
      padding: space[3],
      borderRadius: radius["2xl"],
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    // Opacity, never scale — the kit's rule for every pressed thing.
    pressed: { opacity: 0.88 },

    text: { flex: 1, gap: 2 },
    who: { fontFamily: font.bodyMedium, fontSize: 16, lineHeight: 22, color: c.foreground },
    what: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: c.mutedForeground },
    when: { fontFamily: font.bodyMedium, fontSize: 13, lineHeight: 18, color: c.primary },
    whenNone: { fontFamily: font.body, color: c.mutedForeground },
  });
