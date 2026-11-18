import type { IconName } from "@/components/tide";
import type { BookGlance } from "@/data/visits";
import type { AppointmentReason, HouseholdMember } from "@/lib/booking";
import type { Anim } from "@/motion/presets";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Text, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { Avatar, Card, Icon, IconDisc, Press, Screen } from "@/components/tide";
import { loadBookGlance } from "@/data/visits";
import { HeaderAvatar } from "@/features/v2/header-avatar";
import { PLANNED_GROUPS } from "@/features/visits/book-reasons";
import { HospitalPicker } from "@/features/visits/hospital-picker";
import { shortDayOf } from "@/features/visits/logic";
import { HONEST } from "@/features/visits/parts";
import { PlannedReasons, WrongAreas } from "@/features/visits/why-coming";
import { fetchHousehold } from "@/lib/booking";
import { useSession } from "@/lib/session";
import { EASE_OUT, fade } from "@/motion/presets";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

/**
 * Book a visit (board TBook, PRD F-09; "two doors", owner 19 Oct 2026; one question at a time since the
 * owner's approved prototype of 18 Nov 2026): who, why, how.
 *
 * The page asks one thing at a time. A rail at the top holds the answers so far and goes back to any of them;
 * tapping an answer moves on, so there is no Next button. Who starts as Me, so most people begin at Why.
 *
 * Who: me, or someone this account books for (`fetchHousehold`, real); the plus opens the household screen to
 * add one. Why: two doors. "Something is wrong" shows the symptom checker's own body areas and opens it on the
 * one tapped, so a new problem is described before any booking and the checker suggests the door (or Help).
 * "Planned care" lists every other Appendix A reason in plain words, grouped, none built around one condition
 * (`PLANNED_GROUPS`). How: come today (joins the line) or ask for a day, two equal cards with the real glance
 * on each. No count of people in line (ADR 0084 §5). Without a hospital the patient chooses one first, here.
 */

export default function BookScreen() {
  return <BookView />;
}

/** `why` is the two doors; `planned` and `wrong` are what is behind each. */
type Step = "who" | "why" | "planned" | "wrong" | "how";

const REASON_LABEL = new Map<AppointmentReason, string>(
  PLANNED_GROUPS.flatMap((g) => g.reasons.map((r) => [r.reason, r.label] as const)),
);

const DOORS: readonly { key: "wrong" | "planned"; label: string; sub: string; icon: IconName }[] = [
  {
    key: "wrong",
    label: "Something is wrong",
    sub: "I feel unwell, or something is new or worse",
    icon: "activity",
  },
  {
    key: "planned",
    label: "Planned care",
    sub: "A check, a refill, results, pregnancy, a child",
    icon: "calendar",
  },
];

/**
 * `tab`: patient app v2 shows this same screen as the Book place under the nav
 * (`(tabs)/booking.tsx`): no Back, the avatar in the header, and room for the nav. Nothing else differs.
 */
export function BookView({ tab = false }: { tab?: boolean }) {
  const t = useTide();
  const router = useRouter();
  const reduced = useReducedMotion();
  const { session } = useSession();
  const fullName = session?.user.user_metadata?.full_name;
  const me = typeof fullName === "string" && fullName.trim() ? fullName : "Me";

  const [step, setStep] = useState<Step>("why");
  const [who, setWho] = useState<HouseholdMember | null>(null);
  const [reason, setReason] = useState<AppointmentReason | null>(null);
  const [household, setHousehold] = useState<HouseholdMember[]>([]);
  const [glance, setGlance] = useState<BookGlance | null>(null);

  // On focus (a person added on the household screen shows when they come
  // back), and again once a hospital is chosen below.
  const load = useCallback(() => {
    fetchHousehold().then(setHousehold, () => setHousehold([]));
    loadBookGlance().then(setGlance, () => setGlance(null));
  }, []);
  useFocusEffect(load);

  const params = {
    ...(reason ? { reason } : {}),
    ...(who ? { member: who.provisionalPatientId, memberName: who.label } : {}),
  };
  const go = (to: "/book/today" | "/book/day") => router.push({ pathname: to, params });
  // Joining today's line is for the account holder only: the intake has no
  // "on behalf of" (pt-declare-intake), unlike asking for a day.
  const todayOff = who !== null;
  const helpInPage = step === "wrong";
  const inWhy = step === "why" || step === "planned" || step === "wrong";

  const pickWho = (m: HouseholdMember | null) => {
    setWho(m);
    setStep(reason ? "how" : "why");
  };

  const whoChip = (
    label: string,
    initials: string,
    on: boolean,
    onPress: () => void,
    place = false,
  ) => {
    // The chosen chip is the primary, near-white in the dark scheme: the tinted avatar washes out on it,
    // so there the initials take the primary's own ink.
    const onLight = on && t.scheme === "dark";
    return (
      <Press
        key={label}
        onPress={onPress}
        accessibilityState={{ selected: on }}
        accessibilityLabel={label}
        style={{
          minHeight: 48,
          paddingLeft: 6,
          paddingRight: tSpace[3.5],
          borderRadius: tRadius.pill,
          flexDirection: "row",
          alignItems: "center",
          gap: tSpace[2],
          backgroundColor: on ? t.primary : t.surface,
          borderWidth: on ? 0 : 1,
          borderColor: t.lineStrong,
        }}
      >
        <Avatar
          initials={initials}
          size={36}
          bg={onLight ? `${t.onPrimary}1F` : place ? t.place.tint : t.info.tint}
          fg={onLight ? t.onPrimary : place ? t.place.text : t.info.text}
        />
        <Text style={[tType.labelS, { color: on ? t.onPrimary : t.ink }]}>{label}</Text>
      </Press>
    );
  };

  // The rail: the three questions, each with its answer so far. Tap one to go back and change it.
  const rail = (
    <View accessibilityRole="tablist" style={{ flexDirection: "row", gap: tSpace[2] }}>
      <RailStep
        name="Who"
        value={who ? who.label : "Me"}
        state={step === "who" ? "now" : "done"}
        onPress={() => setStep("who")}
      />
      <RailStep
        name="Why"
        value={
          step === "planned"
            ? "Planned care"
            : step === "wrong"
              ? "Something is wrong"
              : ((reason ? REASON_LABEL.get(reason) : null) ?? "Choose")
        }
        state={inWhy ? "now" : reason ? "done" : "next"}
        onPress={() => setStep("why")}
      />
      <RailStep
        name="How"
        value={step === "how" ? "Choose" : ""}
        state={step === "how" ? "now" : "next"}
        // How opens once there is a reason to carry to it.
        onPress={reason ? () => setStep("how") : undefined}
      />
    </View>
  );

  const panel = ((): ReactNode => {
    if (step === "who")
      return (
        <>
          <Question>Who is this visit for?</Question>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tSpace[2] }}>
            {whoChip("Me", initialsOf(me), who === null, () => pickWho(null))}
            {household.map((m) =>
              whoChip(m.label, initialsOf(m.label), who?.id === m.id, () => pickWho(m), true),
            )}
            <Press
              onPress={() => router.push("/household")}
              accessibilityLabel="Add someone"
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: t.surface,
                borderWidth: 1,
                borderColor: t.lineStrong,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="plus" size={20} color={t.ink} />
            </Press>
          </View>
        </>
      );

    if (step === "why")
      return (
        <>
          <Question>Why are you coming?</Question>
          <View style={{ gap: tSpace[2.5] }}>
            {DOORS.map((d) => (
              <Card
                key={d.key}
                onPress={() => setStep(d.key)}
                accessibilityLabel={`${d.label}. ${d.sub}`}
                padding={tSpace[4]}
                style={{ flexDirection: "row", alignItems: "center", gap: tSpace[3] }}
              >
                <IconDisc name={d.icon} size={48} color={t.ink} bg={t.surface3} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[tType.heading, { color: t.ink }]}>{d.label}</Text>
                  <Text style={[tType.bodyS, { color: t.ink2 }]}>{d.sub}</Text>
                </View>
                <Icon name="forward" size={20} color={t.ink3} />
              </Card>
            ))}
          </View>
        </>
      );

    if (step === "planned")
      return (
        <>
          <Question>Planned care</Question>
          <PlannedReasons
            reason={reason}
            onReason={(r) => {
              setReason(r);
              setStep("how");
            }}
            hints="all"
            mark="go"
          />
        </>
      );

    if (step === "wrong")
      return (
        <>
          <Question>Something is wrong</Question>
          <WrongAreas
            onSymptoms={(area) =>
              router.push(area ? { pathname: "/symptoms", params: { area } } : "/symptoms")
            }
          />
        </>
      );

    return (
      <>
        <Question>How do you want to come?</Question>
        <View style={{ gap: tSpace[2.5] }}>
          <WayCard
            title="Come to the hospital today"
            line={
              todayOff
                ? "Coming today is for your own visit for now. Ask for a day for someone else."
                : HONEST
            }
            status={
              glance?.openNow === true
                ? "Open now"
                : glance?.openNow === false
                  ? "No clinic takes walk-ins now"
                  : "Today"
            }
            dot={t.accent}
            disabled={todayOff}
            onPress={() => go("/book/today")}
          />
          <WayCard
            title="Ask for a day"
            line="Pick an open clinic day. The clinic confirms it."
            status={
              glance?.nextDayKey
                ? `Next open day: ${shortDayOf(glance.nextDayKey)}`
                : "Pick an open day"
            }
            dot={t.area.visits}
            onPress={() => go("/book/day")}
          />
        </View>
      </>
    );
  })();

  // Each answer brings the next question in from the side it is going to.
  const enter: Anim = reduced
    ? fade()
    : {
        animationName: {
          from: { opacity: 0, transform: [{ translateX: 24 }] },
          to: { opacity: 1, transform: [{ translateX: 0 }] },
        },
        animationDuration: 250,
        animationTimingFunction: EASE_OUT,
        animationFillMode: "both",
      };

  return (
    <Screen
      back={tab ? undefined : { label: "Back" }}
      overline={tab ? undefined : "Visits"}
      overlineColor={t.area.visits}
      title="Book a visit"
      underNav={tab}
      headerRight={tab ? <HeaderAvatar /> : undefined}
      // The "Something is wrong" card draws its own red Help, so the header one steps aside (law L6 still holds).
      help={helpInPage ? "none" : "round"}
      helpSource="book"
    >
      {glance?.hasHospital === false ? <HospitalPicker onChosen={load} /> : null}
      {rail}
      <Animated.View key={step} style={[{ gap: tSpace[3] }, enter]}>
        {panel}
      </Animated.View>

      {helpInPage ? null : (
        <Text
          style={[tType.caption, { fontFamily: tFont.medium, color: t.ink3, textAlign: "center" }]}
        >
          Very unwell right now? Do not book. Press the red Help button.
        </Text>
      )}
    </Screen>
  );
}

/** The question in front: one per page, the heading of what is asked now. */
function Question({ children }: { children: string }) {
  const t = useTide();
  return (
    <Text accessibilityRole="header" style={[tType.section, { color: t.ink }]}>
      {children}
    </Text>
  );
}

/**
 * One of the rail's three places. `now` is the question in front (the primary), `done` an answer that can be
 * changed, `next` one not reached yet. The state is said in the label too, never by the fill alone.
 */
function RailStep({
  name,
  value,
  state,
  onPress,
}: {
  name: string;
  value: string;
  state: "now" | "done" | "next";
  onPress?: () => void;
}) {
  const t = useTide();
  const now = state === "now";
  const fg = now ? t.onPrimary : state === "done" ? t.ink : t.ink3;
  return (
    <Press
      onPress={onPress}
      disabled={!onPress}
      haptic={false}
      accessibilityRole="tab"
      accessibilityState={{ selected: now }}
      accessibilityLabel={
        state === "done" ? `${name}: ${value}. Change` : value ? `${name}: ${value}` : name
      }
      style={{
        flex: 1,
        minHeight: 56,
        paddingHorizontal: tSpace[3],
        paddingVertical: tSpace[2],
        borderRadius: tRadius.field,
        justifyContent: "center",
        gap: 2,
        backgroundColor: now ? t.primary : state === "done" ? t.surface : t.surface3,
        boxShadow: state === "done" ? t.shadow.card : undefined,
      }}
    >
      <Text style={[tType.micro, { fontFamily: tFont.bold, letterSpacing: 0.8, color: fg }]}>
        {name.toUpperCase()}
      </Text>
      {value ? (
        <Text numberOfLines={1} style={[tType.labelS, { color: fg }]}>
          {value}
        </Text>
      ) : null}
    </Press>
  );
}

/** One way to come: what is true of it right now, its name, and one line. Both ways weigh the same. */
function WayCard({
  title,
  line,
  status,
  dot,
  disabled = false,
  onPress,
}: {
  title: string;
  line: string;
  status: string;
  /** The dot beside the status words: a place colour, never the meaning on its own. */
  dot: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const t = useTide();
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={`${title}. ${status}. ${line}`}
      style={{
        borderRadius: tRadius.panel,
        padding: tSpace[4],
        gap: tSpace[2],
        backgroundColor: t.surface,
        boxShadow: t.shadow.card,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: tSpace[1.5],
            minHeight: 26,
            paddingHorizontal: tSpace[2.5],
            borderRadius: tRadius.pill,
            backgroundColor: t.surface2,
            flexShrink: 1,
          }}
        >
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot }} />
          <Text numberOfLines={1} style={[tType.caption, { color: t.ink }]}>
            {status}
          </Text>
        </View>
        <Icon name="arrowRight" size={22} color={t.ink3} />
      </View>
      <Text style={[tType.section, { color: t.ink }]}>{title}</Text>
      <Text style={[tType.bodyM, { fontSize: 14, color: t.ink2 }]}>{line}</Text>
    </Press>
  );
}

function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w));
  return (
    words
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join("") || "ME"
  );
}
