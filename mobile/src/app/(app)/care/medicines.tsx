import type { IconName } from "@/components/tide";
import type { DoseSlot, Medicine } from "@/data/medicines";
import type { Anim } from "@/motion/presets";
import type { Tide } from "@/theme/tide";
import { useState } from "react";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import {
  Button,
  Capsule,
  Card,
  Icon,
  Pill,
  Press,
  ProgressBar,
  Ring,
  Screen,
  Tablet,
} from "@/components/tide";
import {
  LOW_SUPPLY_DAYS,
  medicinesRepo,
  MONTH_ADHERENCE,
  SLOT_WORDS,
  useMedicines,
} from "@/data/medicines";
import { dayHeadline, lastSevenDays, shortDate, timelineFill } from "@/features/care/logic";
import { useNow } from "@/lib/use-now";
import { EASE_OUT, fade, motion, OVERSHOOT, ringFillMs } from "@/motion/presets";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

const SLOT_ICONS: Record<DoseSlot, IconName> = {
  morning: "sunrise",
  midday: "sun",
  evening: "moon",
};

/** The ✓ on the done card pops in with a small overshoot (board `popIn`). */
const popIn = (reduced: boolean): Anim =>
  reduced
    ? fade()
    : {
        animationName: {
          "0%": { opacity: 0, transform: [{ scale: 0.5 }] },
          "70%": { opacity: 1, transform: [{ scale: 1.12 }] },
          "100%": { opacity: 1, transform: [{ scale: 1 }] },
        },
        animationDuration: 500,
        animationTimingFunction: OVERSHOOT,
        animationFillMode: "both",
      };

/** One ring of teal spreads out behind the ✓ once (board `burst`). Not drawn under reduce motion. */
const burst: Anim = {
  animationName: {
    from: { opacity: 0.9, transform: [{ scale: 0.4 }] },
    to: { opacity: 0, transform: [{ scale: 2.2 }] },
  },
  animationDuration: 700,
  animationTimingFunction: "ease-out",
  animationFillMode: "both",
};

/**
 * Medicines today (board TMedicines, prompt §8.4, PRD F-14). Demo data until
 * Gate CG (law L2). Names, times of day and "As your clinician prescribed"
 * only: no dose amount anywhere (law L5).
 */
export default function MedicinesScreen() {
  const t = useTide();
  const router = useRouter();
  const reduced = useReducedMotion();
  const now = useNow();
  const med = useMedicines(now);
  const [justTaken, setJustTaken] = useState<string | null>(null);

  const { doses, taken, total, week, medicines } = med;
  const due = doses.find((d) => d.status === "due");
  const done = doses.find((d) => d.id === justTaken && d.status === "taken");
  const next = done ? doses.find((d) => d.status !== "taken" && d.time > done.time) : undefined;
  const days = lastSevenDays(now);
  const weekTaken = week.reduce((a, b) => a + b, 0);
  const fill = timelineFill(taken, total);

  return (
    <Screen back={{ label: "Care" }} demo>
      <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[4.5] }}>
        <Ring
          value={total ? taken / total : 0}
          size={116}
          stroke={12}
          color={t.accentPressed}
          accessibilityLabel={`${taken} of ${total} doses taken today`}
        >
          <Text
            style={{
              fontFamily: tFont.monoBold,
              fontSize: 34,
              lineHeight: 36,
              letterSpacing: -1.4,
              color: t.ink,
            }}
          >
            {taken}
            <Text style={{ fontSize: 18, color: t.ink4 }}>/{total}</Text>
          </Text>
          <Text style={[tType.micro, { fontFamily: tFont.semibold, color: t.ink2 }]}>
            taken today
          </Text>
        </Ring>
        <View style={{ flex: 1, gap: tSpace[1] }}>
          <Text style={[tType.overline, { color: t.area.medicines }]}>{shortDate(now)}</Text>
          <Text
            accessibilityRole="header"
            style={[tType.display, { fontSize: 30, lineHeight: 33, color: t.ink }]}
          >
            {dayHeadline(taken, total)}
          </Text>
          <Text style={[tType.bodyS, { color: t.ink2 }]}>
            {Math.round(MONTH_ADHERENCE * 100)}% this month · your care team sees it
          </Text>
        </View>
      </View>

      <Card
        radius={tRadius.panel}
        padding={tSpace[1.5]}
        style={{ flexDirection: "row", paddingVertical: tSpace[3.5] }}
      >
        <View
          style={{
            position: "absolute",
            left: 60,
            right: 60,
            top: 40,
            height: 3,
            borderRadius: 3,
            backgroundColor: t.surface3,
          }}
        >
          <Animated.View
            style={{
              width: `${Math.round(fill * 100)}%`,
              height: 3,
              borderRadius: 3,
              backgroundColor: t.accentPressed,
              transitionProperty: "width",
              transitionDuration: ringFillMs(reduced),
              transitionTimingFunction: EASE_OUT,
            }}
          />
        </View>
        {doses.map((d) => (
          <TimelineStop
            key={d.id}
            slot={d.slot}
            status={d.status}
            sub={
              d.status === "taken"
                ? `Taken ${d.takenAt}`
                : d.status === "due"
                  ? d.snoozedUntil
                    ? `Snoozed · ${d.snoozedUntil}`
                    : "Due now"
                  : d.status === "missed"
                    ? "Missed"
                    : "Later"
            }
          />
        ))}
      </Card>

      {due && !done ? (
        <NowCard
          name={due.medicine}
          time={due.time}
          instruction={due.instruction}
          look={medicines.find((m) => m.name === due.medicine)?.look}
          snoozed={Boolean(due.snoozedUntil)}
          onTake={() => {
            medicinesRepo.take(due.id);
            setJustTaken(due.id);
          }}
          onSnooze={() => medicinesRepo.snooze(due.id)}
        />
      ) : null}

      {done ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: tSpace[3.5],
            paddingVertical: tSpace[4],
            paddingHorizontal: tSpace[4.5],
            borderRadius: tRadius.xl,
            backgroundColor: t.band,
          }}
        >
          <View style={{ width: 52, height: 52, alignItems: "center", justifyContent: "center" }}>
            {reduced ? null : (
              <Animated.View
                style={[
                  { position: "absolute", inset: 0, borderRadius: 26, backgroundColor: t.accent },
                  burst,
                ]}
              />
            )}
            <Animated.View
              style={[
                {
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  backgroundColor: t.accent,
                  alignItems: "center",
                  justifyContent: "center",
                },
                popIn(reduced),
              ]}
            >
              <Icon name="check" size={22} color={t.onAccent} strokeWidth={3} />
            </Animated.View>
          </View>
          <View style={{ flex: 1 }} accessibilityLiveRegion="polite">
            <Text style={[tType.heading, { color: t.onBand }]}>
              {SLOT_WORDS[done.slot]} done · {done.takenAt}
            </Text>
            <Text style={[tType.bodyS, { color: t.onBand2 }]}>
              {next
                ? `Next: ${SLOT_WORDS[next.slot].toLowerCase()} at ${next.time}. We'll remind you.`
                : "That is all for today."}
            </Text>
          </View>
          <Press
            onPress={() => {
              medicinesRepo.undo(done.id);
              setJustTaken(null);
            }}
            accessibilityLabel={`Undo, ${SLOT_WORDS[done.slot].toLowerCase()} not taken`}
            hitSlop={4}
            style={{
              minHeight: 36,
              paddingHorizontal: tSpace[3],
              borderRadius: tRadius.pill,
              backgroundColor: t.bandGlass,
              justifyContent: "center",
            }}
          >
            <Text style={[tType.labelS, { fontSize: 13, color: t.onBandAccent }]}>Undo</Text>
          </Press>
        </View>
      ) : null}

      <Card radius={tRadius.panel} padding={tSpace[4]}>
        <View
          style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
        >
          <Text accessibilityRole="header" style={[tType.label, { fontSize: 15, color: t.ink }]}>
            This week
          </Text>
          <Text style={[tType.caption, { color: t.accentText }]}>
            {weekTaken} of {week.length * total} doses
          </Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          {week.map((n, i) => {
            const today = i === week.length - 1;
            return (
              <View
                key={i}
                accessible
                accessibilityLabel={`${today ? "Today" : days[i].name}, ${n} of ${total} taken`}
                style={{ alignItems: "center", gap: 5 }}
              >
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: today
                      ? t.surface
                      : n >= total
                        ? t.accent
                        : n > 0
                          ? t.accentSoft
                          : t.surface2,
                    borderWidth: today ? 2 : 0,
                    borderColor: t.ink,
                  }}
                >
                  <Text
                    style={[
                      tType.micro,
                      { fontFamily: tFont.bold, color: today ? t.ink : t.onAccent },
                    ]}
                  >
                    {n}
                  </Text>
                </View>
                <Text
                  style={[
                    tType.micro,
                    { fontFamily: tFont.semibold, color: today ? t.ink : t.ink3 },
                  ]}
                >
                  {days[i].letter}
                </Text>
              </View>
            );
          })}
        </View>
      </Card>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginTop: tSpace[1],
        }}
      >
        <Text accessibilityRole="header" style={[tType.section, { color: t.ink }]}>
          My medicines
        </Text>
        <Text style={[tType.labelS, { fontSize: 13, color: t.ink3 }]}>
          {medicines.length} active
        </Text>
      </View>
      {medicines.map((m) => (
        <MedicineCard key={m.id} m={m} onRefill={() => router.push("/care/chat")} />
      ))}
      <Text
        style={[tType.bodyS, { fontSize: 12, lineHeight: 17, color: t.ink3, textAlign: "center" }]}
      >
        Doses follow your prescription. Names illustrative; dosing shown only after CSO sign-off.
      </Text>
    </Screen>
  );
}

const stopColours = (t: Tide, status: "taken" | "due" | "later" | "missed") =>
  ({
    taken: { bg: t.accentPressed, fg: t.surface, sub: t.accentText },
    due: { bg: t.surface, fg: t.ink, sub: t.ink },
    later: { bg: t.surface2, fg: t.ink4, sub: t.ink4 },
    missed: { bg: t.surface2, fg: t.ink2, sub: t.ink2 },
  })[status];

function TimelineStop({
  slot,
  status,
  sub,
}: {
  slot: DoseSlot;
  status: "taken" | "due" | "later" | "missed";
  sub: string;
}) {
  const t = useTide();
  const reduced = useReducedMotion();
  const c = stopColours(t, status);
  return (
    <View
      accessible
      accessibilityLabel={`${SLOT_WORDS[slot]}: ${sub}`}
      style={{ flex: 1, alignItems: "center", gap: tSpace[1.5] }}
    >
      <Animated.View
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: c.bg,
          borderWidth: status === "due" ? 3 : 0,
          borderColor: t.accent,
          boxShadow: status === "due" ? `0px 0px 0px 6px ${t.accentTint}` : undefined,
          transitionProperty: "backgroundColor",
          transitionDuration: reduced ? 0 : 300,
        }}
      >
        <Icon
          name={status === "taken" ? "check" : SLOT_ICONS[slot]}
          size={22}
          color={c.fg}
          strokeWidth={status === "taken" ? 3 : 1.8}
        />
      </Animated.View>
      <Text style={[tType.labelS, { fontFamily: tFont.bold, fontSize: 13, color: t.ink }]}>
        {SLOT_WORDS[slot]}
      </Text>
      <Text style={[tType.micro, { fontFamily: tFont.semibold, color: c.sub }]}>{sub}</Text>
    </View>
  );
}

/** The teal Now card, with its two pill drawings floating (`motion.bob`, still under reduce motion). */
function NowCard({
  name,
  time,
  instruction,
  look,
  snoozed,
  onTake,
  onSnooze,
}: {
  name: string;
  time: string;
  instruction: string;
  look?: Medicine["look"];
  snoozed: boolean;
  onTake: () => void;
  onSnooze: () => void;
}) {
  const t = useTide();
  const reduced = useReducedMotion();
  const light = look ? (look.shape === "capsule" ? look.left : look.color) : t.surface;
  return (
    <View
      style={{
        overflow: "hidden",
        borderRadius: tRadius.xl,
        padding: tSpace[4.5],
        backgroundColor: t.accent,
        gap: tSpace[3.5],
      }}
    >
      <Animated.View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{ position: "absolute", right: 18, top: 18, ...motion.bob(3000, 0, reduced) }}
      >
        {look?.shape === "capsule" ? (
          <Capsule left={look.left} right={look.right} width={64} rotate={-30} />
        ) : null}
      </Animated.View>
      <Animated.View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{ position: "absolute", right: 70, top: 64, ...motion.bob(3400, 400, reduced) }}
      >
        <Tablet color={light} size={26} />
      </Animated.View>
      <Pill label={`Now · ${time}`} dot={t.onAccent} bg={t.accentSoft} fg={t.onAccent} />
      <View style={{ gap: 2 }}>
        <Text
          style={{
            fontFamily: tFont.bold,
            fontSize: 26,
            lineHeight: 30,
            letterSpacing: -0.5,
            color: t.onAccent,
          }}
        >
          {name}
        </Text>
        <Text style={[tType.bodyM, { fontSize: 14, color: t.onAccent }]}>{instruction}</Text>
      </View>
      <View style={{ flexDirection: "row", gap: tSpace[2] }}>
        <Button label="I took it" icon="check" onPress={onTake} style={{ flex: 1 }} />
        <Press
          onPress={onSnooze}
          disabled={snoozed}
          accessibilityLabel={snoozed ? "Snoozed" : "Remind me in 15 minutes"}
          style={{
            minHeight: 52,
            paddingHorizontal: tSpace[4],
            borderRadius: tRadius.pill,
            backgroundColor: t.accentSoft,
            justifyContent: "center",
          }}
        >
          <Text style={[tType.labelS, { color: t.onAccent }]}>
            {snoozed ? "Snoozed" : "In 15 min"}
          </Text>
        </Press>
      </View>
    </View>
  );
}

function MedicineCard({ m, onRefill }: { m: Medicine; onRefill: () => void }) {
  const t = useTide();
  const low = m.daysLeft <= LOW_SUPPLY_DAYS;
  return (
    <Card style={{ flexDirection: "row", alignItems: "center", gap: tSpace[3.5] }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: tRadius.row,
          backgroundColor: t.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {m.look.shape === "capsule" ? (
          <Capsule left={m.look.left} right={m.look.right} />
        ) : (
          <Tablet color={m.look.color} />
        )}
      </View>
      <View style={{ flex: 1, gap: tSpace[1], minWidth: 0 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            gap: tSpace[2],
          }}
        >
          <Text
            style={[
              tType.label,
              { fontFamily: tFont.bold, fontSize: 15, color: t.ink, flexShrink: 1 },
            ]}
          >
            {m.name}
          </Text>
          {low ? <Button label="Ask for refill" size="sm" onPress={onRefill} /> : null}
        </View>
        <Text style={[tType.bodyS, { fontSize: 12, color: t.ink2 }]}>
          {m.forWhat} · {m.when}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[2] }}>
          <ProgressBar value={m.supply} color={low ? t.caution.text : t.accentPressed} />
          <Text
            style={[
              tType.micro,
              { fontFamily: tFont.semibold, color: low ? t.caution.text : t.ink2 },
            ]}
          >
            {low ? `Running low · ${m.daysLeft} days left` : `${m.daysLeft} days left`}
          </Text>
        </View>
      </View>
    </Card>
  );
}
