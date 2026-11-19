/**
 * Home's top card in Care mode (patient app v2; the owner's approved prototype, 19 Nov 2026). Behind `careMode`,
 * which stays off until Gate CG: with the flag off Home never reaches this file's rule.
 *
 * The card shows what matters most right now, chosen by the app's own ladder (@patient-core/today-hero) for its
 * first rungs, so Home and Today can never disagree about them:
 *   1. a reading that needs action now; 2. a question from the care team; 3. a medicine or check due now;
 *   4. a visit that is near (today or tomorrow; a draft rule for the CSO); 5. the week's readings, as a trend
 *   card; 6. the visit card as before (the next visit, or "No visit booked").
 * Whatever the card is not showing about the visit sits in one quiet row under it (`VisitRow` in home.tsx).
 *
 * No clinical number or word is written here: targets come from `targetMarks`, the change from `weekChange`,
 * the in-range check from `checkReading`, and the words from @content/patient-app and @patient-core. Out of
 * target is amber with words, never red (MR5): the one red card is the danger hero, in v2-hero.tsx.
 *
 * One exception, signed by the CSO on 19 Nov 2026 (sign-off pack, section 1): a reading the app's own check
 * calls a danger and that is not above target ("Too low") has its status pill in the critical tone, with the
 * same words. "Low" and "Above target" stay amber. The rule is `judge`'s; no threshold is written here.
 */
import type { HomeVisit } from "@/features/v2/home";
import type { ReadingInput, SugarContext } from "@patient-core/readings";
import type { Hero, TodayState } from "@patient-core/today-hero";
import { useState } from "react";
import { CARE_V2_COPY } from "@content/patient-app/care";
import { HOME_V2_COPY } from "@content/patient-app/home";
import { judge, METRICS } from "@patient-core/care-trends";
import { targetMarks, weekChange } from "@patient-core/reading-cards";
import { checkReading } from "@patient-core/readings";
import { heroFor } from "@patient-core/today-hero";
import { Text, View } from "react-native";

import { Button, Card, Icon, Press, StatusPill } from "@/components/tide";
import { TrendLanes } from "@/components/tide/trend-lanes";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

const R = CARE_V2_COPY.readings;
const W = HOME_V2_COPY.phone.top;

export type TrendMetric = "bp" | "sugar" | "weight";

/** One measure's week for the trend card, from the patient's own readings (`tenDays`, its last seven days). */
export interface HomeTrend {
  metric: TrendMetric;
  ctx: SugarContext;
  unit: string;
  /** Oldest first, ending today. A day with no reading has a null value: a gap, never filled in. */
  days: { date: string; dayKey: string; value: number | null; bottom?: number | null }[];
  /** The value about a week before the latest, for "↓ 8 in a week". */
  weekAgo: number | null;
}

/** What Home knows of the patient's care, when Care mode is on. Without it Home is the visit card, as before. */
export type HomeCare =
  | { state: "loading" }
  /** Not in a care programme: the visit card, as before. */
  | { state: "none" }
  | {
      state: "ready";
      /** What the ladder reads, already in the screen's words (the team, never a name). */
      today: TodayState;
      trend: HomeTrend | null;
      /** True once the log is read and holds no reading of any kind: the button invites the first one. */
      noReadings?: boolean;
      onHeroAction: (hero: Hero) => void;
      onLog: (metric: TrendMetric) => void;
      onSeeAll: () => void;
    };

export type HomeTop =
  { kind: "danger" | "team" | "due"; hero: Hero } | { kind: "visit" } | { kind: "trends" };

/**
 * Which card Home's top is. The first three rungs are `heroFor`'s own answer. Below them a near visit keeps
 * the card; so does a visit not read yet or one that could not be read, so a near visit is never hidden
 * behind a chart. Then the week's readings; then the visit card.
 */
export function homeTop(input: {
  today: TodayState | null;
  visit: HomeVisit;
  trend: boolean;
}): HomeTop {
  if (!input.today) return { kind: "visit" };
  const hero = heroFor(input.today);
  if (hero.kind === "danger" || hero.kind === "team" || hero.kind === "due")
    return { kind: hero.kind, hero };
  const v = input.visit;
  const near = v.state === "ready" ? v.today || v.tomorrow === true : v.state !== "none";
  if (hero.kind === "visit" || near) return { kind: "visit" };
  return input.trend ? { kind: "trends" } : { kind: "visit" };
}

export type DayStatus =
  | { kind: "none" }
  | { kind: "in" }
  | { kind: "above" }
  /**
   * Not above, and not in range by the app's own check (a low reading): its own word, never "In target", and
   * its own tone: `critical` when the check calls it a danger ("Too low"), `caution` otherwise ("Low").
   */
  | { kind: "other"; word: string; tone: "caution" | "critical" }
  /** Weight: a trend, never judged. */
  | { kind: "untargeted" };

/**
 * One day against its target. Above is `targetMarks`: for blood pressure either number at or over its own
 * line; for sugar over the band. A reading that is not above is "In target" only when `checkReading` agrees.
 */
export function dayStatus(
  metric: TrendMetric,
  ctx: SugarContext,
  value: number | null,
  bottom: number | null = null,
): DayStatus {
  if (value === null) return { kind: "none" };
  const marks = targetMarks(metric, ctx);
  let input: ReadingInput;
  if (metric === "bp") {
    const [top, low] = marks.lines;
    if ((top && value >= top.value) || (low && bottom !== null && bottom >= low.value))
      return { kind: "above" };
    input = { kind: "bp", top: value, bottom };
  } else if (metric === "sugar" && marks.band) {
    if (value > marks.band.hi) return { kind: "above" };
    input = { kind: "sugar", value, context: ctx };
  } else return { kind: "untargeted" };
  const level = checkReading(input).level;
  if (level === "watch" || level === "danger") {
    const { word, tone } = judge(input);
    return { kind: "other", word, tone: tone === "critical" ? "critical" : "caution" };
  }
  return { kind: "in" };
}

const statusWord = (s: DayStatus): string | null =>
  s.kind === "none"
    ? R.noReading
    : s.kind === "in"
      ? R.inTarget
      : s.kind === "above"
        ? R.outOfTarget
        : s.kind === "other"
          ? s.word
          : null;

/** "S", "M", …: the day's first letter, from its Kampala day key. */
const DAY_LETTERS = "SMTWTFS";
const letterOf = (dayKey: string) => DAY_LETTERS[new Date(`${dayKey}T12:00:00Z`).getUTCDay()] ?? "";

/**
 * The week's readings as Home's top card: the measure, the picked day's reading and whether it is in target
 * in words, the change over a week, and the chart. It opens on the latest reading; tapping a day reads that
 * day. One lagoon button ("Log a reading", or "Start logging readings" while the patient has no reading at
 * all; both open the same logging flow) and a quiet "See all".
 */
export function HomeTrendCard({
  trend,
  first = false,
  onLog,
  onSeeAll,
}: {
  trend: HomeTrend;
  /** The patient has no reading of any kind yet. */
  first?: boolean;
  onLog: () => void;
  onSeeAll: () => void;
}) {
  const t = useTide();
  const { metric, ctx, unit, days } = trend;
  const [picked, setPicked] = useState<number | null>(null);
  let latest = -1;
  days.forEach((d, i) => d.value !== null && (latest = i));
  const lastIndex = days.length - 1;
  const sel = Math.min(picked ?? (latest >= 0 ? latest : lastIndex), lastIndex);
  const day = days[sel];
  if (!day) return null;

  const bp = metric === "bp";
  const marks = targetMarks(metric, ctx);
  const statuses = days.map((d) => dayStatus(metric, ctx, d.value, d.bottom ?? null));
  const status = statuses[sel] ?? { kind: "none" };
  const word = statusWord(status);
  // The last day is today; the others go by their date ("16 Nov").
  const dayWord = (i: number) => (i === lastIndex ? R.today : (days[i]?.date ?? ""));
  const spoken = (i: number) => {
    const d = days[i]!;
    if (d.value === null) return `${dayWord(i)}: ${R.noReading}`;
    const numbers = bp
      ? `${METRICS.bp.l1} ${d.value}${d.bottom == null ? "" : `, ${METRICS.bp.l2} ${d.bottom}`} ${unit}`
      : `${d.value} ${unit}`;
    return `${dayWord(i)}: ${[numbers, statusWord(statuses[i]!)].filter(Boolean).join(", ")}`;
  };
  const valueText =
    day.value === null ? "—" : bp ? `${day.value}/${day.bottom ?? "—"}` : String(day.value);
  // The change over a week belongs to the latest reading, so it shows only while that day is picked.
  const change =
    sel === latest ? weekChange(metric, ctx, trend.weekAgo, days[latest]?.value ?? null) : null;
  const changeTone =
    change?.tone === "good" ? t.stable : change?.tone === "caution" ? t.caution : null;

  const lanes = bp
    ? [
        { label: METRICS.bp.l1, values: days.map((d) => d.value), line: marks.lines[0]?.value },
        {
          label: METRICS.bp.l2,
          values: days.map((d) => d.bottom ?? null),
          line: marks.lines[1]?.value,
        },
      ]
    : [{ values: days.map((d) => d.value), band: marks.band, line: marks.lines[0]?.value }];

  return (
    <Card
      radius={tRadius.xl}
      padding={tSpace[5]}
      style={{ paddingTop: tSpace[4], paddingBottom: tSpace[3.5], gap: tSpace[2.5] }}
    >
      <View
        style={{
          minHeight: 28,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: tSpace[3],
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[2], flexShrink: 1 }}>
          {/* The readings place: a dot beside the words, never a fill behind them. */}
          <View
            style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.area.readings }}
          />
          <Text style={[tType.overline, { color: t.ink2 }]}>{W.trends}</Text>
        </View>
        {word ? (
          <StatusPill
            tone={
              status.kind === "in"
                ? "stable"
                : status.kind === "none"
                  ? "pending"
                  : status.kind === "other"
                    ? status.tone
                    : "caution"
            }
            label={word}
            style={{ minHeight: 28, paddingHorizontal: tSpace[3] }}
          />
        ) : null}
      </View>

      <View style={{ gap: tSpace[1] }}>
        <View
          accessibilityLiveRegion="polite"
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: tSpace[3],
          }}
        >
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            style={[tType.section, { flexShrink: 1, color: t.ink }]}
          >
            {R.titles[metric]}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: tSpace[1] }}>
            <Text
              style={{ fontFamily: tFont.semibold, fontSize: 24, lineHeight: 28, color: t.ink }}
            >
              {valueText}
            </Text>
            <Text style={[tType.caption, { color: t.ink3 }]}>{unit}</Text>
          </View>
        </View>
        <View
          style={{
            minHeight: 24,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: tSpace[2],
          }}
        >
          <Text numberOfLines={1} style={[tType.bodyM, { flexShrink: 1, color: t.ink2 }]}>
            {dayWord(sel)} · {W.tapDay}
          </Text>
          {change ? (
            <View
              accessible
              accessibilityLabel={change.text}
              style={{
                height: 24,
                paddingLeft: tSpace[1.5],
                paddingRight: tSpace[2.5],
                borderRadius: tRadius.pill,
                flexDirection: "row",
                alignItems: "center",
                gap: tSpace[1],
                backgroundColor: changeTone?.tint ?? t.surface2,
              }}
            >
              <Icon
                name={change.delta < 0 ? "arrowDown" : change.delta > 0 ? "arrowUp" : "arrowRight"}
                size={16}
                color={changeTone?.text ?? t.ink2}
                strokeWidth={2.2}
              />
              {/* The words are `weekChange`'s; its arrow is the icon. */}
              <Text
                style={[
                  tType.bodyS,
                  { fontFamily: tFont.semibold, color: changeTone?.text ?? t.ink2 },
                ]}
              >
                {change.text.replace(/^\S+\s/, "")}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <TrendLanes
        lanes={lanes}
        days={days.map((d, i) => ({
          key: d.dayKey,
          letter: letterOf(d.dayKey),
          spoken: spoken(i),
          outside: statuses[i]?.kind === "above" || statuses[i]?.kind === "other",
        }))}
        selected={sel}
        onSelect={setPicked}
        targetWord={R.target}
      />

      <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[1] }}>
        <Button
          label={first ? W.logFirst : W.log}
          variant="accent"
          size="md"
          onPress={onLog}
          style={{ flex: 1, minHeight: 48 }}
        />
        <Press
          onPress={onSeeAll}
          accessibilityRole="link"
          accessibilityLabel={`${W.seeAll}, ${W.trends}`}
          style={{ minHeight: 48, paddingHorizontal: tSpace[3.5], justifyContent: "center" }}
        >
          <Text style={[tType.label, { fontSize: 15, color: t.accentText }]}>{W.seeAll}</Text>
        </Press>
      </View>
    </Card>
  );
}
