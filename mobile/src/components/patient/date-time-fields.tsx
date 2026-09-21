import type { SlotOffer } from "@/lib/booking";
import type { Palette } from "@/theme/tokens";
import { useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { DEFAULT_TIME_ZONE } from "@shared/slots";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { dateKey, dayLabel, formatTime } from "@/lib/booking";
import { useStyles, useTheme } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/**
 * The reference's "Schedule send" on the phone: two fields side by side — the
 * day with a calendar icon, the time with a clock icon — each opening the
 * platform's own picker. Android shows its dialogs; iOS gets its inline
 * calendar and time wheel in a sheet, since iOS has no dialog to call.
 *
 * A native picker knows nothing about the clinic: it cannot grey out a closed
 * day or offer only the open times. So the day is bounded to the open range
 * and a closed day reads "No times"; a picked time snaps to the nearest open
 * one, and the wheel steps at the clinic's interval when the times share
 * one. Same component, same name, on the web.
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
  const slots = day ? (slotsByDate[day] ?? []) : [];
  const [sheet, setSheet] = useState<"day" | "time" | null>(null);
  // The wheel's own value while the sheet is up; committed on Done.
  const [draft, setDraft] = useState<Date | null>(null);

  // The bounds are the open range, end to end; a picker starts from the
  // chosen time, else the day's first, else the first open one.
  const firstOpen = days[0] ? new Date(slotsByDate[days[0]]![0]!.startsAtIso) : undefined;
  const lastDay = days[days.length - 1];
  const lastOpen = lastDay ? new Date(slotsByDate[lastDay]!.at(-1)!.endsAtIso) : undefined;
  const startAt = () =>
    slot
      ? new Date(slot.startsAtIso)
      : slots[0]
        ? new Date(slots[0].startsAtIso)
        : (firstOpen ?? new Date());
  const interval = wheelStep(slots);

  const pickDay = (d: Date) => onDay(dateKey(d));
  const pickTime = (d: Date) => {
    const s = nearest(slots, d);
    if (s) onSlot(s);
  };

  const open = (which: "day" | "time") => {
    const anchor = startAt();
    if (Platform.OS === "android") {
      if (which === "day") {
        DateTimePickerAndroid.open({
          value: anchor,
          mode: "date",
          minimumDate: firstOpen,
          maximumDate: lastOpen,
          timeZoneName: DEFAULT_TIME_ZONE,
          onValueChange: (_, d) => pickDay(d),
        });
      } else {
        DateTimePickerAndroid.open({
          value: anchor,
          mode: "time",
          is24Hour: false,
          minuteInterval: interval,
          timeZoneName: DEFAULT_TIME_ZONE,
          onValueChange: (_, d) => pickTime(d),
        });
      }
      return;
    }
    setDraft(anchor);
    setSheet(which);
  };
  const close = () => {
    setSheet(null);
    setDraft(null);
  };

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Day: ${day ? dayLabel(day) : "not chosen"}. Opens the calendar`}
        onPress={() => open("day")}
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
        accessibilityLabel={`Time: ${slot ? formatTime(slot.startsAtIso) : "not chosen"}. Opens the time picker`}
        disabled={slots.length === 0}
        onPress={() => open("time")}
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

      {Platform.OS === "ios" ? (
        <Modal
          visible={sheet !== null}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={close}
        >
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text accessibilityRole="header" style={styles.sheetTitle}>
                {sheet === "day" ? "Choose a day" : "Choose a time"}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  if (sheet === "time" && draft) pickTime(draft);
                  close();
                }}
                hitSlop={8}
                style={styles.done}
              >
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            </View>
            {sheet === "day" ? (
              <DateTimePicker
                value={draft ?? EPOCH}
                mode="date"
                display="inline"
                minimumDate={firstOpen}
                maximumDate={lastOpen}
                timeZoneName={DEFAULT_TIME_ZONE}
                accentColor={colors.primary}
                onValueChange={(_, d) => {
                  pickDay(d);
                  close();
                }}
              />
            ) : sheet === "time" ? (
              <DateTimePicker
                value={draft ?? EPOCH}
                mode="time"
                display="spinner"
                minuteInterval={interval}
                timeZoneName={DEFAULT_TIME_ZONE}
                onValueChange={(_, d) => setDraft(d)}
              />
            ) : null}
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

/** Unreachable: the draft is set before the sheet opens. Keeps `value` a Date. */
const EPOCH = new Date(0);

/** The open time whose start is closest to the instant picked. */
function nearest(slots: readonly SlotOffer[], at: Date): SlotOffer | null {
  const t = at.getTime();
  let best: SlotOffer | null = null;
  let gap = Infinity;
  for (const s of slots) {
    const g = Math.abs(Date.parse(s.startsAtIso) - t);
    if (g < gap) {
      gap = g;
      best = s;
    }
  }
  return best;
}

/** The steps the iOS wheel accepts (the picker's own `MinuteInterval`, unexported). */
type WheelStep = 1 | 2 | 3 | 4 | 5 | 6 | 10 | 12 | 15 | 20 | 30;
const WHEEL_STEPS: readonly WheelStep[] = [1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30];

/**
 * The wheel's minute step when every open time sits on one the wheel can
 * do, so the wheel lands on real times; undefined lets it run by the minute.
 * ponytail: alignment is checked in UTC minutes, right for whole-hour zones
 * (the hospital's is); a half-hour zone would need the local minute.
 */
function wheelStep(slots: readonly SlotOffer[]): WheelStep | undefined {
  if (slots.length < 2) return undefined;
  const gap = (Date.parse(slots[1]!.startsAtIso) - Date.parse(slots[0]!.startsAtIso)) / 60_000;
  const step = WHEEL_STEPS.find((m) => m === gap);
  if (!step) return undefined;
  return slots.every((s) => (Date.parse(s.startsAtIso) / 60_000) % step === 0) ? step : undefined;
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
    done: {
      minHeight: 44,
      paddingHorizontal: space[4],
      borderRadius: radius.lg,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.primary,
    },
    doneText: { fontFamily: font.bodyMedium, fontSize: 15, color: c.primaryForeground },
  });
