import type { ClinicSession, ServiceLine } from "@/lib/booking";
import type { Palette } from "@/theme/tokens";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { dateKey, dayLabel } from "@/lib/booking";
import { useStyles } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/**
 * A clinic as a tile — the name, its department, and the one fact that
 * matters on a glance: the soonest open day and the places left on it, or
 * that nothing is open. The clinic with a day open soonest is drawn on the
 * brand tint with a brand edge, so the emphasis carries a fact.
 *
 * The fee is not here. ADR 0092 makes both fee sentences ride with any
 * amount, and three lines of money on a half-width tile is what made the
 * old one unreadable; the clinic page states the fee, with both sentences,
 * before the patient commits — which is what the rule is for.
 */
export function ServiceLineCard({
  line,
  soonest,
  emphasis = false,
  onPress,
}: {
  line: ServiceLine;
  /** The soonest open clinic day for this line, from `fetchSessions`; null when none. */
  soonest: ClinicSession | null;
  emphasis?: boolean;
  onPress: () => void;
}) {
  const styles = useStyles(makeStyles);
  const places = soonest
    ? soonest.placesLeft > 0
      ? `${soonest.placesLeft} ${soonest.placesLeft === 1 ? "place" : "places"} left`
      : "Full"
    : null;

  return (
    <Pressable
      accessibilityRole="button"
      // No accessibilityLabel: it would REPLACE the children. They read in order.
      accessibilityHint="Opens this clinic"
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        emphasis && styles.tileEmphasis,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={2}>
          {line.name}
        </Text>
        <Text style={styles.dept} numberOfLines={1}>
          {line.departmentName}
        </Text>
      </View>

      <View style={styles.foot}>
        {soonest ? (
          <>
            <Text style={styles.soonestDay} numberOfLines={1}>
              {dayLabel(dateKey(new Date(soonest.startsAtIso)))}
            </Text>
            <Text style={styles.soonest} numberOfLines={1}>
              {places}
            </Text>
          </>
        ) : (
          <Text style={styles.soonest}>Nothing open yet</Text>
        )}
      </View>
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    // Two to a row in the home grid, whatever the count.
    tile: {
      flexBasis: "47%",
      flexGrow: 1,
      minHeight: 124,
      padding: space[4],
      gap: space[3],
      borderRadius: radius["2xl"],
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    tileEmphasis: { backgroundColor: c.accent, borderColor: c.primary },
    pressed: { opacity: 0.88 },
    text: { gap: 1 },
    name: { fontFamily: font.bodyMedium, fontSize: 15, lineHeight: 20, color: c.foreground },
    dept: { fontFamily: font.body, fontSize: 12.5, lineHeight: 17, color: c.mutedForeground },
    foot: { marginTop: "auto", gap: 1 },
    soonestDay: {
      fontFamily: font.bodyMedium,
      fontSize: 12.5,
      lineHeight: 17,
      color: c.primary,
    },
    soonest: { fontFamily: font.body, fontSize: 12.5, lineHeight: 17, color: c.mutedForeground },
  });
