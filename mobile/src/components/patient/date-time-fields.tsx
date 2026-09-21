import type { SlotOffer } from "@/lib/booking";
import type { Palette } from "@/theme/tokens";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { DayStrip } from "@/components/patient/day-strip";
import { formatTime } from "@/lib/booking";
import { useStyles } from "@/theme/theme";
import { font, space } from "@/theme/tokens";

/**
 * The day strip, and under it the chosen day's open times as plain badges —
 * the chosen one filled. Same component, same name, on the web.
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
        <View style={styles.badges} accessibilityRole="radiogroup">
          {slots.map((s) => {
            const checked = s.startsAtIso === slot?.startsAtIso;
            return (
              <Pressable
                key={s.startsAtIso}
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
            );
          })}
        </View>
      )}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    stack: { gap: space[5] },
    none: { fontFamily: font.body, fontSize: 14, color: c.mutedForeground },
    badges: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
    badge: {
      minHeight: 36,
      paddingHorizontal: 14,
      borderRadius: 18,
      justifyContent: "center",
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    badgeChecked: { backgroundColor: c.foreground, borderColor: c.foreground },
    pressed: { opacity: 0.7 },
    badgeText: { fontFamily: font.mono, fontSize: 13, color: c.foreground },
    badgeTextChecked: { color: c.background },
  });
