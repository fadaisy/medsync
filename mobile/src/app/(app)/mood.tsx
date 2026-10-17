import { useState } from "react";
import { Text, View } from "react-native";

import { MoodFace, Note, Screen, Segments } from "@/components/tide";
import { countMoods, useMood, YEAR_MIX } from "@/data/mood";
import { useNow } from "@/lib/use-now";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

type View3 = "week" | "month" | "year";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * How you have felt (F-02 mood): the week, the month as a calendar of faces,
 * and the year as good / okay / not well bars. Demo data (law L2).
 */
export default function MoodScreen() {
  const t = useTide();
  const now = useNow();
  const { month } = useMood();
  const [view, setView] = useState<View3>("week");
  const week = month.slice(-7);
  const weekCount = countMoods(week);
  const monthCount = countMoods(month);

  return (
    <Screen back={{ label: "Me" }} demo overline="Me · Mood" title="How you have felt">
      <Segments
        tone="accent"
        options={[
          { key: "week", label: "Week" },
          { key: "month", label: "Month" },
          { key: "year", label: "Year" },
        ]}
        value={view}
        onChange={setView}
      />

      {view === "week" ? (
        <View
          style={{
            borderRadius: tRadius.cardLg,
            padding: tSpace[4],
            backgroundColor: t.surface,
            gap: tSpace[3],
            boxShadow: t.shadow.card,
          }}
        >
          <Text style={[tType.overline, { color: t.ink3 }]}>This week</Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            {week.map((m, i) => (
              <View key={i} style={{ alignItems: "center", gap: tSpace[1] }}>
                <MoodFace mood={m} size={38} />
                <Text style={[tType.micro, { color: t.ink3 }]}>
                  {i === week.length - 1
                    ? "Today"
                    : WEEKDAYS[(now.getDay() + 7 - (week.length - 1 - i)) % 7]}
                </Text>
              </View>
            ))}
          </View>
          <Text style={[tType.labelS, { color: t.ink2 }]}>
            {weekCount.good} good · {weekCount.okay} okay · {weekCount.low} not well
          </Text>
        </View>
      ) : null}

      {view === "month" ? (
        <View
          style={{
            borderRadius: tRadius.cardLg,
            padding: tSpace[4],
            backgroundColor: t.surface,
            gap: tSpace[3],
            boxShadow: t.shadow.card,
          }}
        >
          <Text style={[tType.overline, { color: t.ink3 }]}>This month</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: tSpace[2] }}>
            {month.map((m, i) => (
              <View key={i} style={{ width: `${100 / 7}%`, alignItems: "center", gap: 2 }}>
                <MoodFace mood={m} size={32} />
                <Text style={{ fontFamily: tFont.monoSemibold, fontSize: 11, color: t.ink3 }}>
                  {i + 1}
                </Text>
              </View>
            ))}
          </View>
          <Text style={[tType.labelS, { color: t.ink2 }]}>
            {monthCount.good} good · {monthCount.okay} okay · {monthCount.low} not well, so far this
            month
          </Text>
        </View>
      ) : null}

      {view === "year" ? (
        <View
          style={{
            borderRadius: tRadius.cardLg,
            padding: tSpace[4],
            backgroundColor: t.surface,
            gap: tSpace[2.5],
            boxShadow: t.shadow.card,
          }}
        >
          <Text style={[tType.overline, { color: t.ink3 }]}>Month by month</Text>
          {YEAR_MIX.map(([good, okay, low], i) => (
            <View
              key={i}
              accessible
              accessibilityLabel={`${MONTHS[i]}: ${good}% good, ${okay}% okay, ${low}% not well`}
              style={{ flexDirection: "row", alignItems: "center", gap: tSpace[2] }}
            >
              <Text style={[tType.caption, { width: 32, color: t.ink2 }]}>{MONTHS[i]}</Text>
              <View
                style={{
                  flex: 1,
                  height: 12,
                  borderRadius: 6,
                  overflow: "hidden",
                  flexDirection: "row",
                }}
              >
                <View style={{ flex: good, backgroundColor: t.mood.good }} />
                <View style={{ flex: okay, backgroundColor: t.mood.okay }} />
                <View style={{ flex: low, backgroundColor: t.mood.low }} />
              </View>
            </View>
          ))}
          <View style={{ flexDirection: "row", gap: tSpace[3], marginTop: tSpace[1] }}>
            {(["good", "okay", "low"] as const).map((m) => (
              <View key={m} style={{ flexDirection: "row", alignItems: "center", gap: tSpace[1] }}>
                <MoodFace mood={m} size={16} />
                <Text style={[tType.caption, { color: t.ink2 }]}>
                  {m === "low" ? "Not well" : m === "good" ? "Good" : "Okay"}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <Note icon="lock" tone="plain">
        Only you and your care team see this
      </Note>
      <Note>
        If you feel not well a few days in a row, we will ask if you want to talk to someone.
      </Note>
    </Screen>
  );
}
