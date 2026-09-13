import type { Palette } from "@/theme/tokens";
import { DEFAULT_TIME_ZONE } from "@shared/slots";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { dayLabel } from "@/lib/booking";
import { useStyles } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/**
 * ADR 0084 §10's day chips — one tile per day the clinic actually has open,
 * and nothing else: the weekday over the day number, "Today" / "Tomorrow"
 * as a caption where it applies.
 *
 * Not a date input and not a month grid. On a low-end Android WebView a date
 * input degrades to a typed `yyyy-mm-dd` field, and date entry with
 * low-literacy users is the single most consequential hole the research
 * found; a flat list of the days that exist is the shape the HCI4D evidence
 * endorses. It wraps rather than scrolling sideways so every day is on screen
 * at once — a tile hidden off the edge is a day the patient never sees.
 *
 * The keys are whatever the data layer returned: the horizon is a server rule
 * (§8), so nothing here slices, filters or re-sorts. The label is a day and
 * never an hour.
 *
 * Selection is the brand fill with the brand's ink, and the radio state a
 * screen reader announces — the fill flip is a luminance change, not a hue
 * one, so it survives a monochrome screen.
 */
export function DayStrip({
  days,
  selected,
  onSelect,
}: {
  /** `dateKey`s, ascending, straight from `slotsByDate`. */
  days: readonly string[];
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  const styles = useStyles(makeStyles);

  return (
    <View style={styles.strip} accessibilityRole="radiogroup">
      {days.map((key) => {
        const checked = key === selected;
        const label = dayLabel(key);
        const { weekday, day } = partsOf(key);
        // "Thu 18 Sep" carries its own date; only the relative words need a
        // caption under the number.
        const caption = label === "Today" || label === "Tomorrow" ? label : null;
        return (
          <Pressable
            key={key}
            accessibilityRole="radio"
            accessibilityState={{ checked }}
            accessibilityLabel={label}
            onPress={() => onSelect(key)}
            style={({ pressed }) => [
              styles.tile,
              checked && styles.tileChecked,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.weekday, checked && styles.inkChecked]}>{weekday}</Text>
            <Text style={[styles.day, checked && styles.inkChecked]}>{day}</Text>
            {caption ? (
              <Text style={[styles.caption, checked && styles.inkChecked]}>{caption}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** "Thu" and "18" for a `dateKey`, in the clinic's zone — display only. */
const PARTS_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: DEFAULT_TIME_ZONE,
  weekday: "short",
  day: "numeric",
});

function partsOf(key: string): { weekday: string; day: string } {
  // Noon so the parsed instant is the intended civil day in every zone.
  const parts = PARTS_FMT.formatToParts(new Date(`${key}T12:00:00Z`));
  return {
    weekday: parts.find((p) => p.type === "weekday")?.value ?? "",
    day: parts.find((p) => p.type === "day")?.value ?? "",
  };
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    strip: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
    // A card with its edge, and the brand fill with the brand's ink when
    // chosen. 56×64 — a 44px target with room for three lines.
    tile: {
      width: 56,
      height: 64,
      borderRadius: radius.lg,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
    },
    tileChecked: { backgroundColor: c.primary, borderColor: c.primary },
    // Opacity, never scale — the same rule as the buttons.
    pressed: { opacity: 0.7 },
    weekday: { fontFamily: font.body, fontSize: 12.5, lineHeight: 16, color: c.mutedForeground },
    day: { fontFamily: font.bodyMedium, fontSize: 18, lineHeight: 22, color: c.foreground },
    caption: {
      fontFamily: font.bodyMedium,
      fontSize: 10,
      lineHeight: 12,
      color: c.mutedForeground,
    },
    inkChecked: { color: c.primaryForeground },
  });
