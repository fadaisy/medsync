import type { DayMood } from "@/data/mood";
import type { SaveResult } from "@/offline/outbox";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Text, View } from "react-native";

import {
  Avatar,
  Button,
  Cascade,
  CascadeStep,
  cascadeTone,
  Icon,
  MoodFace,
  Pill,
  Press,
  Screen,
  SectionHead,
  Segments,
  SkeletonCard,
  Toast,
} from "@/components/tide";
import { DAY_GOAL, GLASSES, useActivity } from "@/data/activity";
import { STEP_AIM, stepsOn } from "@/data/exercise";
import { useHealthLog } from "@/data/health-log";
import { dayTotals, mealsOn } from "@/data/meals";
import { medicinesRepo, SLOT_WORDS, useMedicines } from "@/data/medicines";
import { moodRepo, useMood } from "@/data/mood";
import { useNotifications } from "@/data/notifications";
import { useReadings, whenWords } from "@/data/readings";
import { takeFreshSignup } from "@/data/signup";
import { usePhoneSteps } from "@/features/care-more/use-steps";
import { Doctors } from "@/features/home/doctors";
import { ActiveShareBanner, useShareBannerShown } from "@/features/location-share/active-banner";
import { sinceBoot, track } from "@/lib/analytics";
import { fetchMyAvatarUrl } from "@/lib/booking";
import { flag } from "@/lib/flags";
import { checkReading, readingValueText } from "@/lib/readings";
import { useSession } from "@/lib/session";
import { useNow } from "@/lib/use-now";
import { savedLine, startOutbox } from "@/offline/outbox";
import { useTide } from "@/theme/theme";
import { tRadius, tSpace, tType } from "@/theme/tide";

const MOODS: { key: DayMood; label: string }[] = [
  { key: "good", label: "Good" },
  { key: "okay", label: "Okay" },
  { key: "low", label: "Not well" },
];

const KIND_WORDS = { bp: "Blood pressure", sugar: "Blood sugar", weight: "Weight", pulse: "Pulse" };

/**
 * Home, your day (F-02). The greeting, today's mood, the day cascade built
 * from the patient's own log (doses taken today, the latest reading, the dose
 * due now on top, today's steps and Move minutes against their common goals, today's meals) and "See a doctor". A patient with nothing logged yet gets
 * one calm card that starts them off. Home also starts the outbox, so saves
 * made offline send once the phone is back.
 */
export default function HomeScreen() {
  const t = useTide();
  const router = useRouter();
  const now = useNow();
  const { session } = useSession();
  const med = useMedicines(now);
  const act = useActivity(now);
  const log = useHealthLog();
  // ponytail: a second counter while Move and eat is open too; each writes only a day's growth, so at worst an extra row.
  const phoneSteps = usePhoneSteps(log.rows, now);
  const { readings, loading: readingsLoading, error: readingsError, retry } = useReadings();
  const { unread } = useNotifications();
  const shareShown = useShareBannerShown();
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Straight after sign-up, once: the details the welcome screen promised.
  useEffect(() => {
    if (takeFreshSignup()) router.push({ pathname: "/profile/details", params: { welcome: "1" } });
  }, [router]);

  useEffect(() => {
    track("home_rendered", { ms: sinceBoot() });
    startOutbox();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const showToast = (next: { text: string; undo?: () => void }) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(next);
    timer.current = setTimeout(() => setToast(null), 4000);
  };

  const fullName: unknown = session?.user.user_metadata?.full_name;
  const first =
    typeof fullName === "string" && fullName.trim() ? fullName.trim().split(/\s+/)[0] : "there";
  const initials = first === "there" ? "·" : first.slice(0, 2).toUpperCase();
  // The photo the patient set on Me, read again whenever Home comes back into view.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      void fetchMyAvatarUrl().then(setAvatarUrl, () => {});
    }, []),
  );

  const { doses, dueNow } = med;
  const due = dueNow[0];
  const takenToday = doses.filter((d) => d.status === "taken");
  const next = doses.find((d) => d.status === "later");
  const latest = readings[0];
  const loading = (med.loading || readingsLoading || act.loading) && !doses.length && !latest;
  const failed = (med.error || readingsError) && !doses.length && !latest;
  const meals = mealsOn(log.rows, now);
  const eaten = dayTotals(meals);
  const firstRun =
    !loading &&
    !failed &&
    !med.medicines.length &&
    !readings.length &&
    !act.minutesToday &&
    !act.water &&
    !meals.length;
  const moved = act.minutesToday;
  // As on Move: the phone's count, or the day's saved total if that is higher.
  const stepsToday =
    phoneSteps.status === "on" ? Math.max(phoneSteps.today, stepsOn(log.rows, [now])[0]) : null;
  const minutesLine = !moved
    ? "No active minutes logged yet today"
    : moved >= DAY_GOAL
      ? "Today's active minutes goal reached"
      : `${moved} of ${DAY_GOAL} active minutes today`;

  const steps = [
    ...takenToday.slice(-2).map((d) => ({
      key: d.id,
      icon: "pill" as const,
      title: `${SLOT_WORDS[d.slot]} medicine · ${d.medicine}`,
      line: `${d.takenAt} · taken`,
      done: true,
      href: "/care/medicines" as const,
    })),
    ...(latest
      ? [
          {
            key: latest.id,
            icon: "activity" as const,
            title: `${KIND_WORDS[latest.input.kind]} · ${readingValueText(latest.input)}`,
            line: `${whenWords(latest.at, now)} · ${readingWord(latest.input)}`,
            done: false,
            href: "/care/trends" as const,
          },
        ]
      : []),
    {
      key: "move",
      icon: "walk" as const,
      title:
        stepsToday !== null
          ? `Move · ${stepsToday.toLocaleString("en-GB")} of ${STEP_AIM.toLocaleString("en-GB")} steps`
          : `Move · ${moved} of ${DAY_GOAL} minutes`,
      line:
        stepsToday !== null
          ? minutesLine
          : !moved
            ? "Nothing logged yet today"
            : moved >= DAY_GOAL
              ? "Today's goal reached"
              : `${DAY_GOAL - moved} minutes to go today`,
      done: stepsToday !== null ? stepsToday >= STEP_AIM || moved >= DAY_GOAL : moved >= DAY_GOAL,
      href: "/care/activity" as const,
    },
    {
      key: "eat",
      icon: "utensils" as const,
      title: meals.length ? `Eat · ${eaten.kcal} kcal today` : "Eat · nothing logged yet",
      line: meals.length
        ? `${meals.length} ${meals.length === 1 ? "food" : "foods"} · ${Math.round(eaten.carbsG)} g carbs`
        : "Tap to add what you eat",
      // No calorie goal is set for anyone, so a day of meals is never "done".
      done: false,
      href: { pathname: "/care/activity", params: { tab: "eat" } } as const,
    },
    {
      key: "water",
      icon: "droplet" as const,
      title: `Water · ${act.water} of ${GLASSES} glasses`,
      line: !act.water
        ? "Tap to log a glass"
        : act.water >= GLASSES
          ? "Today's glasses done"
          : `${GLASSES - act.water} more to go today`,
      done: act.water >= GLASSES,
      href: { pathname: "/care/activity", params: { tab: "eat" } } as const,
    },
  ];
  // Only Move, Eat and Water: nothing taken or read yet today.
  const quietDay = !takenToday.length && !latest;
  const tail = due || next || quietDay;

  const take = async (id: string) => {
    const result: SaveResult = await medicinesRepo.take(id, now);
    showToast({
      text: savedLine(result, "Saved · only you can see it"),
      undo: result === "failed" ? undefined : () => void medicinesRepo.undo(id),
    });
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen
        underNav
        help="pill"
        helpSource="home"
        bell={unread || true}
        // Room between the greeting and Today / This week.
        contentStyle={{ paddingTop: tSpace[5] }}
        header={
          <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[2.5] }}>
            <Avatar initials={initials} photoUrl={avatarUrl} size={44} />
            <View>
              <Text style={[tType.bodyS, { color: t.ink2 }]}>Hello,</Text>
              <Text style={[tType.heading, { fontSize: 18, color: t.ink }]}>{first}</Text>
            </View>
          </View>
        }
      >
        {shareShown ? <ActiveShareBanner /> : null}

        <Segments
          tone="accent"
          options={[
            { key: "today", label: "Today" },
            { key: "week", label: "This week" },
          ]}
          value="today"
          onChange={(k) => {
            if (k === "week") router.push("/visits");
          }}
        />

        <MoodCard now={now} onSaved={(text) => showToast({ text })} />

        <View style={{ gap: tSpace[3] }}>
          <SectionHead title="Here is your day" />
          {loading ? (
            <View style={{ gap: tSpace[2.5] }}>
              <SkeletonCard label="Loading your day" lines={1} />
              <SkeletonCard label="" lines={1} />
              <SkeletonCard label="" lines={1} />
            </View>
          ) : failed ? (
            <View style={{ gap: tSpace[2], alignItems: "flex-start" }}>
              <Text style={[tType.bodyM, { color: t.ink2 }]}>Couldn&apos;t load your day.</Text>
              <Button
                label="Try again"
                variant="outline"
                size="sm"
                onPress={() => {
                  med.retry();
                  retry();
                }}
              />
            </View>
          ) : firstRun ? (
            <FirstRunCard
              onMedicine={() => router.push({ pathname: "/care/medicines", params: { add: "1" } })}
              onReading={() => router.push("/care/reading")}
            />
          ) : (
            <Cascade>
              {steps.map((s, i) => (
                <CascadeStep
                  key={s.key}
                  step={cascadeTone(i)}
                  icon={s.icon}
                  title={s.title}
                  line={s.line}
                  done={s.done}
                  onPress={() => router.push(s.href)}
                  last={i === steps.length - 1 && !tail}
                />
              ))}
              {due ? (
                <NowCard
                  time={due.time}
                  title={`${SLOT_WORDS[due.slot]} medicine`}
                  line={`${due.medicine}, as your clinician prescribed`}
                  snoozed={due.snoozedUntil}
                  onTake={() => void take(due.id)}
                  onLater={() => {
                    medicinesRepo.snooze(due.id, now);
                    showToast({ text: "Snoozed for 15 minutes" });
                  }}
                />
              ) : next ? (
                <DoneCard
                  upcoming
                  title={`${SLOT_WORDS[next.slot]} medicine`}
                  line={`Next · ${next.time} · ${next.medicine}`}
                />
              ) : quietDay ? (
                <DoneCard
                  upcoming
                  title="Nothing due right now"
                  line="Log a reading from the plus below"
                />
              ) : null}
            </Cascade>
          )}
        </View>

        <Doctors />
      </Screen>
      {toast ? (
        <Toast
          text={toast.text}
          actionLabel={toast.undo ? "Undo" : undefined}
          onAction={() => {
            toast.undo?.();
            setToast(null);
          }}
        />
      ) : null}
    </View>
  );
}

/** The reading's plain word: in range, outside the target, or needs attention. Weight is never judged. */
function readingWord(input: Parameters<typeof checkReading>[0]): string {
  if (input.kind === "weight") return "saved";
  const level = checkReading(input).level;
  return level === "ok"
    ? "in your range"
    : level === "watch"
      ? "outside your target"
      : "needs attention";
}

/** Nothing logged yet: one calm card with the two ways to start. */
function FirstRunCard({
  onMedicine,
  onReading,
}: {
  onMedicine: () => void;
  onReading: () => void;
}) {
  const t = useTide();
  return (
    <View
      style={{
        borderRadius: tRadius.xl,
        padding: tSpace[4.5],
        backgroundColor: t.surface,
        gap: tSpace[3],
        boxShadow: t.shadow.card,
      }}
    >
      <Text accessibilityRole="header" style={[tType.heading, { color: t.ink }]}>
        Start your day here
      </Text>
      <Text style={[tType.bodyM, { color: t.ink2 }]}>
        Add the medicines you take, or log a reading. Your day builds up here. Only you can see what
        you log.
      </Text>
      <View style={{ flexDirection: "row", gap: tSpace[2], flexWrap: "wrap" }}>
        <Button label="Add a medicine" icon="pill" onPress={onMedicine} style={{ flexGrow: 1 }} />
        <Button
          label="Log a reading"
          icon="activity"
          variant="outline"
          onPress={onReading}
          style={{ flexGrow: 1 }}
        />
      </View>
    </View>
  );
}

/**
 * "How are you today?": three faces, then the week strip. A not-well day
 * offers "Tell my team" while chat is on; until there is a clinician inbox
 * (`mobileChat` off) it offers "Book a visit", and Help is always in the header.
 */
function MoodCard({ now, onSaved }: { now: Date; onSaved: (text: string) => void }) {
  const t = useTide();
  const router = useRouter();
  const { today, week } = useMood(now);
  const chat = flag("mobileChat");
  const pick = async (mood: DayMood) => {
    const result = await moodRepo.pick(mood);
    if (result !== "sent") onSaved(savedLine(result));
  };
  return (
    <View
      style={{
        borderRadius: tRadius.cardLg,
        padding: tSpace[4],
        backgroundColor: t.surface,
        gap: tSpace[3],
        boxShadow: t.shadow.card,
      }}
    >
      <Text accessibilityRole="header" style={[tType.heading, { color: t.ink }]}>
        How are you today?
      </Text>
      <View style={{ flexDirection: "row", gap: tSpace[2] }}>
        {MOODS.map((m) => {
          const on = today === m.key;
          return (
            <Press
              key={m.key}
              onPress={() => void pick(m.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Today I feel ${m.label}`}
              style={{
                flex: 1,
                minHeight: 92,
                borderRadius: tRadius.card,
                alignItems: "center",
                justifyContent: "center",
                gap: tSpace[1.5],
                backgroundColor: on ? t.accentTint : t.surface2,
                borderWidth: 2,
                borderColor: on ? t.accent : "transparent",
              }}
            >
              <MoodFace mood={m.key} size={44} pop={on} />
              <Text style={[tType.caption, { fontSize: 13, color: on ? t.accentText : t.ink2 }]}>
                {m.label}
              </Text>
            </Press>
          );
        })}
      </View>
      {today ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[2] }}>
          <Press
            onPress={() => router.push("/mood")}
            accessibilityLabel="This week's moods. See all."
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              gap: tSpace[1.5],
              minHeight: 44,
            }}
          >
            <Text style={[tType.caption, { color: t.ink3 }]}>This week</Text>
            {week.map((m, i) => (
              <MoodFace key={i} mood={m} size={20} />
            ))}
          </Press>
          {today === "low" ? (
            <Press
              onPress={() => router.push(chat ? "/care/chat" : "/book")}
              accessibilityLabel={chat ? "Tell my team" : "Book a visit"}
              style={{ minHeight: 44, justifyContent: "center" }}
            >
              <View
                style={{
                  height: 30,
                  paddingHorizontal: tSpace[3],
                  borderRadius: tRadius.pill,
                  backgroundColor: t.accentTint,
                  justifyContent: "center",
                }}
              >
                <Text style={[tType.labelS, { fontSize: 13, color: t.accentText }]}>
                  {chat ? "Tell my team" : "Book a visit"}
                </Text>
              </View>
            </Press>
          ) : (
            <Press
              onPress={() => router.push("/mood")}
              style={{ minHeight: 44, justifyContent: "center" }}
              accessibilityRole="link"
            >
              <Text style={[tType.labelS, { color: t.accentText }]}>See all</Text>
            </Press>
          )}
        </View>
      ) : null}
    </View>
  );
}

/** The teal card for the dose due now: the one decision the day asks for. */
function NowCard({
  time,
  title,
  line,
  snoozed,
  onTake,
  onLater,
}: {
  time: string;
  title: string;
  line: string;
  snoozed: string | null;
  onTake: () => void;
  onLater: () => void;
}) {
  const t = useTide();
  return (
    <View
      style={{
        borderRadius: tRadius.xl,
        padding: tSpace[4.5],
        backgroundColor: t.accent,
        gap: tSpace[2],
        boxShadow: t.shadow.accent,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Pill
          label={snoozed ? `Snoozed · ${snoozed}` : `Now · ${time}`}
          bg={t.surface}
          fg={t.ink}
        />
        <Text style={[tType.overline, { color: t.onAccent }]}>Medicines</Text>
      </View>
      <Text style={[tType.title, { fontSize: 22, lineHeight: 28, color: t.onAccent }]}>
        {title}
      </Text>
      <Text style={[tType.bodyM, { color: t.onAccent }]}>{line}</Text>
      <View style={{ flexDirection: "row", gap: tSpace[2], marginTop: tSpace[1] }}>
        <Button label="I took it" icon="check" onPress={onTake} style={{ flex: 1 }} />
        <Button label="Not yet" variant="outline" onPress={onLater} />
      </View>
    </View>
  );
}

/** The last card of the day: a dose just taken, or (`upcoming`) the next one, quietly. */
function DoneCard({
  title,
  line,
  upcoming = false,
}: {
  title: string;
  line: string;
  upcoming?: boolean;
}) {
  const t = useTide();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: tSpace[3],
        borderRadius: tRadius.xl,
        padding: tSpace[4.5],
        backgroundColor: upcoming ? t.surface : t.accentTint,
        boxShadow: upcoming ? t.shadow.card : undefined,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: upcoming ? t.surface2 : t.accent,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon
          name={upcoming ? "clock" : "check"}
          size={18}
          color={upcoming ? t.area.medicines : t.onAccent}
          strokeWidth={upcoming ? 2 : 2.8}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[tType.heading, { color: t.ink }]}>{title}</Text>
        <Text style={[tType.bodyM, { fontSize: 14, color: upcoming ? t.ink2 : t.accentText }]}>
          {line}
        </Text>
      </View>
    </View>
  );
}
