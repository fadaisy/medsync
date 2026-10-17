import type { DoctorCard } from "@/data/doctors";
import type { DayMood } from "@/data/mood";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";

import {
  Avatar,
  Button,
  Cascade,
  CascadeStep,
  Chip,
  ChipRow,
  Icon,
  MoodFace,
  Pill,
  Press,
  Screen,
  SectionHead,
  Segments,
  Toast,
} from "@/components/tide";
import { DOCTOR_FILTERS, feeWords, useDoctors } from "@/data/doctors";
import { medicinesRepo, SLOT_WORDS, useMedicines } from "@/data/medicines";
import { moodRepo, useMood } from "@/data/mood";
import { useNotifications } from "@/data/notifications";
import { useSavedReadings } from "@/data/readings";
import { sinceBoot, track } from "@/lib/analytics";
import { savedWords } from "@/lib/flags";
import { checkReading, readingValueText } from "@/lib/readings";
import { useSession } from "@/lib/session";
import { useNow } from "@/lib/use-now";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

const MOODS: { key: DayMood; label: string }[] = [
  { key: "good", label: "Good" },
  { key: "okay", label: "Okay" },
  { key: "low", label: "Not well" },
];

/**
 * Home, your day (F-02). The greeting, today's mood, the day cascade with the
 * dose due now on top, and "See a doctor". Clinical parts are demo data until
 * Gate CG (law L2), so the screen carries the ribbon.
 */
export default function HomeScreen() {
  const t = useTide();
  const router = useRouter();
  const now = useNow();
  const { session } = useSession();
  const { dueNow, doses } = useMedicines(now);
  const { unread } = useNotifications();
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    track("home_rendered", { ms: sinceBoot() });
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

  const due = dueNow[0];
  const morning = doses.find((d) => d.slot === "morning");
  const lastTaken = [...doses].reverse().find((d) => d.status === "taken" && d.slot !== "morning");
  const next = doses.find((d) => d.status === "later");

  return (
    <View style={{ flex: 1 }}>
      <Screen
        underNav
        demo
        help="pill"
        helpSource="home"
        bell={unread || true}
        header={
          <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[2.5] }}>
            <Avatar initials={initials} size={44} />
            <View>
              <Text style={[tType.bodyS, { color: t.ink2 }]}>Hello,</Text>
              <Text style={[tType.heading, { fontSize: 18, color: t.ink }]}>{first}</Text>
            </View>
          </View>
        }
      >
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

        <MoodCard onTell={() => router.push("/care/chat")} onWeek={() => router.push("/mood")} />

        <View style={{ gap: tSpace[3] }}>
          <SectionHead title="Here is your day" />
          <Cascade>
            {morning ? (
              <CascadeStep
                step={0}
                icon="pill"
                title="Morning medicine"
                line={morning.takenAt ? `${morning.takenAt} · taken` : "Not marked yet"}
                done={!!morning.takenAt}
                onPress={() => router.push("/care/medicines")}
              />
            ) : null}
            <BpStep />
            <CascadeStep
              step={2}
              icon="message"
              title="Your care team replied"
              line="09:15 · about this morning"
              onPress={() => router.push("/care/chat")}
              last={!due && !next && !lastTaken}
            />
            {due ? (
              <NowCard
                time={due.time}
                title={`${SLOT_WORDS[due.slot]} medicine`}
                line={`${due.medicine}, as your clinician prescribed`}
                snoozed={due.snoozedUntil}
                onTake={() => {
                  medicinesRepo.take(due.id, now);
                  showToast({
                    text: savedWords("it"),
                    undo: () => medicinesRepo.undo(due.id),
                  });
                }}
                onLater={() => {
                  medicinesRepo.snooze(due.id, now);
                  showToast({ text: "We will remind you in 15 minutes" });
                }}
              />
            ) : next ? (
              <DoneCard
                upcoming
                title={`${SLOT_WORDS[next.slot]} medicine`}
                line={`Next · ${next.time} · ${next.medicine}`}
              />
            ) : lastTaken ? (
              <DoneCard
                title={`${SLOT_WORDS[lastTaken.slot]} medicine`}
                line={`${lastTaken.takenAt} · taken`}
              />
            ) : null}
          </Cascade>
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

/** "How are you today?": three faces, then the week strip; a low day offers "Tell my team". */
function MoodCard({ onTell, onWeek }: { onTell: () => void; onWeek: () => void }) {
  const t = useTide();
  const { today, month } = useMood();
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
              onPress={() => moodRepo.pick(m.key)}
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
            onPress={onWeek}
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
            {month.slice(-7).map((m, i) => (
              <MoodFace key={i} mood={m} size={20} />
            ))}
          </Press>
          {today === "low" ? (
            <Press
              onPress={onTell}
              accessibilityLabel="Tell my team"
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
                  Tell my team
                </Text>
              </View>
            </Press>
          ) : (
            <Press
              onPress={onWeek}
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

/** The latest blood pressure: what the patient saved today, else the demo morning reading. */
function BpStep() {
  const router = useRouter();
  const saved = useSavedReadings().find((r) => r.input.kind === "bp");
  const input = saved?.input ?? { kind: "bp" as const, top: 138, bottom: 86 };
  const at = saved
    ? new Date(saved.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : "07:40";
  const level = checkReading(input).level;
  const word =
    level === "ok" ? "in your range" : level === "watch" ? "above your target" : "needs attention";
  return (
    <CascadeStep
      step={1}
      icon="activity"
      title={`Blood pressure · ${readingValueText(input)}`}
      line={`${at} · ${word}`}
      onPress={() => router.push("/care/trends")}
    />
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

/** "See a doctor": filters and a sideways row of doctor cards (contract in `data/doctors.ts`). */
function Doctors() {
  const router = useRouter();
  const t = useTide();
  const { doctors, ratingsOn } = useDoctors();
  const [filter, setFilter] = useState<(typeof DOCTOR_FILTERS)[number] | null>(null);
  const shown = doctors.filter((d) =>
    !filter ? true : filter === "Available now" ? d.status.kind === "now" : d.tags.includes(filter),
  );
  return (
    <View style={{ gap: tSpace[3] }}>
      <SectionHead title="See a doctor" action="See all" onAction={() => router.push("/book")} />
      <ChipRow scroll>
        {DOCTOR_FILTERS.map((f) => (
          <Chip
            key={f}
            label={f}
            size="sm"
            selected={filter === f}
            onPress={() => setFilter(filter === f ? null : f)}
          />
        ))}
      </ChipRow>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -tSpace[5], flexGrow: 0 }}
        contentContainerStyle={{
          paddingHorizontal: tSpace[5],
          paddingBottom: tSpace[2],
          gap: tSpace[3],
        }}
      >
        {shown.map((d) => (
          <DoctorTile key={d.id} d={d} ratingsOn={ratingsOn} />
        ))}
        {shown.length === 0 ? (
          <Text style={[tType.bodyM, { color: t.ink2, paddingVertical: tSpace[4] }]}>
            No doctor matches this filter today.
          </Text>
        ) : null}
      </ScrollView>
      {ratingsOn ? (
        <Text style={[tType.bodyS, { fontSize: 12, color: t.ink3 }]}>
          Ratings come only from patients after a real visit.
        </Text>
      ) : null}
    </View>
  );
}

function DoctorTile({ d, ratingsOn }: { d: DoctorCard; ratingsOn: boolean }) {
  const t = useTide();
  const router = useRouter();
  return (
    <View
      style={{
        width: 252,
        borderRadius: tRadius.cardLg,
        padding: tSpace[4],
        backgroundColor: t.surface,
        gap: tSpace[2.5],
        boxShadow: t.shadow.card,
      }}
    >
      {d.yours ? <Pill label="Your doctor" bg={t.info.tint} fg={t.info.text} /> : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[2.5] }}>
        <Avatar initials={d.initials} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={[tType.label, { color: t.ink }]} numberOfLines={1}>
            {d.name}
          </Text>
          <Text style={[tType.bodyS, { fontSize: 12, color: t.ink2 }]} numberOfLines={1}>
            {d.role} · {d.place}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[2] }}>
        {ratingsOn && d.rating ? (
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
            accessibilityLabel={`Rated ${d.rating.score} by ${d.rating.count} patients`}
          >
            <Icon name="star" size={14} color={t.ink} />
            <Text style={{ fontFamily: tFont.monoSemibold, fontSize: 13, color: t.ink }}>
              {d.rating.score}
            </Text>
            <Text style={[tType.bodyS, { fontSize: 12, color: t.ink3 }]}>({d.rating.count})</Text>
          </View>
        ) : null}
        <Text style={[tType.labelS, { fontSize: 13, color: t.ink2 }]}>{feeWords(d.fee)}</Text>
      </View>
      {d.status.kind === "now" ? (
        <>
          <View style={{ gap: 2 }}>
            <Pill label="Available now" bg={t.accentTint} fg={t.accentText} />
            <Text style={[tType.bodyS, { fontSize: 12, color: t.ink2 }]}>
              {d.status.ahead} in line · you would be #{d.status.ahead + 1}
            </Text>
          </View>
          <Button
            size="md"
            label="Join the line"
            accessibilityLabel={`Join the line for ${d.name}`}
            onPress={() => router.push({ pathname: "/book/today", params: { doctor: d.id } })}
          />
        </>
      ) : (
        <>
          <View style={{ gap: 2 }}>
            <Text style={[tType.labelS, { fontSize: 13, color: t.ink }]}>Next: {d.status.day}</Text>
            <Text style={[tType.bodyS, { fontSize: 12, color: t.ink2 }]}>{d.status.line}</Text>
          </View>
          <Button
            size="md"
            variant="outline"
            label="Ask for a day"
            accessibilityLabel={`Ask ${d.name} for a day`}
            onPress={() => router.push({ pathname: "/book/day", params: { doctor: d.id } })}
          />
        </>
      )}
    </View>
  );
}
