/**
 * Home, v2 on the phone (feature matrix 1.3 and 3.1): the header with the avatar count and the Visit mode
 * Home, on the patient's own rows through the existing loaders. The membership card is on Me, not here. The route file (`(tabs)/index.tsx`) puts the
 * two in the `Screen`. What the old Home did for the whole app stays: the details step straight after
 * sign-up, starting the outbox, the location-share banner, "See a doctor".
 *
 * The care parts of the old Home (mood, doses, readings) are not here: the signed matrix moves them to Today
 * (3.1 to 5.1), which is Care mode. While Care mode is locked the page links to the Care screen and to
 * Wellness instead, so nothing the patient logged is out of reach.
 *
 * In Care mode (`careMode`, locked until Gate CG) the top card is what matters most right now (home-top.tsx),
 * on the rows Today already reads (`useHomeCare`). With the flag off none of that is mounted or loaded, and
 * Home is the visit card as before.
 */
import type { HomeVisit } from "@/features/v2/home";
import type { HomeCare } from "@/features/v2/home-top";
import type { HouseholdMember } from "@/lib/booking";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { HOME_V2_COPY as H } from "@content/patient-app/home";
import { stageOf } from "@patient-core/visit-stages";
import { nextVisit } from "@patient-core/visits-calendar";
import { useFocusEffect, useRouter } from "expo-router";
import { Text, View } from "react-native";

import { AvatarCount } from "@/components/tide/v2-shell";
import { useLabsSummary } from "@/data/labs";
import { metaName } from "@/data/me";
import { takeFreshSignup } from "@/data/signup";
import { loadPayStatus, ticketFor } from "@/data/visit-v2";
import { loadVisitAhead, loadWeek } from "@/data/visits";
import { Doctors } from "@/features/home/doctors";
import { ActiveShareBanner, useShareBannerShown } from "@/features/location-share/active-banner";
import { useHomeCare } from "@/features/v2/care-routes";
import { useHeaderIdentity } from "@/features/v2/header-avatar";
import { HomeV2View } from "@/features/v2/home";
import { visitMayHaveAhead } from "@/features/visits/logic";
import { sinceBoot, track } from "@/lib/analytics";
import { fetchHousehold } from "@/lib/booking";
import { flag } from "@/lib/flags";
import { useSession } from "@/lib/session";
import { useNow } from "@/lib/use-now";
import { startOutbox } from "@/offline/outbox";
import { useTide } from "@/theme/theme";
import { tSpace, tType } from "@/theme/tide";

/** Kampala's calendar day (UTC+3, no daylight saving), as the ticket reads it. */
const kampalaDay = (d: Date) => new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 10);

export function greetingFor(now: Date): string {
  const h = now.getHours();
  return h < 12 ? H.greeting.morning : h < 17 ? H.greeting.afternoon : H.greeting.evening;
}

type Visit = HomeVisit & { id?: string };

/** The soonest visit still on the calendar, as the ticket; the web's own rule (`nextVisit`). */
async function fetchVisit(me: string): Promise<Visit> {
  const now = new Date();
  const week = await loadWeek(now);
  const next = nextVisit(week.upcoming);
  if (!next) return { state: "none" };
  // "N ahead of you" only once the desk has checked the patient in; a failed read is no count, not a failed visit.
  const [pay, ahead] = await Promise.all([
    loadPayStatus([next.id]).then(
      (m) => m.get(next.id),
      () => undefined,
    ),
    visitMayHaveAhead(next, now) ? loadVisitAhead(next.id).catch(() => null) : null,
  ]);
  const day = kampalaDay(new Date(next.startsAtIso));
  return {
    state: "ready",
    id: next.id,
    ticket: ticketFor(next, pay, me),
    stage: stageOf(next.status, null),
    today: day === kampalaDay(now),
    tomorrow: day === kampalaDay(new Date(now.getTime() + 86_400_000)),
    ahead,
  };
}

/** Care mode only: reads what the top card needs. Its own component, so nothing loads while the flag is off. */
function WithHomeCare({ children }: { children: (care: HomeCare) => ReactNode }) {
  return children(useHomeCare());
}

/** The greeting for right now: Home's one large title. */
export function useGreeting(): string {
  return greetingFor(useNow());
}

/** Home's header: the avatar with the unseen count, and the first name. The greeting is the page's title. */
export function HomeV2Header() {
  const t = useTide();
  const me = useHeaderIdentity();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[3] }}>
      <AvatarCount initials={me.initials} photoUrl={me.photoUrl} count={me.unseen} />
      {me.first ? (
        <Text numberOfLines={1} style={[tType.label, { flexShrink: 1, color: t.ink }]}>
          {me.first}
        </Text>
      ) : null}
    </View>
  );
}

export function HomeV2Body() {
  const router = useRouter();
  const { session } = useSession();
  const name = metaName(session?.user.user_metadata);
  const labs = useLabsSummary();
  const shareShown = useShareBannerShown();
  const [visit, setVisit] = useState<Visit>({ state: "loading" });
  const [household, setHousehold] = useState<HouseholdMember[]>([]);
  const patient = name ?? "You";

  // Straight after sign-up, once: the details the welcome screen promised.
  useEffect(() => {
    if (takeFreshSignup()) router.push({ pathname: "/profile/details", params: { welcome: "1" } });
  }, [router]);

  useEffect(() => {
    track("home_rendered", { ms: sinceBoot() });
    startOutbox();
  }, []);

  const loadVisit = useCallback(
    () =>
      fetchVisit(patient).then(setVisit, () =>
        // A failed refresh keeps the visit already on screen; only a first load shows the failure.
        setVisit((was) => (was.state === "ready" ? was : { state: "failed" })),
      ),
    [patient],
  );

  // On focus: a visit just booked, moved or cancelled, or a person just added, shows on the way back.
  useFocusEffect(
    useCallback(() => {
      void loadVisit();
      void fetchHousehold().then(setHousehold, () => {});
    }, [loadVisit]),
  );

  const visitId = visit.state === "ready" ? visit.id : undefined;

  const view = (care?: HomeCare) => (
    <HomeV2View
      visit={visit}
      care={care}
      results={
        labs.status === "ready" && labs.latest
          ? { state: "ordered", tests: labs.testCount, note: labs.latest.note }
          : { state: "off" }
      }
      household={household.map((m) => ({ id: m.id, label: m.label }))}
      // "See a doctor": the current list, which opens the doctor's own times (3.5, kept).
      doctors={<Doctors />}
      // Care mode has its own places once it is unlocked; until then Home opens the current care screens.
      careLink={!flag("careMode")}
      onOpenVisit={() => {
        if (visitId) router.push(`/visits/${visitId}`);
      }}
      onRetryVisit={() => {
        setVisit({ state: "loading" });
        void loadVisit();
      }}
      onBookToday={() => router.push("/book/today")}
      onBookDay={() => router.push("/book/day")}
      onResults={() => router.push("/care/labs")}
      onBookFor={(memberId) => {
        const m = household.find((x) => x.id === memberId);
        if (m)
          router.push({
            pathname: "/book/day",
            params: { member: m.provisionalPatientId, memberName: m.label },
          });
      }}
      onAddSomeone={() => router.push("/household")}
      onCare={() => router.push("/care")}
      onReadings={() => router.push("/care/trends")}
      onMedicines={() => router.push("/care/medicines")}
      onWellness={() => router.push("/wellness")}
    />
  );

  return (
    <View style={{ gap: tSpace[6] }}>
      {shareShown ? <ActiveShareBanner /> : null}
      {flag("careMode") ? <WithHomeCare>{view}</WithHomeCare> : view()}
    </View>
  );
}
