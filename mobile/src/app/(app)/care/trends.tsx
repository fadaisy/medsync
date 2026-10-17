import type { DiaryClass, Metric } from "@/data/trends";
import type { SugarContext } from "@/lib/readings";
import type { Tide } from "@/theme/tide";
import { useState } from "react";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";

import {
  Band,
  Card,
  Chip,
  ChipRow,
  Icon,
  Press,
  Screen,
  Segments,
  StatusPill,
} from "@/components/tide";
import {
  DIARY,
  DIARY_SLOTS,
  DIARY_WORDS,
  diaryClass,
  judge,
  METRICS,
  READING_TIMES,
  seriesInput,
  SUGAR_SERIES,
  targetBand,
} from "@/data/trends";
import { lastSevenDays } from "@/features/care/logic";
import { WeekChart } from "@/features/care/week-chart";
import { THRESHOLDS_NOTE } from "@/lib/readings";
import { useNow } from "@/lib/use-now";
import { useTide } from "@/theme/theme";
import { tRadius, tSpace, tType } from "@/theme/tide";

const TABS = (["bp", "sugar", "weight", "pulse"] as const).map((key) => ({
  key,
  label: METRICS[key].name,
}));

/** Health trends (board TTrends, PRD F-16). Demo data until Gate CG (law L2). */
export default function TrendsScreen() {
  const t = useTide();
  const router = useRouter();
  const now = useNow();
  const [metric, setMetric] = useState<Metric>("bp");
  const [ctx, setCtx] = useState<SugarContext>("fasting");

  const base = METRICS[metric];
  const sugar = SUGAR_SERIES.find((s) => s.ctx === ctx) ?? SUGAR_SERIES[0];
  const m =
    metric === "sugar"
      ? {
          ...base,
          a: sugar.a,
          l1: sugar.name,
          label: `Blood sugar · ${sugar.name.toLowerCase()}`,
          insight: sugar.insight,
        }
      : base;
  const band = targetBand(metric, ctx);
  const judged = m.a.map((_, i) => judge(seriesInput(m, i, ctx)));
  const week = lastSevenDays(now);
  const lastI = m.a.length - 1;
  const latest = m.b ? `${m.a[lastI]}/${m.b[lastI]}` : String(m.a[lastI]);
  const status =
    judged[lastI].tone === "stable" ? { ...judged[lastI], word: "In your range" } : judged[lastI];

  return (
    <Screen
      back={{ label: "Care" }}
      demo
      title="Health trends"
      headerRight={
        <Press
          onPress={() => router.push("/care/reading")}
          accessibilityLabel="Log a reading"
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: t.accent,
            alignItems: "center",
            justifyContent: "center",
            boxShadow: t.shadow.accent,
          }}
        >
          <Icon name="plus" size={20} color={t.onAccent} strokeWidth={2.3} />
        </Press>
      }
    >
      <Segments options={TABS} value={metric} onChange={setMetric} />

      {metric === "sugar" ? (
        <View style={{ gap: tSpace[2] }}>
          <Text style={[tType.bodyS, { color: t.ink2 }]}>When was it measured?</Text>
          <ChipRow scroll>
            {SUGAR_SERIES.map((s) => (
              <Chip
                key={s.ctx}
                label={s.name}
                size="sm"
                selected={s.ctx === ctx}
                onPress={() => setCtx(s.ctx)}
              />
            ))}
          </ChipRow>
          {band ? (
            <Text style={[tType.bodyS, { color: t.ink2 }]}>
              Your target {sugar.name.toLowerCase()}: up to {band.hi} {m.unit}
            </Text>
          ) : null}
        </View>
      ) : null}

      <Card radius={tRadius.panel} style={{ paddingTop: tSpace[4] }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
            paddingHorizontal: 4,
          }}
        >
          <View style={{ gap: 2, flex: 1 }}>
            <Text style={[tType.bodyS, { color: t.ink2 }]}>{m.label} · this week</Text>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 5 }}>
              <Text style={[tType.numeral, { color: t.ink }]}>{latest}</Text>
              <Text style={[tType.bodyM, { fontSize: 14, color: t.ink2 }]}>{m.unit}</Text>
            </View>
          </View>
          <StatusPill tone={status.tone} label={status.word} />
        </View>
        <WeekChart
          a={m.a}
          b={m.b}
          lo={m.lo}
          hi={m.hi}
          grid={m.grid}
          band={band}
          days={week.map((d, i) => (i === 6 ? "Today" : d.name.slice(0, 3)))}
          judged={judged}
          label={`${m.label} over the last seven days`}
        />
        <View
          style={{ flexDirection: "row", flexWrap: "wrap", gap: tSpace[3.5], paddingHorizontal: 4 }}
        >
          <Legend color={t.ink} label={m.l1} line />
          {m.l2 ? <Legend color={t.cascade[2]} label={m.l2} line /> : null}
          {band ? <Legend color={t.caution.text} label="Above target" /> : null}
        </View>
      </Card>

      {metric === "sugar" ? <SugarDiary days={week.map((d) => d.name.slice(0, 3))} /> : null}

      <Band
        style={{
          flexDirection: "row",
          gap: tSpace[3],
          alignItems: "flex-start",
          borderRadius: tRadius.cardLg,
        }}
      >
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: t.bandGlass,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="trend" size={17} color={t.onBand} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[tType.label, { fontSize: 15, color: t.onBand }]}>{m.insight}</Text>
          <Text style={[tType.bodyS, { color: t.onBand2 }]}>
            Your care team sees the same chart.
          </Text>
        </View>
      </Band>

      <Text
        accessibilityRole="header"
        style={[tType.heading, { fontSize: 18, lineHeight: 24, color: t.ink }]}
      >
        Readings
      </Text>
      <Card padding={0} style={{ gap: 0, overflow: "hidden" }}>
        {[6, 5, 4, 3].map((i, n) => (
          <View
            key={i}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: tSpace[3],
              paddingVertical: tSpace[3],
              paddingHorizontal: tSpace[4],
              borderTopWidth: n ? 1 : 0,
              borderTopColor: t.surface3,
            }}
          >
            <View style={{ width: 52 }}>
              <Text style={[tType.labelS, { fontSize: 13, color: t.ink2 }]}>
                {week[i].name.slice(0, 3)} {week[i].date}
              </Text>
              <Text style={[tType.bodyS, { color: t.ink2 }]}>{READING_TIMES[i]}</Text>
            </View>
            <Text style={[tType.heading, { flex: 1, color: t.ink, fontVariant: ["tabular-nums"] }]}>
              {m.b ? `${m.a[i]}/${m.b[i]}` : m.a[i]}{" "}
              <Text style={[tType.bodyS, { fontSize: 12, color: t.ink2 }]}>{m.unit}</Text>
            </Text>
            <StatusPill tone={judged[i].tone} label={judged[i].word} />
          </View>
        ))}
      </Card>
      <View style={{ gap: tSpace[1] }}>
        <Text style={[tType.bodyS, { fontSize: 12, color: t.ink3, textAlign: "center" }]}>
          Illustrative values. Targets set per patient by the clinician.
        </Text>
        <Text style={[tType.bodyS, { fontSize: 12, color: t.ink3, textAlign: "center" }]}>
          {THRESHOLDS_NOTE}
        </Text>
      </View>
    </Screen>
  );
}

/** A legend key: a short line for a series, a dot for the "above target" points. Always with its word. */
function Legend({ color, label, line = false }: { color: string; label: string; line?: boolean }) {
  const t = useTide();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[1.5] }}>
      <View
        style={
          line
            ? { width: 14, height: 3, borderRadius: 2, backgroundColor: color }
            : { width: 8, height: 8, borderRadius: 4, backgroundColor: color }
        }
      />
      <Text style={[tType.bodyS, { fontSize: 12, color: t.ink2 }]}>{label}</Text>
    </View>
  );
}

const cellColours = (t: Tide, c: DiaryClass) =>
  ({
    in: { bg: t.stable.tint, fg: t.stable.text },
    high: { bg: t.caution.tint, fg: t.caution.text },
    low: { bg: t.critical.tint, fg: t.critical.text },
    veryHigh: { bg: t.critical.tint, fg: t.critical.text },
    none: { bg: t.bg, fg: t.ink },
  })[c];

/** "Your sugar diary": seven days × six times of day, each cell judged against its own target. */
function SugarDiary({ days }: { days: string[] }) {
  const t = useTide();
  const cells = DIARY.map((row) =>
    row.map((v, j) => ({ v, c: diaryClass(v, DIARY_SLOTS[j].ctx) })),
  );
  const shown = new Set(cells.flat().map((x) => x.c));
  const legend = (["in", "high", "low", "veryHigh", "none"] as const).filter(
    (c) => c !== "veryHigh" || shown.has(c),
  );
  return (
    <Card radius={tRadius.cardLg} padding={tSpace[3]}>
      <View style={{ paddingHorizontal: 4 }}>
        <Text accessibilityRole="header" style={[tType.heading, { fontSize: 16, color: t.ink }]}>
          Your sugar diary
        </Text>
        <Text style={[tType.bodyS, { fontSize: 12, color: t.ink2 }]}>
          Every reading this week, by time of day
        </Text>
      </View>
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", gap: 4, alignItems: "flex-end" }}>
          <View style={{ width: 38 }} />
          {DIARY_SLOTS.map((s) => (
            <Text
              key={s.head}
              style={[
                tType.micro,
                { flex: 1, fontSize: 10, lineHeight: 12, color: t.ink2, textAlign: "center" },
              ]}
            >
              {s.head}
            </Text>
          ))}
        </View>
        {cells.map((row, i) => (
          <View key={i} style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
            <Text style={[tType.caption, { width: 38, color: i === 6 ? t.ink : t.ink2 }]}>
              {days[i]}
            </Text>
            {row.map(({ v, c }, j) => {
              const col = cellColours(t, c);
              return (
                <View
                  key={j}
                  accessible
                  accessibilityLabel={`${days[i]} ${DIARY_SLOTS[j].words}: ${v === null ? "" : `${v}, `}${DIARY_WORDS[c]}`}
                  style={{
                    flex: 1,
                    height: 30,
                    borderRadius: 8,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: col.bg,
                    borderWidth: c === "none" ? 1 : 0,
                    borderColor: t.line,
                  }}
                >
                  <Text style={[tType.caption, { color: col.fg, fontVariant: ["tabular-nums"] }]}>
                    {v ?? ""}
                  </Text>
                </View>
              );
            })}
          </View>
        ))}
      </View>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          columnGap: tSpace[3],
          rowGap: tSpace[1.5],
          paddingHorizontal: 4,
        }}
      >
        {legend.map((c) => {
          const col = cellColours(t, c);
          return (
            <View key={c} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  backgroundColor: col.bg,
                  borderWidth: c === "none" ? 1 : 0,
                  borderColor: t.line,
                }}
              />
              <Text style={[tType.micro, { color: t.ink2 }]}>{DIARY_WORDS[c]}</Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}
