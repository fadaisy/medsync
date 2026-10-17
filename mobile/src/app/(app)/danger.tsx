import { useState } from "react";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Band, Button, Card, Note, Pill, Ring, Screen, StatusPill } from "@/components/tide";
import { hhmm } from "@/data/medicines";
import { RECHECK_MINUTES } from "@/features/safety/config";
import { readingFromParams } from "@/features/safety/danger";
import { checkReading, UNITS } from "@/lib/readings";
import { useNow } from "@/lib/use-now";
import { ForcedScheme, useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

/**
 * The dangerous-reading interrupt (board TDanger/DDanger, F-22). Forced light
 * (law L11). Unlike Help it keeps the round Help in its header (law L6).
 *
 * The reading arrives as route params (`kind`, `value`, and `context` for
 * sugar); the level, the headline and the signs come from `checkReading()`
 * over the pending-CSO threshold file (law L7), never from this screen.
 */
export default function DangerScreen() {
  const params = useLocalSearchParams<{ kind?: string; value?: string; context?: string }>();
  // Only a dangerous reading belongs here. Anything else that asks for help
  // (chest pain with no number, a stale link) goes to Help, which always helps.
  if (checkReading(readingFromParams(params)).level !== "danger") return <Redirect href="/help" />;
  return (
    <ForcedScheme scheme="light">
      <DangerBody />
    </ForcedScheme>
  );
}

function DangerBody() {
  const t = useTide();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string; value?: string; context?: string }>();
  const input = readingFromParams(params);
  const check = checkReading(input);
  const [seenAt] = useState(() => hhmm(new Date()));
  const [step, setStep] = useState<"ask" | "recheck">("ask");

  // The recheck wait, really run: `useNow` ticks each second against `endsAt`.
  const total = RECHECK_MINUTES * 60_000;
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const now = useNow(1000);
  const startWait = () => setEndsAt(Date.now() + total);
  const left = endsAt === null ? total : Math.max(0, endsAt - now.getTime());
  const done = endsAt !== null && left === 0;
  const mmss = `${Math.floor(left / 60_000)}:${String(Math.floor((left % 60_000) / 1000)).padStart(2, "0")}`;

  const big =
    input.kind === "bp" ? `${input.top ?? "–"}/${input.bottom ?? "–"}` : `${input.value ?? "–"}`;
  const signs = check.signs ?? [];

  return (
    <Screen
      stagger={false}
      helpSource="danger"
      header={
        <Pill label={`Danger · ${seenAt}`} icon="alert" bg={t.surface} fg={t.critical.text} />
      }
      topBand={
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: insets.top + 56,
            backgroundColor: t.critical.tint,
          }}
        />
      }
      footer={
        step === "ask" ? (
          <>
            <Button
              label="Yes, get help now"
              icon="phone"
              variant="danger"
              onPress={() => router.push("/help")}
            />
            <Button
              label="No, none of these"
              variant="outline"
              onPress={() => setStep("recheck")}
            />
          </>
        ) : (
          <>
            {done ? (
              <Button
                label="Measure again"
                variant="accent"
                onPress={() => router.replace("/care/reading")}
              />
            ) : (
              <Button
                label={endsAt === null ? `Start the ${RECHECK_MINUTES} minutes` : "Waiting…"}
                variant="accent"
                disabled={endsAt !== null}
                onPress={startWait}
              />
            )}
            <Button label="Help" variant="danger" size="md" onPress={() => router.push("/help")} />
          </>
        )
      }
    >
      <View
        style={{
          marginHorizontal: -tSpace[5],
          marginTop: -tSpace[1] - 6,
          paddingTop: tSpace[2],
          paddingHorizontal: tSpace[5],
          paddingBottom: 26,
          backgroundColor: t.critical.tint,
          borderBottomLeftRadius: tRadius.xl,
          borderBottomRightRadius: tRadius.xl,
          gap: tSpace[2.5],
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: tSpace[2] }}>
          <Text
            style={{
              fontFamily: tFont.bold,
              fontSize: 52,
              lineHeight: 56,
              letterSpacing: -1.5,
              color: t.critical.text,
              fontVariant: ["tabular-nums"],
            }}
          >
            {big}
          </Text>
          <Text style={[tType.label, { color: t.critical.text }]}>{UNITS[input.kind]}</Text>
        </View>
        <StatusPill tone="critical" label={check.text} style={{ backgroundColor: t.surface }} />
        <Text
          accessibilityRole="header"
          style={[tType.display, { fontSize: 30, lineHeight: 34, color: t.ink }]}
        >
          {check.dangerWord ?? "Check this reading"}
        </Text>
      </View>

      {step === "ask" ? (
        <>
          <Text
            accessibilityRole="header"
            style={[tType.section, { fontSize: 19, lineHeight: 24, color: t.ink }]}
          >
            Do you have any of these right now?
          </Text>
          <Card padding={0} style={{ gap: 0, paddingVertical: tSpace[1] }}>
            {signs.map((s, i) => (
              <Text
                key={s}
                style={[
                  tType.body,
                  {
                    fontSize: 16,
                    lineHeight: 22,
                    color: t.ink,
                    paddingVertical: tSpace[3],
                    paddingHorizontal: tSpace[4.5],
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: t.line,
                  },
                ]}
              >
                {s}
              </Text>
            ))}
          </Card>
          {check.selfCare ? <Note tone="info">{check.selfCare}</Note> : null}
        </>
      ) : (
        <>
          <Text
            accessibilityRole="header"
            style={[tType.section, { fontSize: 19, lineHeight: 24, color: t.ink }]}
          >
            Sit quietly and measure again in {RECHECK_MINUTES} minutes
          </Text>
          <Band
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: tSpace[4],
              padding: tSpace[4.5],
            }}
          >
            <Ring
              value={left / total}
              size={72}
              stroke={5}
              color={t.accent}
              track={t.bandGlass}
              accessibilityLabel={`${mmss} left`}
            >
              <Text
                style={[
                  tType.heading,
                  { fontSize: 20, color: t.onBand, fontVariant: ["tabular-nums"] },
                ]}
              >
                {mmss}
              </Text>
            </Ring>
            <Text style={[tType.bodyM, { flex: 1, lineHeight: 22, color: t.onBand2 }]}>
              {done
                ? "Time is up. Measure again now."
                : "Rest and keep this screen open. When the time is up, measure again."}
            </Text>
          </Band>
          <Card style={{ flexDirection: "row", alignItems: "center", gap: tSpace[3] }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.area.team }} />
            <Text style={[tType.bodyM, { flex: 1, color: t.ink }]}>
              Your care team can see this reading.
            </Text>
            <StatusPill tone="pending" label="Demo" />
          </Card>
          <Text style={[tType.bodyM, { lineHeight: 22, color: t.ink2 }]}>
            If any of those signs start, press the red Help button at once.
          </Text>
        </>
      )}
      <Text style={[tType.micro, { color: t.ink3, textAlign: "center" }]}>
        Limits and signs pending CSO sign-off
      </Text>
    </Screen>
  );
}
