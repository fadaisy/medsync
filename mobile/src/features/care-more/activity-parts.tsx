import { useRouter } from "expo-router";
import { Text, View } from "react-native";

import { Band, Button, Card, Icon, IconDisc, Press, Ring } from "@/components/tide";
import {
  activityRepo,
  DAY_GOAL,
  GLASSES,
  PLATE_ART,
  SAFETY_SIGNS,
  SAFETY_STEPS,
  useActivity,
  WALK_MINUTES,
  WEEK_GOAL,
} from "@/data/activity";
import { PlateGuide } from "@/features/care-more/plate-guide";
import { lastSevenDays } from "@/features/care/logic";
import { track } from "@/lib/analytics";
import { savedLine } from "@/offline/outbox";
import { useTide } from "@/theme/theme";
import { tRadius, tSpace, tType } from "@/theme/tide";

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

function Loading({ error, retry }: { error: boolean; retry: () => void }) {
  const t = useTide();
  return error ? (
    <View style={{ gap: tSpace[2], alignItems: "flex-start" }}>
      <Text style={[tType.bodyM, { color: t.ink2 }]}>Couldn&apos;t load what you logged.</Text>
      <Button label="Try again" variant="outline" size="sm" onPress={retry} />
    </View>
  ) : (
    <Text style={[tType.bodyM, { color: t.ink2 }]}>Loading…</Text>
  );
}

/* ─── Move ───────────────────────────────────────────────────────────── */

/** Minutes walked, from the walks the patient logs: today, the week, and three one-tap walk lengths. */
export function MovePanel({ now, onToast }: { now: Date; onToast: (text: string) => void }) {
  const t = useTide();
  const router = useRouter();
  const act = useActivity(now);
  const days = lastSevenDays(now);
  const weekTotal = act.weekMinutes.reduce((a, b) => a + b, 0);
  if (act.loading && !weekTotal) return <Loading error={false} retry={act.retry} />;
  if (act.error) return <Loading error retry={act.retry} />;
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
          value={act.minutesToday / DAY_GOAL}
          size={112}
          stroke={12}
          color={t.accent}
          track={t.bandGlass}
          accessibilityLabel={`${act.minutesToday} of ${DAY_GOAL} minutes walked today`}
        >
          <Icon name="walk" size={28} color={t.onBand} />
        </Ring>
        <View style={{ gap: tSpace[1], flex: 1 }}>
          <Text style={[tType.overline, { color: t.onBandAccent }]}>Walked today</Text>
          <Text
            style={[
              tType.title,
              {
                fontFamily: tType.numeral.fontFamily,
                fontSize: 22,
                lineHeight: 26,
                color: t.onBand,
              },
            ]}
          >
            {act.minutesToday} min{" "}
            <Text style={[tType.bodyS, { color: t.onBand2 }]}>of {DAY_GOAL}</Text>
          </Text>
        </View>
      </Band>

      <Card padding={tSpace[4]} style={{ gap: tSpace[3] }}>
        <Text style={[tType.label, { color: t.ink }]}>I walked</Text>
        <View style={{ flexDirection: "row", gap: tSpace[2] }}>
          {WALK_MINUTES.map((m) => (
            <Button
              key={m}
              label={`${m} min`}
              variant="soft"
              size="sm"
              accessibilityLabel={`Log a ${m} minute walk`}
              onPress={async () =>
                onToast(savedLine(await activityRepo.logWalk(m), `Saved · ${m} minutes`))
              }
              style={{ flex: 1 }}
            />
          ))}
        </View>
      </Card>

      <Card padding={tSpace[4]}>
        <View
          style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}
        >
          <Text style={[tType.label, { color: t.ink }]}>Minutes walked this week</Text>
          <Text style={[tType.caption, { fontSize: 13, color: t.accentText }]}>
            {weekTotal} of {WEEK_GOAL}
          </Text>
        </View>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Minutes walked: ${act.weekMinutes.map((m, i) => `${i === 6 ? "today" : days[i].name} ${m}`).join(", ")}.`}
          style={{ flexDirection: "row", gap: tSpace[2], height: 96, alignItems: "flex-end" }}
        >
          {act.weekMinutes.map((m, i) => {
            const today = i === act.weekMinutes.length - 1;
            return (
              <View key={i} style={{ flex: 1, alignItems: "center", gap: tSpace[1] }}>
                <View
                  style={{
                    alignSelf: "stretch",
                    height: Math.max(4, Math.round((Math.min(m, DAY_GOAL) / DAY_GOAL) * 76)),
                    borderRadius: 8,
                    backgroundColor: today ? t.accent : m >= DAY_GOAL ? t.primary : t.lineStrong,
                  }}
                />
                <Text
                  style={[
                    today ? tType.caption : tType.micro,
                    { fontSize: 11, color: today ? t.ink : t.ink2 },
                  ]}
                >
                  {days[i].letter}
                </Text>
              </View>
            );
          })}
        </View>
        <Text style={[tType.bodyS, { fontFamily: tType.body.fontFamily, color: t.ink2 }]}>
          A common goal is {WEEK_GOAL} minutes of brisk walking a week. Ask your care team what is
          right for you.
        </Text>
      </Card>

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

/** The plate guide (education), water from the patient's own log, and meals not yet available. */
export function EatPanel({ now, onToast }: { now: Date; onToast: (text: string) => void }) {
  const t = useTide();
  const act = useActivity(now);
  const swatch = (c: string) => (
    <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: c }} />
  );
  return (
    <View style={{ gap: tSpace[3.5] }}>
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
          onPress={() => onToast("Not available yet")}
        />
      </View>
      <Text style={[tType.bodyM, { color: t.ink2 }]}>
        Writing down your meals is not available yet.
      </Text>

      <Card padding={tSpace[4]}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={[tType.label, { fontSize: 15, color: t.ink }]}>Water</Text>
          <Text style={[tType.caption, { fontSize: 13, color: t.ink2 }]}>
            {act.loading ? "Loading…" : `${act.water} of ${GLASSES} glasses`}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: tSpace[1.5] }}>
          {Array.from({ length: GLASSES }, (_, i) => {
            const full = i < act.water;
            return (
              <Press
                key={i}
                onPress={async () => {
                  const r = await activityRepo.tapGlass(act.water, i);
                  if (r !== "sent") onToast(savedLine(r));
                }}
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
