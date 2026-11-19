/**
 * `/dev/visit-v2?screen=home|visits|day&scheme=light|dark`: patient app v2 Visit mode on the phone (Step 4) on
 * fixtures, for screenshots. Development builds only. Invented names (prompt Appendix A); no patient data.
 *
 * `screen=home` is the whole v2 shell (finish pass 1): the header with the avatar count, Home and the nav.
 * `&visit=none|loading|failed|next|tomorrow` picks Home's visit state (today's visit by default);
 * `&place=book|visits|me` moves the nav's marker.
 *
 * `&care=none|trends|first|due|team|danger` draws Home's top card as Care mode would (home-top.tsx), on the
 * fixtures below; `&metric=sugar|weight|low|lowbp` changes the trend card's measure (blood pressure by
 * default). `first` is a patient with no reading at all ("Start logging readings"); `low` is a sugar week ending
 * on a reading the app's check calls "Too low", in the critical tone; `lowbp` is the same for blood pressure
 * (thresholds 0.3.0, pending CSO). Left out, Home is as it is with `careMode`
 * off. This calls the pure view: it does not switch the flag on.
 */
import type { VisitQuestion } from "@/data/visit-v2";
import type { AppointmentRow } from "@/lib/booking";
import type { VisitPlace } from "@/components/tide/v2-shell";
import type { HomeVisit } from "@/features/v2/home";
import type { HomeCare, HomeTrend } from "@/features/v2/home-top";
import type { TodayState } from "@patient-core/today-hero";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { stageOf } from "@patient-core/visit-stages";

import { Screen } from "@/components/tide";
import { PayChoice, PromptStatus } from "@/components/tide/v2";
import { AvatarCount, VISIT_PLACES, VisitNav, visitNavBottom } from "@/components/tide/v2-shell";
import { ticketFor } from "@/data/visit-v2";
import { HomeV2View } from "@/features/v2/home";
import { VisitDay } from "@/features/v2/visit-day";
import { VisitsList } from "@/features/v2/visits-list";
import { useTheme, useTide } from "@/theme/theme";
import { tSpace, tType } from "@/theme/tide";

const ESTHER = {
  id: "fx-1",
  startsAtIso: "2026-11-16T05:00:00.000Z",
  endsAtIso: "2026-11-16T07:00:00.000Z",
  status: "arrived",
  departmentName: "General OPD",
  hospitalName: "Kampala General Hospital",
  bookingCode: "K7M42Q",
  sessionId: "s1",
  arrivalWindowStartIso: "2026-11-16T05:00:00.000Z",
  arrivalWindowEndIso: "2026-11-16T07:00:00.000Z",
  forMember: null,
  quotedFeeUgx: 30000,
} as unknown as AppointmentRow;
const PAID = {
  appointmentId: "fx-1",
  billId: "b",
  status: "paid" as const,
  totalUgx: 30000,
  paidUgx: 30000,
  refundedUgx: 0,
  method: "mtn" as const,
  receiptNumber: 421,
  paidChannel: "app" as const,
};

/** Sample readings for the trend card: seven days ending today, two with none. Belong to nobody. */
const WEEK = ["13", "14", "15", "16", "17", "18", "19"].map((d) => ({ date: `${d} Nov`, dayKey: `2026-11-${d}` }));
const week = (values: (number | null)[], bottoms?: (number | null)[]) =>
  WEEK.map((d, i) => ({ ...d, value: values[i] ?? null, ...(bottoms ? { bottom: bottoms[i] ?? null } : {}) }));
const TRENDS: Record<string, HomeTrend> = {
  bp: {
    metric: "bp",
    ctx: "fasting",
    unit: "mmHg",
    days: week([136, 142, null, 132, 134, null, 128], [84, 90, null, 82, 84, null, 80]),
    weekAgo: 136,
  },
  sugar: {
    metric: "sugar",
    ctx: "fasting",
    unit: "mmol/L",
    days: week([7.9, 7.6, null, 6.8, 7.4, null, 7.8]),
    weekAgo: 8.4,
  },
  weight: {
    metric: "weight",
    ctx: "fasting",
    unit: "kg",
    days: week([82.4, null, 82.1, null, 81.9, null, 81.6]),
    weekAgo: 82.6,
  },
  /** A sugar week ending on a sample reading the app's own check calls "Too low". */
  low: {
    metric: "sugar",
    ctx: "fasting",
    unit: "mmol/L",
    days: week([6.9, 6.4, null, 6.1, 5.6, null, 3.4]),
    weekAgo: null,
  },
  /** A blood pressure week ending on a sample reading the app's own check calls "Too low". */
  lowbp: {
    metric: "bp",
    ctx: "fasting",
    unit: "mmHg",
    days: week([118, 112, null, 104, 96, null, 76], [74, 70, null, 66, 60, null, 50]),
    weekAgo: null,
  },
};
/** No reading at all: every day is a gap. */
const EMPTY_WEEK: HomeTrend = { metric: "bp", ctx: "fasting", unit: "mmHg", days: week([]), weekAgo: null };
const QUIET: TodayState = { danger: null, teamAsks: null, dueNow: null, visitToday: null, nextItem: null, nothingUntil: null };
const TODAYS: Record<string, TodayState> = {
  trends: QUIET,
  first: QUIET,
  due: { ...QUIET, dueNow: { kind: "dose", key: "m@08:00", label: "Metformin", dueAt: "08:00" } },
  team: { ...QUIET, teamAsks: { id: "a1", from: "Your care team", at: "2026-11-19T06:10:00.000Z" } },
  danger: { ...QUIET, danger: { kind: "very_high_bp", at: "09:10" } },
};

/** `care` as the route would pass it, on the fixtures; undefined is Home with `careMode` off. */
function careFixture(care: string | undefined, metric: string | undefined): HomeCare | undefined {
  if (care === "none") return { state: "none" };
  const today = care ? TODAYS[care] : undefined;
  if (!today) return undefined;
  return {
    state: "ready",
    today,
    trend: care === "first" ? EMPTY_WEEK : (TRENDS[metric ?? "bp"] ?? TRENDS.bp ?? null),
    noReadings: care === "first",
    onHeroAction: () => undefined,
    onLog: () => undefined,
    onSeeAll: () => undefined,
  };
}

export default function DevVisitV2() {
  const { screen = "day", scheme } = useLocalSearchParams<{ screen?: string; scheme?: string }>();
  const { setPreference } = useTheme();
  useEffect(() => {
    if (scheme === "dark" || scheme === "light") setPreference(scheme);
  }, [scheme, setPreference]);
  const [questions, setQuestions] = useState<VisitQuestion[]>([
    { id: "q1", body: "Is my blood pressure medicine still right for me?", suggested: false, asked: true },
    { id: "q2", body: "When should I come back?", suggested: true, asked: false },
  ]);
  const [pay, setPay] = useState<"momo" | "hospital">("momo");

  if (screen === "home") return <HomeShell />;
  if (screen === "visits")
    return (
      <Screen title="Visits">
        <VisitsList
          offers={[{ id: "o1", title: "Eye Clinic moved", line: "The clinic cancelled Thu 19 Nov. Next open day: Tue 24 Nov." }]}
          upcoming={[
            { id: "u1", day: "16", dayLabel: "MON", clinic: "General OPD", who: "You", window: "08:00 to 10:00", code: "K7M 42Q", chip: "paid_app" },
            { id: "u2", day: "18", dayLabel: "WED", clinic: "Dental Clinic", who: "Moses", window: "10:40", code: "P3D 81X", chip: "at_hospital" },
            { id: "u3", day: "20", dayLabel: "FRI", clinic: "Medical Clinic", who: "Sarah", window: "08:00 to 12:00", code: "R2T 55M", chip: "paid_counter" },
          ]}
          past={[{ id: "p1", day: "2", dayLabel: "MON", clinic: "General OPD", who: "You", window: "09:20", code: "H8K 13B", chip: "none" }]}
          onOpen={() => undefined}
          onOffer={() => undefined}
        />
      </Screen>
    );
  if (screen === "pay")
    return (
      <Screen title="Ask for a day">
        <PayChoice value={pay} onChange={setPay} network="mtn" maskedNumber="07•• ••• 123" onChangeNumber={() => undefined} />
        <PromptStatus view="approve_on_phone" />
      </Screen>
    );
  return (
    <Screen title="Your visit">
      <VisitDay
        ticket={ticketFor(ESTHER, PAID, "Esther N.")}
        stage={stageOf("arrived", "line")}
        stageTimes={["Fri 13", "08:36", "08:52", null, null]}
        calledRoom={null}
        questions={questions}
        nurseNote="Headaches in the morning for two weeks."
        onAddQuestion={(text, suggested) =>
          setQuestions((q) => [...q, { id: `q${q.length + 1}`, body: text, suggested, asked: false }])
        }
        onMarkQuestion={(id, change) =>
          setQuestions((q) =>
            change === "remove" ? q.filter((x) => x.id !== id) : q.map((x) => (x.id === id ? { ...x, asked: change === "asked" } : x)),
          )
        }
        onAction={() => undefined}
        onEditNote={() => undefined}
      />
    </Screen>
  );
}

/** The v2 shell on fixtures: the header with the avatar count, Home, and the Visit-mode nav. */
function HomeShell() {
  const t = useTide();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ visit?: string; place?: string; care?: string; metric?: string }>();
  const start = VISIT_PLACES.find((p) => p.key === params.place)?.key ?? "home";
  const [place, setPlace] = useState<VisitPlace>(start);
  const ticket = ticketFor(ESTHER, PAID, "Esther N.");
  const visit: HomeVisit =
    params.visit === "none" || params.visit === "loading" || params.visit === "failed"
      ? { state: params.visit }
      : {
          state: "ready",
          ticket,
          stage: stageOf("arrived", "line"),
          today: params.visit !== "next" && params.visit !== "tomorrow",
          tomorrow: params.visit === "tomorrow",
        };
  const empty = params.visit === "none";
  return (
    <View style={{ flex: 1 }}>
      <Screen
        underNav
        help="pill"
        helpSource="dev"
        demo
        contentStyle={{ paddingTop: tSpace[5] }}
        header={
          <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[3] }}>
            <AvatarCount initials="EN" count={empty ? 0 : 2} />
            <View>
              <Text style={[tType.bodyS, { color: t.ink2 }]}>Good morning</Text>
              <Text style={[tType.heading, { fontSize: 18, color: t.ink }]}>Esther</Text>
            </View>
          </View>
        }
      >
        <HomeV2View
          visit={visit}
          results={
            empty
              ? { state: "off" }
              : {
                  state: "ordered",
                  tests: 2,
                  note: "Results will be shared after your clinician reviews them.",
                }
          }
          household={empty ? [] : [{ id: "h1", label: "Mother" }]}
          care={careFixture(params.care, params.metric)}
          careLink
          onOpenVisit={() => undefined}
          onRetryVisit={() => undefined}
          onBookToday={() => undefined}
          onBookDay={() => undefined}
          onResults={() => undefined}
          onBookFor={() => undefined}
          onAddSomeone={() => undefined}
          onCare={() => undefined}
          onReadings={() => undefined}
          onMedicines={() => undefined}
          onWellness={() => undefined}
        />
      </Screen>
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 16,
          right: 16,
          bottom: visitNavBottom(insets.bottom),
        }}
      >
        <VisitNav
          width={width - 32}
          current={place}
          onNavigate={setPlace}
          onPlus={() => undefined}
        />
      </View>
    </View>
  );
}
