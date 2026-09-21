import type { Palette } from "@/theme/tokens";
import { useMemo } from "react";
import { DEFAULT_TIME_ZONE } from "@shared/slots";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { dateKey, dayLabel } from "@/lib/booking";
import { useStyles } from "@/theme/theme";
import { font, space } from "@/theme/tokens";

/**
 * ADR 0084 §10's day strip, drawn as the reference: a pill per day with its
 * number in a disc and the weekday letter above, seven to a row from today.
 * The chosen day is raised with the brand disc and a ▼ over it; a day the
 * clinic has nothing open is sunk and grey, and not a target. Rows wrap so
 * every day the horizon holds is on screen at once — a tile hidden off the
 * edge is a day the patient never sees.
 *
 * The keys are whatever the data layer returned: the horizon is a server rule
 * (§8), so nothing here filters or re-sorts; the calendar days between are
 * drawn closed. Selection is a luminance change plus the raise, the marker
 * and the radio state a screen reader announces — never colour alone.
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
  const today = dateKey(new Date());
  const open = useMemo(() => new Set(days), [days]);
  const cells = useMemo(() => weekRows(today, days[days.length - 1] ?? today), [today, days]);

  return (
    <View style={styles.strip} accessibilityRole="radiogroup">
      {cells.map((key) => {
        const isOpen = open.has(key);
        const checked = key === selected;
        return (
          <View key={key} style={styles.cell}>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked, disabled: !isOpen }}
              accessibilityLabel={`${dayLabel(key)}${isOpen ? "" : ", nothing open"}`}
              disabled={!isOpen}
              onPress={() => onSelect(key)}
              style={({ pressed }) => [styles.column, pressed && styles.pressed]}
            >
              <Text style={styles.marker}>{checked ? "▼" : ""}</Text>
              <Text style={styles.weekday}>{WEEKDAY_LETTER.format(atNoon(key))}</Text>
              <View
                style={[
                  styles.pill,
                  checked ? styles.pillChecked : isOpen ? styles.pillOpen : styles.pillClosed,
                ]}
              >
                <View
                  style={[
                    styles.disc,
                    checked ? styles.discChecked : isOpen ? styles.discOpen : styles.discClosed,
                  ]}
                >
                  <Text
                    style={[
                      styles.day,
                      checked ? styles.dayChecked : isOpen ? null : styles.dayClosed,
                    ]}
                  >
                    {Number(key.slice(8, 10))}
                  </Text>
                </View>
              </View>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const WEEKDAY_LETTER = new Intl.DateTimeFormat("en-GB", {
  weekday: "narrow",
  timeZone: DEFAULT_TIME_ZONE,
});

function atNoon(key: string): Date {
  return new Date(`${key}T12:00:00Z`);
}

/** Every day from `from` through `to`, padded to whole rows of seven. */
function weekRows(from: string, to: string): string[] {
  const out: string[] = [];
  const t = atNoon(from);
  const end = atNoon(to < from ? from : to).getTime();
  while (t.getTime() <= end || out.length % 7 !== 0) {
    out.push(t.toISOString().slice(0, 10));
    t.setUTCDate(t.getUTCDate() + 1);
  }
  return out;
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    strip: { flexDirection: "row", flexWrap: "wrap", rowGap: space[3] },
    cell: { width: `${100 / 7}%`, alignItems: "center" },
    column: { alignItems: "center", gap: 4 },
    // Opacity, never scale — the same rule as the buttons.
    pressed: { opacity: 0.7 },
    marker: { height: 12, fontSize: 9, lineHeight: 12, color: c.foreground },
    weekday: {
      fontFamily: font.bodyMedium,
      fontSize: 12,
      lineHeight: 16,
      color: c.mutedForeground,
    },
    // 40×68 — a 44px-tall target with the disc near the top, as the reference.
    pill: {
      width: 40,
      height: 68,
      borderRadius: 20,
      alignItems: "center",
      paddingTop: 4,
    },
    pillChecked: {
      backgroundColor: c.card,
      shadowColor: "#000",
      shadowOpacity: 0.16,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
      transform: [{ translateY: -2 }],
    },
    pillOpen: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border },
    pillClosed: { backgroundColor: c.muted },
    disc: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    discChecked: { backgroundColor: c.primary },
    discOpen: { borderWidth: 1, borderColor: c.border },
    discClosed: { backgroundColor: c.border },
    day: { fontFamily: font.mono, fontSize: 14, lineHeight: 18, color: c.foreground },
    dayChecked: { color: c.primaryForeground, fontFamily: font.bodyMedium },
    dayClosed: { color: c.mutedForeground, opacity: 0.6 },
  });
