/**
 * Patient app v2 Visit mode routes on the phone (Step 4). Each loads real data with the
 * existing loaders (`@/data/visits`, `@/lib/booking`) plus `@/data/visit-v2`, and renders the props-driven v2
 * screen. Booking behaviour, moving, cancelling and confirming are the booking slice's own (S9).
 */
import type { OfferV2, VisitRowV2 } from "@/features/v2/visits-list";
import type { MoneyRows, VisitQuestion, VisitPay } from "@/data/visit-v2";
import type { AheadRead } from "@/features/visits/logic";
import type { AppointmentRow } from "@/lib/booking";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Platform, Share, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { stageOf } from "@patient-core/visit-stages";

import { HOME_V2_COPY } from "@content/patient-app/home";

import { Button, Screen } from "@/components/tide";
import { kampalaStamp, visitMoney } from "@patient-core/visit-money";
import {
  addQuestion,
  askRefund,
  chipFor,
  loadPayStatus,
  loadQuestions,
  loadVisitMoney,
  markQuestion,
  movedByClinic,
  myMobile,
  payVisit,
  ticketFor,
} from "@/data/visit-v2";
import { HeaderAvatar } from "@/features/v2/header-avatar";
import { VisitMoneySection } from "@/features/v2/visit-money";
import { supabase } from "@/lib/supabase";
import { loadVisit, loadVisitAhead, loadWeek } from "@/data/visits";
import { VisitDay } from "@/features/v2/visit-day";
import { VisitsList } from "@/features/v2/visits-list";
import { mapsUrl, visitMayHaveAhead } from "@/features/visits/logic";
import { fetchPatientProfile } from "@/lib/booking";
import { flag } from "@/lib/flags";
import { acceptRebooking, fetchRebookingOffer } from "@/lib/notifications";
import { dayKeyOf, shortDayOf } from "@patient-core/visits-calendar";
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
    date: shortDayOf(dayKeyOf(v.startsAtIso)),
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
  for (const v of all.filter(movedByClinic)) {
    const o = await fetchRebookingOffer(v.id).catch(() => null);
    if (!o) continue;
    sessions.set(v.id, o.sessionId);
    offers.push({
      id: v.id,
      title: `${v.departmentName} moved`,
      line: `The clinic cancelled this day. Next open day: ${shortDayOf(dayKeyOf(o.startsAtIso))}.`,
    });
  }
  return {
    offers,
    sessions,
    upcoming: week.upcoming.filter((v) => v.status !== "cancelled").map((v) => rowOf(v, pay.get(v.id), "You")),
    past: week.past.map((v) => rowOf(v, pay.get(v.id), "You")),
  };
}

export function VisitsV2Route({ top }: { top?: React.ReactNode }) {
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
    // A place under the nav (finish pass 1): room for the bar, the avatar count, and no entrance.
    <Screen title="Visits" underNav helpSource="visits" headerRight={<HeaderAvatar />}>
      {top}
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

export function VisitDayV2Route({ id, onManage }: { id: string; onManage: () => void }) {
  const [visit, setVisit] = useState<AppointmentRow | null>(null);
  const [pay, setPay] = useState<VisitPay | undefined>(undefined);
  const [me, setMe] = useState("You");
  const [questions, setQuestions] = useState<VisitQuestion[]>([]);
  const [money, setMoney] = useState<{ rows: MoneyRows; meId: string; msisdn: string | null } | null>(null);
  const refreshQuestions = useCallback(async () => setQuestions(await loadQuestions(id)), [id]);
  const refreshMoney = useCallback(async (v: AppointmentRow) => {
    const [rows, user, msisdn] = await Promise.all([
      loadVisitMoney(v.id, v.hospitalId).catch(() => null),
      supabase.auth.getUser().catch(() => null),
      myMobile().catch(() => null),
    ]);
    const meId = user?.data.user?.id;
    if (rows && meId) setMoney({ rows, meId, msisdn });
    setPay((await loadPayStatus([v.id])).get(v.id));
  }, []);
  // "N ahead of you" once the desk has checked the patient in (ADR 0084 §6); null before, and on any failure.
  const [ahead, setAhead] = useState<AheadRead | null>(null);
  const aheadFor = useCallback(
    async (v: AppointmentRow | null) =>
      setAhead(v && visitMayHaveAhead(v, new Date()) ? await loadVisitAhead(v.id) : null),
    [],
  );
  useEffect(() => {
    void (async () => {
      const [v, profile] = await Promise.all([loadVisit(id), fetchPatientProfile().catch(() => null)]);
      setVisit(v);
      if (profile && "fullName" in profile) setMe(String((profile as { fullName?: string }).fullName ?? "You"));
      void aheadFor(v);
      if (v) await refreshMoney(v);
      await refreshQuestions();
    })();
  }, [id, refreshQuestions, refreshMoney, aheadFor]);
  // On a return to the page and on the patient's own "Check again", never on a timer (ADR 0084 §15). The visit
  // is read again with it, so a check-in at the desk while the page was open shows. The first focus is the
  // mount, which the load above already covers.
  const checkAhead = useCallback(async () => {
    const v = await loadVisit(id).catch(() => null);
    if (v) setVisit(v);
    await aheadFor(v);
  }, [id, aheadFor]);
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) void checkAhead();
      focusedOnce.current = true;
    }, [checkAhead]),
  );
  if (!visit) return <Screen title="Your visit" back={{}}><Loading /></Screen>;
  const ticket = ticketFor(visit, pay, me);
  return (
    <Screen title="Your visit" back={{}}>
      <VisitDay
        ticket={ticket}
        stage={stageOf(visit.status, null)}
        stageTimes={[null, null, null, null, null]}
        ahead={ahead}
        onCheckAhead={() => void checkAhead()}
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
      {money ? (
        <MoneyFor visit={visit} money={money} onChanged={() => void refreshMoney(visit)} />
      ) : null}
      {/* "I'm coming", Move it and Cancel are the current screen's (3.10, kept): v2 has no version yet. */}
      <Button label={HOME_V2_COPY.phone.manageVisit} variant="outline" icon="calendar" onPress={onManage} />
    </Screen>
  );
}

/** Step 6 (P2 to P5): the shared model over this visit's rows; pays and asks through the Edge Functions. */
function MoneyFor({
  visit,
  money,
  onChanged,
}: {
  visit: AppointmentRow;
  money: { rows: MoneyRows; meId: string; msisdn: string | null };
  onChanged: () => void;
}) {
  const m = visitMoney({
    appointmentStatus: visit.status,
    startsAtIso: visit.startsAtIso,
    ...money.rows,
    meUserId: money.meId,
    patientUserId: visit.forMember ? `member:${visit.forMember}` : money.meId,
    hospitalName: visit.hospitalName,
    now: new Date(),
  });
  return (
    <VisitMoneySection
      money={m}
      // Paying from the app only where it is switched on; otherwise the cash office is the way (P.onTheDay).
      msisdn={flag("mobilePayments") ? money.msisdn : null}
      cutoffLabel={m.cancelRule ? kampalaStamp(m.cancelRule.cutoffIso) : null}
      payBill={async (i) => {
        const r = await payVisit({
          appointmentId: visit.id,
          billId: i.kind === "top_up" ? i.billId : undefined,
          network: i.network,
          msisdn: i.msisdn,
        });
        if (r.ok) onChanged();
        return r;
      }}
      askRefund={async () => {
        const r = await askRefund(visit.id);
        if (r.ok) onChanged();
        return r;
      }}
    />
  );
}
