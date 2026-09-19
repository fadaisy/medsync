import type { ClinicSession, ServiceLine } from "@/lib/booking";
import type { Palette } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { dateKey, dayLabel } from "@/lib/booking";
import { useStyles, useTheme } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/**
 * A clinic as a category tile — the reference design's "General Visits"
 * grid, in this palette. One tile is filled the way the reference fills one:
 * the clinic with something open soonest, so the emphasis carries a fact.
 * Same component, same name, on the web.
 *
 * The reference puts a price on each tile. Here the tile carries the
 * capacity mode instead — a patient should know whether they are about to
 * get a position or a time before they tap (ADR 0088) — and, where the line
 * charges, the fee as a plain current amount on the clinic page, never as a
 * tile ornament (ADR 0092).
 */

const MODE_WORD: Record<string, string> = {
  session: "Clinic day — a position and a time to arrive by",
  slot: "Appointment time",
  open_queue: "Same-day queue",
};

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
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${line.name}, ${line.departmentName}`}
      accessibilityHint="Opens this clinic"
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        emphasis && styles.tileFilled,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.text}>
        <Text style={[styles.name, emphasis && styles.onFilled]} numberOfLines={1}>
          {line.name}
        </Text>
        <Text style={[styles.dept, emphasis && styles.onFilledMuted]} numberOfLines={1}>
          {line.departmentName}
        </Text>
      </View>

      <Text style={[styles.mode, emphasis && styles.onFilledMuted]} numberOfLines={2}>
        {MODE_WORD[line.capacityMode] ?? line.capacityMode}
      </Text>

      <View style={styles.foot}>
        <Text style={[styles.soonest, emphasis && styles.onFilledMuted]} numberOfLines={2}>
          {soonest ? (
            <>
              Soonest{" "}
              <Text style={[styles.soonestDay, emphasis && styles.onFilled]}>
                {dayLabel(dateKey(new Date(soonest.startsAtIso)))}
              </Text>
              {soonest.placesLeft > 0
                ? ` · ${soonest.placesLeft} ${soonest.placesLeft === 1 ? "place" : "places"} left`
                : ""}
            </>
          ) : (
            "Nothing open yet"
          )}
        </Text>
        <View style={[styles.arrow, emphasis && styles.arrowOnFilled]} accessibilityElementsHidden>
          <Ionicons
            name="arrow-forward"
            size={16}
            color={emphasis ? colors.primary : colors.primaryForeground}
          />
        </View>
      </View>
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    tile: {
      flex: 1,
      minHeight: 150,
      padding: space[4],
      gap: space[2],
      borderRadius: radius["2xl"],
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    // The reference's one filled tile: the brand's primary as an accent on
    // ONE card, never a ground — "I hate the purple background."
    tileFilled: { backgroundColor: c.primary, borderColor: c.primary },
    pressed: { opacity: 0.88 },
    text: { gap: 2 },
    name: { fontFamily: font.bodyMedium, fontSize: 15, lineHeight: 20, color: c.foreground },
    dept: { fontFamily: font.body, fontSize: 12.5, lineHeight: 17, color: c.mutedForeground },
    mode: { fontFamily: font.body, fontSize: 12.5, lineHeight: 17, color: c.mutedForeground },
    foot: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      gap: space[2],
      marginTop: "auto",
    },
    soonest: {
      flex: 1,
      fontFamily: font.body,
      fontSize: 12.5,
      lineHeight: 17,
      color: c.mutedForeground,
    },
    soonestDay: { fontFamily: font.bodyMedium, color: c.foreground },
    onFilled: { color: c.primaryForeground },
    onFilledMuted: { color: c.primaryForeground, opacity: 0.8 },
    arrow: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.primary,
    },
    arrowOnFilled: { backgroundColor: c.primaryForeground },
  });
