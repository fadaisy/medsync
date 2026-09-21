import type { SlotOffer } from "@/lib/booking";
import type { Palette } from "@/theme/tokens";
import { useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { dateKey, dayLabel, formatTime } from "@/lib/booking";
import { useStyles, useTheme } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/**
 * The reference's "Schedule send": two fields side by side — the day, with a
 * calendar icon, that opens a month grid; the time, with a clock icon, that
 * opens the day's open times — and nothing else. The grid enables only days
 * with something open; the chosen day is the one filled square. Each field
 * opens a sheet from the bottom. Same component, same name, on the web.
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
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const days = useMemo(() => Object.keys(slotsByDate).sort(), [slotsByDate]);
  const openDays = useMemo(() => new Set(days), [days]);
  const slots = day ? (slotsByDate[day] ?? []) : [];
  const today = dateKey(new Date());
  const [sheet, setSheet] = useState<"day" | "time" | null>(null);
  const [month, setMonth] = useState<string>(() => (day ?? days[0] ?? today).slice(0, 7));

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Day: ${day ? dayLabel(day) : "not chosen"}. Opens a calendar`}
        onPress={() => setSheet("day")}
        style={({ pressed }) => [styles.field, pressed && styles.pressed]}
      >
        <Ionicons name="calendar-outline" size={18} color={colors.mutedForeground} />
        <Text style={[styles.fieldText, !day && styles.fieldPlaceholder]} numberOfLines={1}>
          {day ? dayLabel(day) : "Choose a day"}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Time: ${slot ? formatTime(slot.startsAtIso) : "not chosen"}. Opens the open times`}
        disabled={slots.length === 0}
        onPress={() => setSheet("time")}
        style={({ pressed }) => [
          styles.field,
          slots.length === 0 && styles.fieldOff,
          pressed && styles.pressed,
        ]}
      >
        <Ionicons name="time-outline" size={18} color={colors.mutedForeground} />
        <Text style={[styles.fieldText, !slot && styles.fieldPlaceholder]} numberOfLines={1}>
          {slot ? formatTime(slot.startsAtIso) : slots.length === 0 ? "No times" : "Choose a time"}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />
      </Pressable>

      <Modal
        visible={sheet !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSheet(null)}
      >
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text accessibilityRole="header" style={styles.sheetTitle}>
              {sheet === "day" ? "Choose a day" : "Choose a time"}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => setSheet(null)}
              hitSlop={8}
              style={styles.close}
            >
              <Ionicons name="close" size={22} color={colors.foreground} />
            </Pressable>
          </View>

          {sheet === "day" ? (
            <MonthGrid
              month={month}
              day={day}
              today={today}
              openDays={openDays}
              onMonth={setMonth}
              onPick={(d) => {
                onDay(d);
                setSheet(null);
              }}
            />
          ) : (
            <ScrollView contentContainerStyle={styles.times}>
              {slots.map((s) => {
                const chosen = s.startsAtIso === slot?.startsAtIso;
                return (
                  <Pressable
                    key={s.startsAtIso}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: chosen }}
                    onPress={() => {
                      onSlot(s);
                      setSheet(null);
                    }}
                    style={({ pressed }) => [
                      styles.time,
                      chosen && styles.timeChosen,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.timeText, chosen && styles.timeTextChosen]}>
                      {formatTime(s.startsAtIso)} – {formatTime(s.endsAtIso)}
                    </Text>
                    {chosen ? (
                      <Ionicons name="checkmark" size={18} color={colors.primaryForeground} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

/* ─── The month grid ────────────────────────────────────────────── */

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTH_YEAR = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function MonthGrid({
  month,
  day,
  today,
  openDays,
  onMonth,
  onPick,
}: {
  month: string;
  day: string | null;
  today: string;
  openDays: Set<string>;
  onMonth: (month: string) => void;
  onPick: (day: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const first = new Date(`${month}-01T12:00:00Z`);
  const daysInMonth = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  const step = (delta: number) => {
    const d = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + delta, 1));
    onMonth(d.toISOString().slice(0, 7));
  };

  return (
    <View style={styles.grid}>
      <View style={styles.monthRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          onPress={() => step(-1)}
          style={styles.monthStep}
        >
          <Ionicons name="chevron-back" size={18} color={colors.foreground} />
        </Pressable>
        <Text style={styles.monthTitle} accessibilityLiveRegion="polite">
          {MONTH_YEAR.format(first)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          onPress={() => step(1)}
          style={styles.monthStep}
        >
          <Ionicons name="chevron-forward" size={18} color={colors.foreground} />
        </Pressable>
      </View>
      <View style={styles.week}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={styles.weekday}>
            {w}
          </Text>
        ))}
      </View>
      <View style={styles.cells}>
        {cells.map((d, i) => {
          if (d === null) return <View key={`pad-${i}`} style={styles.cell} />;
          const open = openDays.has(d);
          const chosen = d === day;
          return (
            <View key={d} style={styles.cell}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: chosen, disabled: !open }}
                accessibilityLabel={`${dayLabel(d)}${open ? "" : ", nothing open"}`}
                disabled={!open}
                onPress={() => onPick(d)}
                style={({ pressed }) => [
                  styles.dayBtn,
                  chosen && styles.dayChosen,
                  d === today && !chosen && styles.dayToday,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    !open && styles.dayTextOff,
                    chosen && styles.dayTextChosen,
                  ]}
                >
                  {Number(d.slice(8, 10))}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: { flexDirection: "row", gap: space[3] },
    field: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: space[2],
      minHeight: 48,
      paddingHorizontal: space[3],
      borderRadius: radius.xl,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    fieldOff: { opacity: 0.6 },
    fieldText: { flex: 1, fontFamily: font.bodyMedium, fontSize: 15, color: c.foreground },
    fieldPlaceholder: { fontFamily: font.body, color: c.mutedForeground },
    pressed: { opacity: 0.88 },

    sheet: { flex: 1, backgroundColor: c.background, paddingHorizontal: space[5] },
    sheetHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: space[5],
      paddingBottom: space[3],
    },
    sheetTitle: {
      fontFamily: font.display,
      fontSize: 22,
      lineHeight: 28,
      letterSpacing: -0.3,
      color: c.foreground,
    },
    close: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.muted,
    },

    grid: { gap: space[2] },
    monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    monthStep: {
      width: 44,
      height: 44,
      borderRadius: radius.lg,
      alignItems: "center",
      justifyContent: "center",
    },
    monthTitle: { fontFamily: font.bodyMedium, fontSize: 16.5, color: c.foreground },
    week: { flexDirection: "row" },
    weekday: {
      flex: 1,
      textAlign: "center",
      paddingVertical: space[1],
      fontFamily: font.body,
      fontSize: 12.5,
      color: c.mutedForeground,
    },
    cells: { flexDirection: "row", flexWrap: "wrap" },
    cell: { width: `${100 / 7}%`, alignItems: "center", paddingVertical: 2 },
    dayBtn: {
      width: 44,
      height: 44,
      borderRadius: radius.lg,
      alignItems: "center",
      justifyContent: "center",
    },
    dayChosen: { backgroundColor: c.foreground },
    dayToday: { borderWidth: 1, borderColor: c.border },
    dayText: { fontFamily: font.mono, fontSize: 15, color: c.foreground },
    dayTextOff: { color: c.mutedForeground, opacity: 0.5 },
    dayTextChosen: { color: c.background, fontFamily: font.bodyMedium },

    times: { gap: space[2], paddingBottom: space[6] },
    time: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      minHeight: 48,
      paddingHorizontal: space[4],
      borderRadius: radius.xl,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    timeChosen: { backgroundColor: c.primary, borderColor: c.primary },
    timeText: { fontFamily: font.bodyMedium, fontSize: 15, color: c.foreground },
    timeTextChosen: { color: c.primaryForeground },
  });
