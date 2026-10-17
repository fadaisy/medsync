import type { ReactNode } from "react";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";

import { Band, Button, Card, Icon, IconDisc, Press, Ring } from "@/components/tide";
import {
  activityRepo,
  GLASSES,
  MEALS,
  PLATE_ART,
  SAFETY_SIGNS,
  SAFETY_STEPS,
  TODAY,
  useActivity,
  WEEK_GOAL,
  WEEK_LETTERS,
  WEEK_MINUTES,
} from "@/data/activity";
import { PlateGuide } from "@/features/care-more/plate-guide";
import { track } from "@/lib/analytics";
import { useTide } from "@/theme/theme";
import { tRadius, tSpace, tType } from "@/theme/tide";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const fmt = (n: number) => n.toLocaleString("en-US");

function Heading({ children }: { children: string }) {
  const t = useTide();
  return (
    <Text
      accessibilityRole="header"
      style={[tType.heading, { fontSize: 18, lineHeight: 24, color: t.ink }]}
    >
      {children}
    </Text>
  );
}

/** A card holding rows split by hairlines. */
function ListCard({ rows }: { rows: ReactNode[] }) {
  const t = useTide();
  return (
    <Card padding={0} style={{ gap: 0, overflow: "hidden" }}>
      {rows.map((c, i) => (
        <View
          key={i}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: tSpace[3],
            paddingVertical: tSpace[3],
            paddingHorizontal: tSpace[4],
            borderTopWidth: i === 0 ? 0 : 1,
            borderTopColor: t.surface3,
          }}
        >
          {c}
        </View>
      ))}
    </Card>
  );
}

/* ─── Move ───────────────────────────────────────────────────────────── */

export function MovePanel({ now }: { now: Date }) {
  const t = useTide();
  const router = useRouter();
  const { walkStartedAt } = useActivity();
  const weekTotal = WEEK_MINUTES.reduce((a, b) => a + b, 0);
  const goalDay = WEEK_GOAL / 5;
  const stat = (label: string, dot: string, value: number, goal: number) => (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[1.5] }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
        <Text style={[tType.overline, { color: dot }]}>{label}</Text>
      </View>
      <Text
        style={[
          tType.title,
          { fontFamily: tType.numeral.fontFamily, fontSize: 22, lineHeight: 26, color: t.onBand },
        ]}
      >
        {fmt(value)} <Text style={[tType.bodyS, { color: t.onBand2 }]}>of {fmt(goal)}</Text>
      </Text>
    </View>
  );
  return (
    <View style={{ gap: tSpace[3.5] }}>
      <Band
        style={{
          borderRadius: 26,
          padding: tSpace[4.5],
          flexDirection: "row",
          alignItems: "center",
          gap: tSpace[4.5],
        }}
      >
        <Ring
          value={TODAY.steps / TODAY.stepsGoal}
          size={112}
          stroke={12}
          color={t.accent}
          track={t.bandGlass}
          accessibilityLabel={`${fmt(TODAY.steps)} of ${fmt(TODAY.stepsGoal)} steps, ${TODAY.activeMin} of ${TODAY.activeGoal} active minutes`}
        >
          <Ring
            value={TODAY.activeMin / TODAY.activeGoal}
            size={70}
            stroke={10}
            color={t.onBand2}
            track={t.bandGlass}
          />
        </Ring>
        <View style={{ gap: tSpace[2.5], flex: 1 }}>
          {stat("Steps", t.onBandAccent, TODAY.steps, TODAY.stepsGoal)}
          {stat("Active minutes", t.onBand2, TODAY.activeMin, TODAY.activeGoal)}
        </View>
      </Band>

      <Card padding={tSpace[4]}>
        <View
          style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}
        >
          <Text style={[tType.label, { color: t.ink }]}>Active minutes this week</Text>
          <Text style={[tType.caption, { fontSize: 13, color: t.accentText }]}>
            {weekTotal} of {WEEK_GOAL}
          </Text>
        </View>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Active minutes: ${WEEK_MINUTES.map((m, i) => `${DAY_NAMES[i]} ${m}`).join(", ")}. Today is ${DAY_NAMES[6]}.`}
          style={{ flexDirection: "row", gap: tSpace[2], height: 96, alignItems: "flex-end" }}
        >
          {WEEK_MINUTES.map((m, i) => {
            const today = i === WEEK_MINUTES.length - 1;
            return (
              <View key={i} style={{ flex: 1, alignItems: "center", gap: tSpace[1] }}>
                <View
                  style={{
                    alignSelf: "stretch",
                    height: Math.max(4, Math.round((Math.min(m, goalDay) / goalDay) * 76)),
                    borderRadius: 8,
                    backgroundColor: today ? t.accent : m >= goalDay ? t.primary : t.lineStrong,
                  }}
                />
                <Text
                  style={[
                    today ? tType.caption : tType.micro,
                    { fontSize: 11, color: today ? t.ink : t.ink2 },
                  ]}
                >
                  {WEEK_LETTERS[i]}
                </Text>
              </View>
            );
          })}
        </View>
        <Text style={[tType.bodyS, { fontFamily: tType.body.fontFamily, color: t.ink2 }]}>
          {WEEK_GOAL} minutes a week of brisk walking is the goal your team set.
        </Text>
      </Card>

      <Heading>Today&apos;s movement</Heading>
      <ListCard
        rows={[
          <>
            <IconDisc name="walk" size={38} color={t.accentText} bg={t.accentTint} />
            <View style={{ flex: 1 }}>
              <Text style={[tType.label, { fontSize: 15, color: t.ink }]}>Morning walk</Text>
              <Text style={[tType.bodyS, { fontFamily: tType.body.fontFamily, color: t.ink2 }]}>
                07:00 · 22 min · 2,600 steps
              </Text>
            </View>
            <View
              accessible
              accessibilityLabel="Done"
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: t.primary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="check" size={13} color={t.onPrimary} strokeWidth={3} />
            </View>
          </>,
          <>
            <IconDisc name="message" size={38} color={t.info.text} bg={t.info.tint} />
            <View style={{ flex: 1 }}>
              <Text style={[tType.label, { fontSize: 15, color: t.ink }]}>
                Evening walk, 10 min
              </Text>
              <Text style={[tType.bodyS, { fontFamily: tType.body.fontFamily, color: t.ink2 }]}>
                {walkStartedAt ? `Started ${walkStartedAt}` : "Suggested by your care team"}
              </Text>
            </View>
            {walkStartedAt ? (
              <Icon name="check" size={20} color={t.accentText} strokeWidth={2.4} />
            ) : (
              <Button
                label="Start"
                variant="accent"
                size="sm"
                accessibilityLabel="Start the evening walk"
                onPress={() => activityRepo.startWalk(now)}
              />
            )}
          </>,
        ]}
      />

      <View
        accessibilityRole="summary"
        accessibilityLabel="Safety while you move"
        style={{
          borderRadius: tRadius.cardLg,
          backgroundColor: t.caution.tint,
          padding: tSpace[3.5],
          gap: tSpace[3],
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[2.5] }}>
          <IconDisc name="alert" size={36} color={t.surface} bg={t.caution.text} />
          <View style={{ flex: 1 }}>
            <Text style={[tType.overline, { color: t.caution.text }]}>Safety while you move</Text>
            <Text
              accessibilityRole="header"
              style={[tType.label, { lineHeight: 21, color: t.ink }]}
            >
              Stop at once if you feel any of these
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tSpace[2] }}>
          {SAFETY_SIGNS.map((s) => (
            <View
              key={s.text}
              style={{
                flexBasis: "47%",
                flexGrow: 1,
                flexDirection: "row",
                alignItems: "center",
                gap: tSpace[2],
                paddingVertical: 9,
                paddingHorizontal: tSpace[2.5],
                borderRadius: tRadius.md,
                backgroundColor: t.surface,
              }}
            >
              <Icon name={s.icon} size={18} color={t.caution.text} />
              <Text
                style={[tType.caption, { fontSize: 13, lineHeight: 17, color: t.ink, flex: 1 }]}
              >
                {s.text}
              </Text>
            </View>
          ))}
        </View>
        <View
          style={{
            gap: tSpace[1.5],
            padding: tSpace[2.5],
            borderRadius: tRadius.md,
            backgroundColor: t.surface,
          }}
        >
          <Text
            style={[
              tType.caption,
              { fontFamily: tType.label.fontFamily, fontSize: 13, color: t.ink },
            ]}
          >
            What to do
          </Text>
          {SAFETY_STEPS.map((s) => (
            <Text key={s} style={[tType.bodyS, { lineHeight: 19, color: t.ink }]}>
              {s}
            </Text>
          ))}
        </View>
        <Button
          label="I feel this now · Get help"
          variant="danger"
          icon="phone"
          onPress={() => {
            track("help_opened", { source: "care/activity" });
            router.push("/help");
          }}
        />
        <Text style={[tType.micro, { color: t.caution.text, textAlign: "center" }]}>
          Signs and steps illustrative · pending CSO sign-off
        </Text>
      </View>
    </View>
  );
}

/* ─── Eat ────────────────────────────────────────────────────────────── */

export function EatPanel({ onStub }: { onStub: (text: string) => void }) {
  const t = useTide();
  const { water } = useActivity();
  const mealColours = [t.primary, t.cascade[2], t.accent];
  const swatch = (c: string) => (
    <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: c }} />
  );
  return (
    <View style={{ gap: tSpace[3.5] }}>
      <Card radius={26} padding={tSpace[4]} style={{ gap: tSpace[3] }}>
        <View
          style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}
        >
          <View>
            <Text style={[tType.caption, { fontSize: 13, color: t.ink2 }]}>Food today</Text>
            <Text
              style={[
                tType.title,
                { fontFamily: tType.numeral.fontFamily, fontSize: 26, color: t.ink },
              ]}
            >
              {fmt(TODAY.kcal)}{" "}
              <Text style={[tType.bodyM, { fontSize: 14, color: t.ink2 }]}>
                of {fmt(TODAY.kcalGoal)} kcal
              </Text>
            </Text>
          </View>
          <Text style={[tType.caption, { fontSize: 13, color: t.accentText }]}>
            {fmt(TODAY.kcalGoal - TODAY.kcal)} left
          </Text>
        </View>
        <View
          style={{
            flexDirection: "row",
            height: 14,
            borderRadius: tRadius.pill,
            overflow: "hidden",
            backgroundColor: t.surface3,
            gap: 2,
          }}
        >
          {MEALS.map((m, i) => (
            <View
              key={m.id}
              style={{
                width: `${(m.kcal / TODAY.kcalGoal) * 100}%` as `${number}%`,
                backgroundColor: mealColours[i],
              }}
            />
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: tSpace[3] }}>
          {MEALS.map((m, i) => (
            <View key={m.id} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              {swatch(mealColours[i])}
              <Text style={[tType.caption, { fontFamily: tType.bodyS.fontFamily, color: t.ink2 }]}>
                {m.name}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      <Card
        padding={tSpace[4]}
        style={{ flexDirection: "row", alignItems: "center", gap: tSpace[3.5] }}
      >
        <PlateGuide />
        <View style={{ flex: 1, gap: tSpace[1] }}>
          <Text style={[tType.label, { fontSize: 15, color: t.ink }]}>Your plate guide</Text>
          {(
            [
              [PLATE_ART.greens, "Half: greens and vegetables"],
              [PLATE_ART.starch, "Quarter: matooke, posho, rice"],
              [PLATE_ART.protein, "Quarter: beans, fish, chicken"],
            ] as const
          ).map(([c, text]) => (
            <View
              key={text}
              style={{ flexDirection: "row", alignItems: "center", gap: tSpace[1.5] }}
            >
              {swatch(c)}
              <Text style={[tType.bodyS, { color: t.ink2, flex: 1 }]}>{text}</Text>
            </View>
          ))}
        </View>
      </Card>

      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Heading>Meals</Heading>
        <Button
          label="Snap your plate"
          variant="accent"
          size="sm"
          icon="camera"
          onPress={() => onStub("Not available yet")}
        />
      </View>
      <ListCard
        rows={[
          ...MEALS.map((m) => (
            <>
              <Text style={[tType.caption, { fontSize: 13, width: 52, color: t.ink2 }]}>
                {m.time}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={[tType.label, { fontSize: 15, color: t.ink }]}>{m.name}</Text>
                <Text style={[tType.bodyS, { fontFamily: tType.body.fontFamily, color: t.ink2 }]}>
                  {m.what}
                </Text>
              </View>
              <Text
                style={[
                  tType.labelS,
                  {
                    fontFamily: tType.numeral.fontFamily,
                    color: t.ink,
                    fontVariant: ["tabular-nums"],
                  },
                ]}
              >
                {m.kcal}
              </Text>
            </>
          )),
          <>
            <Text style={[tType.caption, { fontSize: 13, width: 52, color: t.ink3 }]}>Later</Text>
            <Text style={[tType.label, { fontSize: 15, flex: 1, color: t.ink3 }]}>Supper</Text>
            <Press
              onPress={() => onStub("Not available yet")}
              accessibilityLabel="Add supper"
              hitSlop={7}
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                borderWidth: 1.5,
                borderColor: t.lineStrong,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="plus" size={15} color={t.ink2} />
            </Press>
          </>,
        ]}
      />

      <Card padding={tSpace[4]}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={[tType.label, { fontSize: 15, color: t.ink }]}>Water</Text>
          <Text style={[tType.caption, { fontSize: 13, color: t.ink2 }]}>
            {water} of {GLASSES} glasses
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: tSpace[1.5] }}>
          {Array.from({ length: GLASSES }, (_, i) => {
            const full = i < water;
            return (
              <Press
                key={i}
                onPress={() => activityRepo.tapGlass(i)}
                accessibilityLabel={`Glass ${i + 1}${full ? ", drunk" : ""}`}
                accessibilityState={{ checked: full }}
                hitSlop={{ top: 2, bottom: 2 }}
                style={{
                  flex: 1,
                  height: 44,
                  borderTopLeftRadius: 10,
                  borderTopRightRadius: 10,
                  borderBottomLeftRadius: 14,
                  borderBottomRightRadius: 14,
                  backgroundColor: full ? PLATE_ART.water : t.surface,
                  borderWidth: 1.5,
                  borderColor: full ? PLATE_ART.waterEdge : t.lineStrong,
                }}
              >
                <View />
              </Press>
            );
          })}
        </View>
      </Card>
    </View>
  );
}
