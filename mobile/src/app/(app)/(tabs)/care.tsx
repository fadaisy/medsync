import type { IconName } from "@/components/tide";
import type { TrendTile } from "@/data/trends";
import type { Href } from "expo-router";
import type { ReactNode } from "react";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import Svg, { Circle, Line, Rect } from "react-native-svg";

import {
  Avatar,
  Button,
  Card,
  Icon,
  IconDisc,
  Press,
  Ring,
  Screen,
  SectionHead,
  Sparkbars,
  StatusPill,
} from "@/components/tide";
import { useActivityToday } from "@/data/activity";
import { useChatPreview } from "@/data/chat";
import { useLabsSummary } from "@/data/labs";
import { LOW_SUPPLY_DAYS, SLOT_WORDS, useMedicines } from "@/data/medicines";
import { TREND_TILES } from "@/data/trends";
import { lastSevenDays, longDate } from "@/features/care/logic";
import { useNow } from "@/lib/use-now";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

const n = (v: number) => v.toLocaleString("en-US");

/**
 * The Care hub (board TCare, PRD F-13). Demo data until Gate CG (law L2):
 * medicines, trends, labs, activity and the team's last message all read
 * fixture repositories.
 */
export default function CareTab() {
  const t = useTide();
  const router = useRouter();
  const now = useNow();
  const med = useMedicines(now);
  const labs = useLabsSummary();
  const act = useActivityToday();
  const chat = useChatPreview();
  const go = (href: Href) => () => router.push(href);

  const days = lastSevenDays(now);
  const weekTaken = med.week.reduce((a, b) => a + b, 0);
  const weekTotal = med.week.length * med.total;
  const next =
    med.doses.find((d) => d.status === "due") ?? med.doses.find((d) => d.status === "later");
  const low = med.medicines.filter((m) => m.daysLeft <= LOW_SUPPLY_DAYS);
  const soonest = Math.min(...low.map((m) => m.daysLeft));
  const refill = low.length
    ? ` · ${low.length} refill${low.length > 1 ? "s" : ""} due in ${soonest} days`
    : "";
  const hba1cPrev = labs.hba1c.history[labs.hba1c.history.length - 2];

  return (
    <Screen
      underNav
      demo
      bell
      header={
        <View>
          <Text style={[tType.bodyM, { fontSize: 14, lineHeight: 18, color: t.ink2 }]}>
            {longDate(now)}
          </Text>
          <Text accessibilityRole="header" style={[tType.display, { color: t.ink }]}>
            Your care
          </Text>
        </View>
      }
    >
      <Press
        onPress={go("/care/medicines")}
        accessibilityLabel={`Medicines this week: ${weekTaken} of ${weekTotal} doses taken. Open medicines.`}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: tSpace[4],
          padding: tSpace[4],
          borderRadius: 26,
          backgroundColor: t.band,
        }}
      >
        <Ring
          value={weekTotal ? weekTaken / weekTotal : 0}
          size={84}
          stroke={10}
          color={t.accent}
          track={t.bandGlass}
        >
          <Text style={{ fontFamily: tFont.bold, fontSize: 20, color: t.onBand }}>
            {Math.round((weekTaken / Math.max(1, weekTotal)) * 100)}%
          </Text>
        </Ring>
        <View style={{ flex: 1, gap: tSpace[1.5] }}>
          <Text style={[tType.overline, { color: t.onBandAccent }]}>Medicines this week</Text>
          <Text style={[tType.heading, { fontSize: 18, lineHeight: 23, color: t.onBand }]}>
            {weekTaken} of {weekTotal} doses taken
          </Text>
          <View style={{ flexDirection: "row", gap: tSpace[1] }}>
            {med.week.map((count, i) => (
              <View key={i} style={{ alignItems: "center", gap: 3 }}>
                <View
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 6,
                    backgroundColor: count === 0 ? t.bandGlass : t.accent,
                    opacity: count === 0 || count >= med.total ? 1 : 0.45,
                    borderWidth: i === 6 ? 2 : 0,
                    borderColor: t.onBand,
                  }}
                />
                <Text style={{ fontFamily: tFont.semibold, fontSize: 10, color: t.onBand2 }}>
                  {days[i].letter}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </Press>

      <Card
        onPress={go("/care/medicines")}
        radius={tRadius.card}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: tSpace[3],
          paddingVertical: tSpace[3],
        }}
      >
        <IconDisc name="pill" color={t.area.medicines} bg={t.surface2} size={38} />
        <View style={{ flex: 1 }}>
          <Text style={[tType.label, { fontSize: 15, color: t.ink }]}>
            {next
              ? `${SLOT_WORDS[next.slot]} medicine is ${next.status === "due" ? "due" : "next"}`
              : "All medicines taken today"}
          </Text>
          <Text style={[tType.bodyS, { fontFamily: tFont.regular, color: t.ink2 }]}>
            {next ? next.time : "Well done"}
            {refill}
          </Text>
        </View>
        <View
          style={{
            height: 34,
            paddingHorizontal: tSpace[3.5],
            borderRadius: tRadius.pill,
            backgroundColor: t.accent,
            justifyContent: "center",
          }}
        >
          <Text style={[tType.labelS, { color: t.onAccent }]}>Open</Text>
        </View>
      </Card>

      <SectionHead title="Health trends" action="See all" onAction={go("/care/trends")} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tSpace[2.5] }}>
        {TREND_TILES.map((tile) => (
          <TrendCard key={tile.metric} tile={tile} onPress={go("/care/trends")} />
        ))}
      </View>

      <SectionHead title="Latest lab results" action="All results" onAction={go("/care/labs")} />
      <View style={{ gap: tSpace[2] }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 2,
          }}
        >
          <StatusPill tone="caution" label={`${labs.needReview} need review`} />
          <Text style={[tType.bodyS, { fontSize: 12, color: t.ink3 }]}>
            Released by your doctor · {labs.releasedOn}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: tSpace[2] }}>
          <LabTile
            title="HbA1c · 3-month sugar"
            value={String(labs.hba1c.value)}
            unit="%"
            words={`${labs.hba1c.value < hba1cPrev ? "Coming down" : "Not coming down yet"}. Target is below ${labs.hba1c.target}.`}
            onPress={go("/care/labs")}
            a11y={`HbA1c ${labs.hba1c.history.join(", ")}. Target below ${labs.hba1c.target}.`}
          >
            <Sparkbars
              values={labs.hba1c.history}
              min={0}
              max={Math.max(...labs.hba1c.history) * 1.05}
              target={labs.hba1c.target}
              highlight={t.caution.text}
              height={40}
              width={132}
              showValues={false}
            />
          </LabTile>
          <LabTile
            title="LDL · bad cholesterol"
            value={String(labs.ldl.value)}
            unit="mmol/L"
            words={
              labs.ldl.value > labs.ldl.target
                ? `A little high. Your doctor will talk about it ${labs.visit}.`
                : `In your target, below ${labs.ldl.target}.`
            }
            onPress={go("/care/labs")}
            a11y={`LDL ${labs.ldl.value}, target below ${labs.ldl.target}`}
          >
            <LdlBar value={labs.ldl.value} target={labs.ldl.target} />
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={[tType.micro, { fontSize: 10, color: t.ink3 }]}>Low</Text>
              <Text
                style={[
                  tType.micro,
                  { fontSize: 10, fontFamily: tFont.semibold, color: t.stable.text },
                ]}
              >
                Target &lt;{labs.ldl.target}
              </Text>
              <Text style={[tType.micro, { fontSize: 10, color: t.ink3 }]}>High</Text>
            </View>
          </LabTile>
        </View>
        <Card
          onPress={go("/care/labs")}
          radius={tRadius.row}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: tSpace[3],
            paddingVertical: tSpace[3],
          }}
        >
          <IconDisc name="check" color={t.stable.text} bg={t.stable.tint} size={32} />
          <View style={{ flex: 1 }}>
            <Text style={[tType.labelS, { color: t.ink }]}>
              {labs.healthy} other results are healthy
            </Text>
            <Text style={[tType.bodyS, { fontSize: 12, color: t.ink2 }]}>{labs.healthyLine}</Text>
          </View>
          <Icon name="forward" size={16} color={t.ink3} />
        </Card>
      </View>

      <SectionHead title="Move and eat" action="Open" onAction={go("/care/activity")} />
      <Card onPress={go("/care/activity")} style={{ flexDirection: "row", padding: tSpace[3.5] }}>
        <MoveRing
          value={act.steps}
          goal={act.stepsGoal}
          label={`of ${n(act.stepsGoal)} steps`}
          shown={n(act.steps)}
          icon="footprints"
          color={t.accent}
          iconColor={t.accentText}
        />
        <MoveRing
          value={act.activeMin}
          goal={act.activeGoal}
          label={`of ${act.activeGoal} active`}
          shown={`${act.activeMin} min`}
          icon="activity"
          color={t.cascade[2]}
          iconColor={t.cascade[2]}
        />
        <MoveRing
          value={act.kcal}
          goal={act.kcalGoal}
          label={`of ${n(act.kcalGoal)} kcal`}
          shown={n(act.kcal)}
          icon="utensils"
          color={t.ink}
          iconColor={t.ink}
        />
      </Card>

      <SectionHead title="Your care team" action="Open chat" onAction={go("/care/chat")} />
      <Card style={{ gap: tSpace[3] }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[2.5] }}>
          <View style={{ flexDirection: "row" }}>
            {[
              { i: "DR", bg: t.info.tint, fg: t.info.text },
              { i: "NS", bg: t.pending.tint, fg: t.pending.text },
              { i: "PH", bg: t.place.tint, fg: t.place.text },
              { i: "DT", bg: t.accentTint, fg: t.accentText },
            ].map((a, k) => (
              <View
                key={a.i}
                style={{
                  marginLeft: k ? -8 : 0,
                  borderRadius: 20,
                  borderWidth: 2,
                  borderColor: t.surface,
                }}
              >
                <Avatar initials={a.i} size={36} bg={a.bg} fg={a.fg} />
              </View>
            ))}
          </View>
          <Text style={[tType.bodyS, { flex: 1, color: t.ink2 }]}>
            Doctor, nurse, pharmacist and dietitian
          </Text>
        </View>
        <Press
          onPress={go("/care/chat")}
          accessibilityLabel={`${chat.from}, ${chat.time}: ${chat.text}`}
          style={{
            flexDirection: "row",
            gap: tSpace[2.5],
            alignItems: "flex-start",
            paddingVertical: tSpace[2.5],
            paddingHorizontal: tSpace[3],
            borderRadius: 16,
            backgroundColor: t.bg,
          }}
        >
          <View
            style={{
              width: 8,
              height: 8,
              marginTop: 6,
              borderRadius: 4,
              backgroundColor: t.accent,
            }}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[tType.labelS, { color: t.ink }]}>
              {chat.from} · {chat.time}
            </Text>
            <Text
              style={[
                tType.bodyM,
                { fontFamily: tFont.regular, fontSize: 14, lineHeight: 19, color: t.ink2 },
              ]}
            >
              {chat.text}
            </Text>
          </View>
        </Press>
        <View style={{ flexDirection: "row", gap: tSpace[2] }}>
          <Button
            label="Reply"
            icon="message"
            size="md"
            onPress={go("/care/chat")}
            style={{ flex: 1 }}
          />
          <Button label="Voice" icon="mic" size="md" variant="soft" onPress={go("/care/chat")} />
          <Button label="Video" icon="video" size="md" variant="soft" onPress={go("/care/chat")} />
        </View>
      </Card>

      <Text style={[tType.bodyS, { fontSize: 12, color: t.ink3, textAlign: "center" }]}>
        Illustrative. No real patients. Targets set by your care team.
      </Text>
    </Screen>
  );
}

/** One Health trends tile: value, an arrow disc and the words that say what the arrow means. */
function TrendCard({ tile, onPress }: { tile: TrendTile; onPress: () => void }) {
  const t = useTide();
  const pair =
    tile.dir === "flat"
      ? t.pending
      : tile.good
        ? { tint: t.accentTint, text: t.accentText }
        : t.caution;
  const rotate = tile.dir === "down" ? "0deg" : tile.dir === "up" ? "180deg" : "-90deg";
  return (
    <Card
      onPress={onPress}
      radius={tRadius.card}
      accessibilityLabel={`${tile.name}: ${tile.value} ${tile.unit}. ${tile.trend}`}
      style={{ flexBasis: "47%", flexGrow: 1, gap: tSpace[1], paddingVertical: tSpace[3] }}
    >
      <Text style={[tType.bodyS, { fontFamily: tFont.semibold, color: t.ink2 }]} numberOfLines={1}>
        {tile.name}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: tSpace[1.5],
        }}
      >
        <View
          style={{ flexDirection: "row", alignItems: "baseline", gap: tSpace[1], flexShrink: 1 }}
        >
          <Text
            style={{
              fontFamily: tFont.bold,
              fontSize: 22,
              lineHeight: 26,
              letterSpacing: -0.4,
              color: t.ink,
              fontVariant: ["tabular-nums"],
            }}
          >
            {tile.value}
          </Text>
          <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.ink2 }]}>
            {tile.unit}
          </Text>
        </View>
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: pair.tint,
            alignItems: "center",
            justifyContent: "center",
            transform: [{ rotate }],
          }}
        >
          <Icon name="arrowDown" size={17} color={pair.text} strokeWidth={2.4} />
        </View>
      </View>
      <Text style={[tType.caption, { fontFamily: tFont.medium, color: pair.text }]}>
        {tile.trend}
      </Text>
    </Card>
  );
}

function LabTile({
  title,
  value,
  unit,
  words,
  onPress,
  a11y,
  children,
}: {
  title: string;
  value: string;
  unit: string;
  words: string;
  onPress: () => void;
  a11y: string;
  children: ReactNode;
}) {
  const t = useTide();
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${title}: ${value} ${unit}. ${words} ${a11y}`}
      style={{ flex: 1, gap: tSpace[2] }}
    >
      <Text style={[tType.bodyS, { fontFamily: tFont.semibold, color: t.ink2 }]}>{title}</Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: tSpace[1] }}>
        <Text
          style={{
            fontFamily: tFont.bold,
            fontSize: 28,
            lineHeight: 30,
            letterSpacing: -0.5,
            color: t.ink,
          }}
        >
          {value}
        </Text>
        <Text style={[tType.caption, { color: t.ink2 }]}>{unit}</Text>
      </View>
      {children}
      <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.ink2 }]}>{words}</Text>
    </Card>
  );
}

/** LDL against its target: the healthy span in green tint, above it amber tint, the value a ringed dot. */
function LdlBar({ value, target }: { value: number; target: number }) {
  const t = useTide();
  const max = target * 2;
  const x = (v: number) => Math.max(8, Math.min(124, (v / max) * 132));
  const tone = value > target ? t.caution.text : t.stable.text;
  return (
    <Svg width="100%" height={40} viewBox="0 0 132 40" preserveAspectRatio="none">
      <Rect x={0} y={16} width={x(target) + 2} height={10} rx={5} fill={t.stable.tint} />
      <Rect
        x={x(target) - 2}
        y={16}
        width={134 - x(target)}
        height={10}
        rx={5}
        fill={t.caution.tint}
      />
      <Line
        x1={x(target)}
        y1={10}
        x2={x(target)}
        y2={32}
        stroke={t.stable.text}
        strokeWidth={1.5}
        strokeDasharray="3 3"
      />
      <Circle cx={x(value)} cy={21} r={8} fill={t.surface} stroke={tone} strokeWidth={3} />
    </Svg>
  );
}

function MoveRing({
  value,
  goal,
  label,
  shown,
  icon,
  color,
  iconColor,
}: {
  value: number;
  goal: number;
  label: string;
  shown: string;
  icon: IconName;
  color: string;
  iconColor: string;
}) {
  const t = useTide();
  return (
    <View
      accessible
      accessibilityLabel={`${shown} ${label}`}
      style={{ flex: 1, alignItems: "center", gap: tSpace[1.5] }}
    >
      <Ring value={goal ? value / goal : 0} size={64} stroke={8} color={color}>
        <Icon name={icon} size={20} color={iconColor} />
      </Ring>
      <View style={{ alignItems: "center" }}>
        <Text
          style={{
            fontFamily: tFont.bold,
            fontSize: 15,
            color: t.ink,
            fontVariant: ["tabular-nums"],
          }}
        >
          {shown}
        </Text>
        <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.ink2 }]}>{label}</Text>
      </View>
    </View>
  );
}
