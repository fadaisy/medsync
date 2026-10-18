import type { Activity, Effort } from "@/data/exercise";
import { useState } from "react";
import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";

import {
  Band,
  Button,
  Card,
  Chip,
  Icon,
  IconDisc,
  Ring,
  Segments,
  Sheet,
  Stepper,
} from "@/components/tide";
import {
  activityRepo,
  DAY_GOAL,
  SAFETY_SIGNS,
  SAFETY_STEPS,
  useActivity,
  WEEK_GOAL,
} from "@/data/activity";
import {
  ACTIVITIES,
  costOf,
  exercisesOn,
  exerciseUnit,
  hasEffort,
  kcalFor,
  STEP_AIM,
  stepsOn,
} from "@/data/exercise";
import { useHealthLog } from "@/data/health-log";
import { useReadings } from "@/data/readings";
import { usePhoneSteps } from "@/features/care-more/use-steps";
import { lastSevenDays } from "@/features/care/logic";
import { track } from "@/lib/analytics";
import { useNow } from "@/lib/use-now";
import { savedLine } from "@/offline/outbox";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

const EFFORTS: { key: Effort; label: string }[] = [
  { key: "easy", label: "Easy" },
  { key: "moderate", label: "Moderate" },
  { key: "hard", label: "Hard" },
];

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Move (F-18, ADR 0354): steps from the phone, activities timed live or logged
 * after, about how much energy each used, and the week. What the patient
 * logs is theirs and their care team's (migration 0174). The safety card is
 * unchanged.
 */
export function MovePanel({ now, onToast }: { now: Date; onToast: (text: string) => void }) {
  const t = useTide();
  const router = useRouter();
  const act = useActivity(now);
  const log = useHealthLog();
  const { readings } = useReadings();
  const steps = usePhoneSteps(log.rows, now);
  const [sheet, setSheet] = useState<"live" | "log" | null>(null);
  const [view, setView] = useState<"steps" | "minutes">("steps");

  const days = lastSevenDays(now);
  const weekMinutes = act.weekMinutes;
  const weekTotal = weekMinutes.reduce((a, b) => a + b, 0);
  const weekSteps = stepsOn(log.rows, act.days);
  const today = exercisesOn(log.rows, now);
  const kcalToday = today.reduce((n, e) => n + (e.kcal ?? 0), 0);
  const weightKg = readings.find((r) => r.input.kind === "weight")?.input;
  const kg = weightKg && weightKg.kind === "weight" ? weightKg.value : null;
  const stepsToday =
    steps.status === "on" ? Math.max(steps.today, weekSteps[weekSteps.length - 1] ?? 0) : null;

  const bars = view === "steps" ? weekSteps : weekMinutes;
  const goal = view === "steps" ? STEP_AIM : DAY_GOAL;

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
          value={stepsToday !== null ? stepsToday / STEP_AIM : act.minutesToday / DAY_GOAL}
          size={112}
          stroke={12}
          color={t.accent}
          track={t.bandGlass}
          accessibilityLabel={
            stepsToday !== null
              ? `${stepsToday} steps today, a common aim is ${STEP_AIM}`
              : `${act.minutesToday} of ${DAY_GOAL} active minutes today`
          }
        >
          <Icon name={stepsToday !== null ? "footprints" : "walk"} size={28} color={t.onBand} />
        </Ring>
        <View style={{ gap: tSpace[1], flex: 1 }}>
          <Text style={[tType.overline, { color: t.onBandAccent }]}>
            {stepsToday !== null ? "Steps today" : "Active today"}
          </Text>
          <Text
            style={[
              tType.title,
              {
                fontFamily: tType.numeral.fontFamily,
                fontSize: 24,
                lineHeight: 28,
                color: t.onBand,
              },
            ]}
          >
            {stepsToday !== null ? stepsToday.toLocaleString("en-GB") : `${act.minutesToday} min`}
          </Text>
          <Text style={[tType.bodyS, { color: t.onBand2 }]}>
            {`${act.minutesToday} active min${kcalToday ? ` · about ${kcalToday} kcal` : ""}`}
          </Text>
          {steps.status === "on" && steps.live ? (
            <Text style={[tType.micro, { color: t.onBand2 }]}>Counting while MedSync is open</Text>
          ) : steps.status === "off" ? (
            <Text style={[tType.micro, { color: t.onBand2 }]}>
              {steps.why === "no_permission"
                ? "Allow Motion & Fitness for MedSync to count steps"
                : "This phone has no step counter"}
            </Text>
          ) : null}
        </View>
      </Band>

      <View style={{ flexDirection: "row", gap: tSpace[2] }}>
        <Button
          label="Start an activity"
          icon="play"
          variant="accent"
          size="md"
          style={{ flex: 1 }}
          onPress={() => setSheet("live")}
        />
        <Button
          label="Log one I did"
          icon="plus"
          variant="soft"
          size="md"
          style={{ flex: 1 }}
          onPress={() => setSheet("log")}
        />
      </View>

      {today.length ? (
        <Card padding={tSpace[4]} style={{ gap: tSpace[2.5] }}>
          <Text style={[tType.label, { color: t.ink }]}>Today</Text>
          {today.map((e) => (
            <View
              key={e.id}
              style={{ flexDirection: "row", alignItems: "center", gap: tSpace[2.5] }}
            >
              <IconDisc name="activity" size={32} color={t.accentText} bg={t.accentTint} />
              <Text style={[tType.bodyM, { flex: 1, color: t.ink }]}>{e.label}</Text>
              <Text style={[tType.caption, { fontFamily: tFont.semibold, color: t.ink2 }]}>
                {`${e.minutes} min${e.kcal ? ` · ${e.kcal} kcal` : ""}`}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}

      <Card padding={tSpace[4]} style={{ gap: tSpace[3] }}>
        <Segments
          options={[
            { key: "steps", label: "Steps" },
            { key: "minutes", label: "Minutes" },
          ]}
          value={view}
          onChange={setView}
        />
        <View
          style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}
        >
          <Text style={[tType.label, { color: t.ink }]}>
            {view === "steps" ? "Steps this week" : "Active minutes this week"}
          </Text>
          <Text style={[tType.caption, { fontSize: 13, color: t.accentText }]}>
            {view === "steps"
              ? `${Math.round(weekSteps.reduce((a, b) => a + b, 0) / 7).toLocaleString("en-GB")} a day`
              : `${weekTotal} of ${WEEK_GOAL}`}
          </Text>
        </View>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`${view === "steps" ? "Steps" : "Minutes"}: ${bars
            .map((m, i) => `${i === 6 ? "today" : days[i].name} ${m}`)
            .join(", ")}.`}
          style={{ flexDirection: "row", gap: tSpace[2], height: 96, alignItems: "flex-end" }}
        >
          {bars.map((m, i) => {
            const isToday = i === bars.length - 1;
            return (
              <View key={i} style={{ flex: 1, alignItems: "center", gap: tSpace[1] }}>
                <View
                  style={{
                    alignSelf: "stretch",
                    height: Math.max(4, Math.round((Math.min(m, goal) / goal) * 76)),
                    borderRadius: 8,
                    backgroundColor: isToday ? t.accent : m >= goal ? t.primary : t.lineStrong,
                  }}
                />
                <Text
                  style={[
                    isToday ? tType.caption : tType.micro,
                    { fontSize: 11, color: isToday ? t.ink : t.ink2 },
                  ]}
                >
                  {days[i].letter}
                </Text>
              </View>
            );
          })}
        </View>
        <Text style={[tType.bodyS, { fontFamily: tType.body.fontFamily, color: t.ink2 }]}>
          {view === "steps"
            ? `A common aim is about ${STEP_AIM.toLocaleString("en-GB")} steps a day. Ask your care team what is right for you.`
            : `A common goal is ${WEEK_GOAL} minutes of brisk activity a week. Ask your care team what is right for you.`}
        </Text>
      </Card>

      <SafetyCard
        onHelp={() => {
          track("help_opened", { source: "care/activity" });
          router.push("/help");
        }}
      />

      <ActivitySheet
        mode={sheet}
        weightKg={kg}
        onClose={() => setSheet(null)}
        onSaved={(text) => {
          setSheet(null);
          onToast(text);
        }}
      />
    </View>
  );
}

/** Pick the activity and effort, then either time it live or say how long it was. */
function ActivitySheet({
  mode,
  weightKg,
  onClose,
  onSaved,
}: {
  mode: "live" | "log" | null;
  weightKg: number | null;
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const t = useTide();
  const [activity, setActivity] = useState<Activity>(ACTIVITIES[0]!);
  const [effort, setEffort] = useState<Effort>("moderate");
  const [minutes, setMinutes] = useState("30");
  // Live timing: when it started and the time banked before any pause.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [banked, setBanked] = useState(0);
  const now = useNow(1000);

  const elapsed = banked + (startedAt ? now.getTime() - startedAt : 0);
  const liveMinutes = Math.round(elapsed / 60_000);
  const mins = mode === "live" ? liveMinutes : Math.round(Number(minutes) || 0);
  const { met } = costOf(activity, effort);
  const kcal = kcalFor(met, weightKg, mins);

  const reset = () => {
    setStartedAt(null);
    setBanked(0);
    setMinutes("30");
  };
  const close = () => {
    reset();
    onClose();
  };
  const save = async () => {
    if (mins <= 0) return;
    const res = await activityRepo.logExercise(exerciseUnit(activity, effort), mins, kcal);
    reset();
    onSaved(
      savedLine(res, `Saved · ${activity.label}, ${mins} min${kcal ? `, about ${kcal} kcal` : ""}`),
    );
  };

  return (
    <Sheet
      visible={mode !== null}
      onClose={close}
      overline={mode === "live" ? "Start an activity" : "Log an activity"}
      title={mode === "live" ? "What are you doing?" : "What did you do?"}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: tSpace[1.5] }}
      >
        {ACTIVITIES.map((a) => (
          <Chip
            key={a.key}
            size="sm"
            label={a.label}
            selected={a.key === activity.key}
            onPress={() => setActivity(a)}
          />
        ))}
      </ScrollView>
      {hasEffort(activity) ? (
        <View style={{ flexDirection: "row", gap: tSpace[1.5] }}>
          {EFFORTS.map((e) => (
            <Chip
              key={e.key}
              size="sm"
              label={e.label}
              selected={effort === e.key}
              onPress={() => setEffort(e.key)}
            />
          ))}
        </View>
      ) : null}

      {mode === "live" ? (
        <View style={{ alignItems: "center", gap: tSpace[2], paddingVertical: tSpace[3] }}>
          <Icon name={activity.icon} size={30} color={t.accentText} />
          <Text
            accessibilityLiveRegion="polite"
            style={{ fontFamily: tFont.monoBold, fontSize: 48, lineHeight: 54, color: t.ink }}
          >
            {clock(elapsed)}
          </Text>
          <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.ink2 }]}>
            {kcal
              ? `About ${kcal} kcal so far`
              : weightKg
                ? "Keep going"
                : "Log your weight to see energy used"}
          </Text>
          <View style={{ flexDirection: "row", gap: tSpace[2], alignSelf: "stretch" }}>
            {startedAt ? (
              <Button
                label="Pause"
                variant="soft"
                style={{ flex: 1 }}
                onPress={() => {
                  setBanked(elapsed);
                  setStartedAt(null);
                }}
              />
            ) : (
              <Button
                label={elapsed ? "Carry on" : "Start"}
                icon="play"
                variant="accent"
                style={{ flex: 1 }}
                onPress={() => setStartedAt(Date.now())}
              />
            )}
            <Button
              label="Finish and save"
              disabled={liveMinutes < 1}
              style={{ flex: 1 }}
              onPress={() => void save()}
            />
          </View>
        </View>
      ) : (
        <View style={{ gap: tSpace[2.5] }}>
          <View style={{ flexDirection: "row" }}>
            <Stepper
              label="How long"
              unit="minutes"
              value={minutes}
              onChange={setMinutes}
              step={5}
              min={1}
              max={600}
            />
          </View>
          <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.ink2 }]}>
            {kcal
              ? `About ${kcal} kcal, from your weight and the activity`
              : "Log your weight to see about how much energy this used"}
          </Text>
          <Button label="Save activity" disabled={mins <= 0} onPress={() => void save()} />
        </View>
      )}
      <Text style={[tType.micro, { color: t.ink3, textAlign: "center" }]}>
        Energy is an estimate from the 2024 Compendium of Physical Activities.
      </Text>
    </Sheet>
  );
}

/** The amber safety card, unchanged from the walk-only Move: signs, steps, and the one red "Get help". */
function SafetyCard({ onHelp }: { onHelp: () => void }) {
  const t = useTide();
  return (
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
          <Text accessibilityRole="header" style={[tType.label, { lineHeight: 21, color: t.ink }]}>
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
            <Text style={[tType.caption, { fontSize: 13, lineHeight: 17, color: t.ink, flex: 1 }]}>
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
      <Button label="I feel this now · Get help" variant="danger" icon="phone" onPress={onHelp} />
    </View>
  );
}
