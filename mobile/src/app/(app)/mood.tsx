import { useState } from "react";
import { Text, View } from "react-native";

import { Button, MoodFace, Note, Screen, Segments } from "@/components/tide";
import { countMoods, useMood, yearMix } from "@/data/mood";
import { useNow } from "@/lib/use-now";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

type View3 = "week" | "month" | "year";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * How you have felt (F-02 mood): the week, the month as a calendar of faces,
 * and the year as good / okay / not well bars, from the faces the patient
 * picks on Home (kind 'mood' in their own log, ADR 0342). Only they see it.
 */
export default function MoodScreen() {
  const t = useTide();
  const now = useNow();
  const { week, month, rows, loading, error, retry } = useMood(now);
  const [view, setView] = useState<View3>("week");
  const weekCount = countMoods(week);
  const monthCount = countMoods(month);
  const year = yearMix(rows, now);
  const none = !rows.some((r) => r.kind === "mood");

  return (
    <Screen back={{ label: "Me" }} overline="Me · Mood" title="How you have felt">
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

      {loading && none ? (
        <Text style={[tType.bodyM, { color: t.ink2 }]}>Loading…</Text>
      ) : error ? (
        <View style={{ gap: tSpace[2], alignItems: "flex-start" }}>
          <Text style={[tType.bodyM, { color: t.ink2 }]}>Couldn&apos;t load your moods.</Text>
          <Button label="Try again" variant="outline" size="sm" onPress={retry} />
        </View>
      ) : none ? (
        <Text style={[tType.bodyM, { color: t.ink2 }]}>
          Nothing yet. Pick a face on Home each day, and your weeks and months show here.
        </Text>
      ) : null}

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
          {year.map((mix, i) => (
            <View
              key={i}
              accessible
              accessibilityLabel={
                mix
                  ? `${MONTHS[i]}: ${mix[0]}% good, ${mix[1]}% okay, ${mix[2]}% not well`
                  : `${MONTHS[i]}: nothing logged`
              }
              style={{ flexDirection: "row", alignItems: "center", gap: tSpace[2] }}
            >
              <Text style={[tType.caption, { width: 32, color: t.ink2 }]}>{MONTHS[i]}</Text>
              {mix ? (
                <View
                  style={{
                    flex: 1,
                    height: 12,
                    borderRadius: 6,
                    overflow: "hidden",
                    flexDirection: "row",
                  }}
                >
                  <View style={{ flex: mix[0], backgroundColor: t.mood.good }} />
                  <View style={{ flex: mix[1], backgroundColor: t.mood.okay }} />
                  <View style={{ flex: mix[2], backgroundColor: t.mood.low }} />
                </View>
              ) : (
                <Text style={[tType.micro, { flex: 1, color: t.ink3 }]}>Nothing logged</Text>
              )}
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
        Only you can see this
      </Note>
      <Note>Not well a few days in a row? Book a visit, or press Help if it cannot wait.</Note>
    </Screen>
  );
}
