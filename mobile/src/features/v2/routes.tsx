/**
 * Patient app v2 Visit mode routes on the phone (Step 4), behind `appV2Mobile`. Each loads real data with the
 * existing loaders (`@/data/visits`, `@/lib/booking`) plus `@/data/visit-v2`, and renders the props-driven v2
 * screen. Booking behaviour, moving, cancelling and confirming are the booking slice's own (S9).
 */
import type { OfferV2, VisitRowV2 } from "@/features/v2/visits-list";
import type { VisitQuestion, VisitPay } from "@/data/visit-v2";
import type { AppointmentRow } from "@/lib/booking";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, Share, View } from "react-native";
import { useRouter } from "expo-router";
import { stageOf } from "@patient-core/visit-stages";

import { Button, Screen } from "@/components/tide";
import { StageStrip, TicketV2 } from "@/components/tide/v2";
import { addQuestion, chipFor, loadPayStatus, loadQuestions, markQuestion, ticketFor } from "@/data/visit-v2";
import { loadVisit, loadWeek } from "@/data/visits";
import { VisitDay } from "@/features/v2/visit-day";
import { VisitsList } from "@/features/v2/visits-list";
import { mapsUrl } from "@/features/visits/logic";
import { fetchPatientProfile } from "@/lib/booking";
import { acceptRebooking, fetchRebookingOffer } from "@/lib/notifications";
import { useTide } from "@/theme/theme";
import { tSpace } from "@/theme/tide";

const DAY_LABEL = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function rowOf(v: AppointmentRow, pay: VisitPay | undefined, me: string): VisitRowV2 {
  const d = new Date(new Date(v.startsAtIso).getTime() + 3 * 3600_000); // Kampala, UTC+3
  const t = ticketFor(v, pay, me);
  return {
    id: v.id,
    day: String(d.getUTCDate()),
    dayLabel: DAY_LABEL[d.getUTCDay()]!,
    clinic: v.departmentName,
    who: v.forMember ?? "You",
    window: t.window,
    code: t.code,
    chip: v.quotedFeeUgx ? chipFor(pay) : "none",
  };
}

function Loading() {
  const t = useTide();
  return (
    <View style={{ padding: tSpace[8], alignItems: "center" }}>
      <ActivityIndicator color={t.ink3} />
    </View>
  );
}

type VisitsState = { offers: OfferV2[]; upcoming: VisitRowV2[]; past: VisitRowV2[]; sessions: Map<string, string> };

/** Everything the Visits list shows, loaded with the existing loaders. Pure: no state is set here. */
async function fetchVisits(): Promise<VisitsState> {
  const week = await loadWeek(new Date());
  const all = [...week.upcoming, ...week.past];
  const pay = await loadPayStatus(all.map((v) => v.id));
  const offers: OfferV2[] = [];
  const sessions = new Map<string, string>();
  for (const v of all.filter((x) => x.cancelledReason === "session_cancelled")) {
    const o = await fetchRebookingOffer(v.id).catch(() => null);
    if (!o) continue;
    sessions.set(v.id, o.sessionId);
    offers.push({
      id: v.id,
      title: `${v.departmentName} moved`,
      line: `The clinic cancelled this day. Next open day: ${new Date(o.startsAtIso).toDateString()}`,
    });
  }
  return {
    offers,
    sessions,
    upcoming: week.upcoming.filter((v) => v.status !== "cancelled").map((v) => rowOf(v, pay.get(v.id), "You")),
    past: week.past.map((v) => rowOf(v, pay.get(v.id), "You")),
  };
}

export function VisitsV2Route() {
  const router = useRouter();
  const [state, setState] = useState<VisitsState | null>(null);
  useEffect(() => {
    let live = true;
    void fetchVisits().then((s) => live && setState(s));
    return () => {
      live = false;
    };
  }, []);
  return (
    <Screen title="Visits">
      {state ? (
        <VisitsList
          {...state}
          onOpen={(id) => router.push(`/visits/${id}`)}
          onOffer={async (id, answer) => {
            if (answer === "pick") router.push("/book/day");
            const session = state?.sessions.get(id);
            if (answer === "keep" && session) {
              await acceptRebooking({ cancelledAppointmentId: id, sessionId: session });
              setState(await fetchVisits());
            }
            if (answer === "cancel") setState((s) => (s ? { ...s, offers: s.offers.filter((o) => o.id !== id) } : s));
          }}
        />
      ) : (
        <Loading />
      )}
    </Screen>
  );
}

export function VisitDayV2Route({ id }: { id: string }) {
  const [visit, setVisit] = useState<AppointmentRow | null>(null);
  const [pay, setPay] = useState<VisitPay | undefined>(undefined);
  const [me, setMe] = useState("You");
  const [questions, setQuestions] = useState<VisitQuestion[]>([]);
  const refreshQuestions = useCallback(async () => setQuestions(await loadQuestions(id)), [id]);
  useEffect(() => {
    void (async () => {
      const [v, profile] = await Promise.all([loadVisit(id), fetchPatientProfile().catch(() => null)]);
      setVisit(v);
      if (profile && "fullName" in profile) setMe(String((profile as { fullName?: string }).fullName ?? "You"));
      if (v) setPay((await loadPayStatus([v.id])).get(v.id));
      await refreshQuestions();
    })();
  }, [id, refreshQuestions]);
  if (!visit) return <Screen title="Your visit"><Loading /></Screen>;
  const ticket = ticketFor(visit, pay, me);
  return (
    <Screen title="Your visit">
      <VisitDay
        ticket={ticket}
        stage={stageOf(visit.status, null)}
        stageTimes={[null, null, null, null, null]}
        calledRoom={null}
        questions={questions}
        nurseNote={visit.reasonNote}
        onAddQuestion={async (text, suggested) => {
          if (await addQuestion(visit.id, text, suggested)) void refreshQuestions();
        }}
        onMarkQuestion={async (qid, change) => {
          if (await markQuestion(qid, change)) void refreshQuestions();
        }}
        onAction={(a) => {
          if (a === "directions") void Linking.openURL(mapsUrl(Platform.OS, visit.hospitalName, visit.hospitalPin));
          if (a === "share")
            void Share.share({ message: `${ticket.dayLine} ${ticket.day}, ${ticket.window}. Code ${ticket.code}.` });
          if (a === "text") void Share.share({ message: `Tether: your code is ${ticket.code}. Show it at the desk.` });
          if (a === "calendar")
            void Share.share({ message: `Clinic visit · ${ticket.dayLine} ${ticket.day} · ${ticket.window}` });
        }}
      />
    </Screen>
  );
}

/** Home's visit card (§5.2, phone board 1): today's or the next visit as the ticket, with the stage strip. */
export function HomeVisitCardV2({ visit, pay, me }: { visit: AppointmentRow; pay: VisitPay | undefined; me: string }) {
  return (
    <View style={{ gap: tSpace[3] }}>
      <TicketV2 {...ticketFor(visit, pay, me)} />
      <StageStrip view={stageOf(visit.status, null)} />
    </View>
  );
}


/** Home's top card in Visit mode: the next visit (today's first), loaded with the existing loaders. */
export function HomeNextVisitV2({ me }: { me: string }) {
  const router = useRouter();
  const [state, setState] = useState<{ visit: AppointmentRow; pay: VisitPay | undefined } | null>(null);
  useEffect(() => {
    void (async () => {
      const week = await loadWeek(new Date()).catch(() => null);
      const next = week?.upcoming.find((v) => v.status !== "cancelled");
      if (!next) return;
      setState({ visit: next, pay: (await loadPayStatus([next.id])).get(next.id) });
    })();
  }, []);
  if (!state) return null;
  return (
    <View accessibilityHint="Opens your visit">
      <HomeVisitCardV2 visit={state.visit} pay={state.pay} me={me} />
      <View style={{ height: tSpace[2] }} />
      <OpenVisit onPress={() => router.push(`/visits/${state.visit.id}`)} />
    </View>
  );
}

function OpenVisit({ onPress }: { onPress: () => void }) {
  return <Button label="See your visit" onPress={onPress} variant="soft" size="md" />;
}
