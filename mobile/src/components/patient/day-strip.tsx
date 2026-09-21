import type { Palette } from "@/theme/tokens";
import { useMemo, useRef, useState } from "react";
import { DEFAULT_TIME_ZONE } from "@shared/slots";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { dateKey, dayLabel } from "@/lib/booking";
import { useStyles } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/**
 * ADR 0084 §10's day strip, drawn as the reference: a pill per day with its
 * number in a disc and the weekday letter above — one week across, from
 * today, swiping sideways a week at a time for the rest of the horizon. The
 * month chips above jump to a month and name the week on view. The chosen
 * day is raised with the brand disc and a ▼ over it; a day the clinic has
 * nothing open is sunk and grey, and not a target.
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
  const months = useMemo(() => [...new Set(cells.map((k) => k.slice(0, 7)))], [cells]);

  const strip = useRef<ScrollView>(null);
  // The strip's width is the page; a cell is a seventh of it.
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const month = cells[page * 7]!.slice(0, 7);

  const goTo = (p: number) => {
    strip.current?.scrollTo({ x: p * width, animated: true });
    setPage(p);
  };

  return (
    <View style={styles.stack}>
      <View style={styles.months} accessibilityRole="radiogroup">
        {months.map((m) => {
          const checked = m === month;
          return (
            <Pressable
              key={m}
              accessibilityRole="radio"
              accessibilityState={{ checked }}
              onPress={() => goTo(Math.floor(cells.findIndex((k) => k.startsWith(m)) / 7))}
              style={({ pressed }) => [
                styles.monthChip,
                checked && styles.monthChipChecked,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.monthText, checked && styles.monthTextChecked]}>
                {MONTH_LONG.format(atNoon(`${m}-01`))}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        ref={strip}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stripContent}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onMomentumScrollEnd={(e) => {
          const p = Math.round(e.nativeEvent.contentOffset.x / Math.max(width, 1));
          if (p !== page) setPage(p);
        }}
        accessibilityRole="radiogroup"
      >
        {cells.map((key) => {
          const isOpen = open.has(key);
          const checked = key === selected;
          return (
            <View key={key} style={[styles.cell, { width: width / 7 }]}>
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
      </ScrollView>
    </View>
  );
}

const WEEKDAY_LETTER = new Intl.DateTimeFormat("en-GB", {
  weekday: "narrow",
  timeZone: DEFAULT_TIME_ZONE,
});
const MONTH_LONG = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" });

function atNoon(key: string): Date {
  return new Date(`${key}T12:00:00Z`);
}

/** Every day from `from` through `to`, padded to whole weeks of seven. */
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
    stack: { gap: space[3] },
    months: { flexDirection: "row", gap: space[2] },
    monthChip: {
      minHeight: 36,
      paddingHorizontal: 14,
      borderRadius: radius.lg,
      justifyContent: "center",
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    monthChipChecked: { backgroundColor: c.foreground, borderColor: c.foreground },
    monthText: { fontFamily: font.bodyMedium, fontSize: 14, color: c.foreground },
    monthTextChecked: { color: c.background },

    // Room under the row for the raised pill's shadow.
    stripContent: { paddingBottom: 12 },
    cell: { alignItems: "center", paddingTop: 2 },
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
