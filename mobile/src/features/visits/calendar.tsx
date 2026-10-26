import { useState } from "react";
import { Text, View } from "react-native";

import { Card, Icon, Press } from "@/components/tide";
import { canShift, dayState, firstOpenDay, weeksOf } from "@/features/visits/calendar-logic";
import { monthGrid, monthTitleOf, shiftMonth, shortDayOf } from "@/features/visits/logic";
import { Dot } from "@/features/visits/parts";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * The month calendar for asking for a day: Monday first, moving only within
 * today … today+60. A day with an open time carries a dot and bold weight and
 * says "open" to a screen reader; one without says "no open times" and cannot
 * be chosen. Never a count of what is left (ADR 0084).
 */
export function BookingCalendar({
  today,
  open,
  selected,
  onSelect,
}: {
  today: string;
  open: ReadonlySet<string>;
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  const t = useTide();
  const [month, setMonth] = useState<string | null>(null);
  const shown = month ?? shiftMonth(selected ?? firstOpenDay(today, open) ?? today, 0);
  return (
    <Card radius={tRadius.panel} padding={tSpace[3]} style={{ gap: tSpace[2] }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 4,
        }}
      >
        <Text accessibilityRole="header" style={[tType.section, { color: t.ink }]}>
          {monthTitleOf(shown)}
        </Text>
        <View style={{ flexDirection: "row", gap: tSpace[1.5] }}>
          {([-1, 1] as const).map((d) => {
            const ok = canShift(shown, d, today);
            return (
              <Press
                key={d}
                onPress={() => setMonth(shiftMonth(shown, d))}
                disabled={!ok}
                accessibilityLabel={d < 0 ? "Previous month" : "Next month"}
                hitSlop={4}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: t.bg,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: ok ? 1 : 0.4,
                }}
              >
                <Icon name={d < 0 ? "back" : "forward"} size={18} color={t.ink} />
              </Press>
            );
          })}
        </View>
      </View>
      <View style={{ flexDirection: "row" }} importantForAccessibility="no-hide-descendants">
        {WEEKDAYS.map((w, i) => (
          <Text
            key={i}
            style={[
              tType.micro,
              { flex: 1, textAlign: "center", fontFamily: tFont.semibold, color: t.ink3 },
            ]}
          >
            {w}
          </Text>
        ))}
      </View>
      {/* One row per week, seven equal cells. A wrapped grid of 1/7 widths rounded to six a row
          on iPhone, which put the 4th of October 2026 (a Sunday) under Monday. */}
      {weeksOf(monthGrid(shown)).map((week, w) => (
        <View key={`w${w}`} style={{ flexDirection: "row" }}>
          {week.map((key, i) => {
            if (!key) return <View key={`b${w}-${i}`} style={{ flex: 1, height: 48 }} />;
            const state = dayState(key, today, open);
            const on = key === selected && state === "open";
            const isToday = key === today;
            const label = [
              shortDayOf(key),
              isToday ? "today" : null,
              state === "open" ? "open" : state === "closed" ? "no open times" : "cannot be booked",
            ]
              .filter(Boolean)
              .join(", ");
            return (
              <Press
                key={key}
                onPress={() => onSelect(key)}
                disabled={state !== "open"}
                accessibilityLabel={label}
                accessibilityState={{ selected: on, disabled: state !== "open" }}
                haptic={false}
                style={{
                  flex: 1,
                  height: 48,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  opacity: state === "out" ? 0.45 : 1,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 32,
                    borderRadius: tRadius.pill,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: on ? t.primary : "transparent",
                    borderWidth: isToday && !on ? 1.5 : 0,
                    borderColor: t.ink2,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: state === "open" ? tFont.bold : tFont.medium,
                      fontSize: 15,
                      color: on ? t.onPrimary : state === "open" ? t.ink : t.ink4,
                    }}
                  >
                    {Number(key.slice(8))}
                  </Text>
                </View>
                <Dot color={state === "open" && !on ? t.accentText : "transparent"} size={5} />
              </Press>
            );
          })}
        </View>
      ))}
      <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[1.5], padding: 4 }}>
        <Dot color={t.accentText} size={6} />
        <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.ink2 }]}>
          Open days are bold with a dot
        </Text>
      </View>
    </Card>
  );
}
