import type { SlotOffer } from "@/lib/booking";
import type { Palette } from "@/theme/tokens";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { DayStrip } from "@/components/patient/day-strip";
import { formatTime } from "@/lib/booking";
import { useStyles } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/**
 * The day strip, and under it the chosen day's open times as an even grid
 * of soft badges, four across — the chosen one in ink. Same component, same
 * name, on the web.
 */
export function DateTimeFields({
  slotsByDate,
  day,
  slot,
  onDay,
  onSlot,
}: {
  slotsByDate: Record<string, readonly SlotOffer[]>;
  day: string | null;
  slot: SlotOffer | null;
  onDay: (day: string) => void;
  onSlot: (slot: SlotOffer) => void;
}) {
  const styles = useStyles(makeStyles);
  const days = Object.keys(slotsByDate).sort();
  const slots = day ? (slotsByDate[day] ?? []) : [];

  return (
    <View style={styles.stack}>
      <DayStrip days={days} selected={day} onSelect={onDay} />
      {day === null ? null : slots.length === 0 ? (
        <Text style={styles.none}>Nothing open that day.</Text>
      ) : (
        <View style={styles.grid} accessibilityRole="radiogroup">
          {slots.map((s) => {
            const checked = s.startsAtIso === slot?.startsAtIso;
            return (
              <View key={s.startsAtIso} style={styles.cell}>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked }}
                  accessibilityLabel={`${formatTime(s.startsAtIso)} to ${formatTime(s.endsAtIso)}`}
                  onPress={() => onSlot(s)}
                  style={({ pressed }) => [
                    styles.badge,
                    checked && styles.badgeChecked,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.badgeText, checked && styles.badgeTextChecked]}>
                    {formatTime(s.startsAtIso)}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    stack: { gap: space[3] },
    none: { fontFamily: font.body, fontSize: 14, color: c.mutedForeground },
    // Four across; the gutter is each cell's padding, pulled back at the edges.
    grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
    cell: { width: "25%", padding: 4 },
    badge: {
      height: 40,
      borderRadius: radius.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.muted,
    },
    badgeChecked: { backgroundColor: c.foreground },
    pressed: { opacity: 0.7 },
    badgeText: { fontFamily: font.bodyMedium, fontSize: 13.5, color: c.foreground },
    badgeTextChecked: { color: c.background },
  });
