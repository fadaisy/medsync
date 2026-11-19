/**
 * Care mode routes on the phone, v2 (Step 7), behind `careMode`. Each loads the patient's own
 * rows (`@/data/care-v2`, the readings log), runs the shared rules (`@patient-core/care-plan`, the ladder) and
 * renders the props-driven screens in `care-today.tsx`. A tick shows at once and is sent, or kept on this phone
 * until it can be (S18).
 */
import type { CareData } from "@/data/care-v2";
import type { HomeCare, TrendMetric } from "@/features/v2/home-top";
import type { CardReading, DoseTick, PlanSlot } from "@patient-core/care-plan";
import type { Hero, TodayState } from "@patient-core/today-hero";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { CARE_V2_COPY } from "@content/patient-app/care";
import { careTodayState, kampalaDayKey, medsWeek, planDay, tenDays } from "@patient-core/care-plan";
import { UNITS } from "@patient-core/readings";
import { heroFor } from "@patient-core/today-hero";

import { Screen } from "@/components/tide";
import { loadCare, tickDose } from "@/data/care-v2";
import { useReadings } from "@/data/readings";
import { newId } from "@/offline/outbox";
import { useNow } from "@/lib/use-now";

import { CarePlanV2, CareTodayV2, MedicinesV2 } from "./care-today";

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const kampalaClock = (d: Date) => new Date(d.getTime() + 3 * 3600_000).toISOString().slice(11, 16);

/** Words for the hero: the team, never a name; the alert's time in Kampala. */
function heroWords(state: TodayState): TodayState {
  return {
    ...state,
    danger: state.danger ? { ...state.danger, at: kampalaClock(new Date(state.danger.at)) } : null,
    teamAsks: state.teamAsks ? { ...state.teamAsks, from: CARE_V2_COPY.hero.teamFrom } : null,
  };
}

/** The readings a programme follows, in the order its cards are shown. */
function programmeMetrics(programme: string): TrendMetric[] {
  return programme === "diabetes" ? ["sugar", "weight"] : programme === "hypertension" ? ["bp", "weight"] : ["sugar", "bp", "weight"];
}

/**
 * The patient's care rows plus ticks made on this phone since the last load. `turn` reads them again when it
 * changes (Home, on focus); `loaded` tells "not read yet" from "not in a care programme".
 */
function useCare(turn = 0) {
  const now = useNow();
  const [care, setCare] = useState<CareData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [local, setLocal] = useState<DoseTick[]>([]);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void loadCare().then((c) => {
      if (!live) return;
      setCare(c);
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [turn]);
  const ticks = [...(care?.ticks ?? []), ...local];
  const slots = care ? planDay(care.items, ticks, kampalaDayKey(now), now) : [];
  const week = care
    ? medsWeek(care.items, ticks, now).map((d) => ({
        label: WEEKDAY[new Date(`${d.dayKey}T12:00:00Z`).getUTCDay()]!,
        mark: d.mark,
      }))
    : [];
  const tick = async (s: PlanSlot) => {
    if (!care?.planVersionId || s.state === "done") return;
    const t: DoseTick = {
      medicineKey: s.itemKey,
      dueAtIso: s.dueAtIso,
      status: "taken",
      recordedAtIso: new Date().toISOString(),
    };
    setLocal((l) => [...l, t]);
    const r = await tickDose({ planVersionId: care.planVersionId, medicineKey: s.itemKey, dueAtIso: s.dueAtIso, status: "taken", clientKey: newId() });
    if (r === "failed") setLocal((l) => l.filter((x) => x !== t));
    setNote(r === "queued" ? CARE_V2_COPY.plan.offline : null);
  };
  return { now, care, loaded, ticks, slots, week, tick, note };
}

export function CareTodayV2Route() {
  const router = useRouter();
  const { now, care, ticks, slots, week, tick, note } = useCare();
  const { readings } = useReadings();
  if (!care) return null;
  const state = careTodayState({ items: care.items, ticks, alerts: care.alerts, asks: care.asks, visitToday: null, now });
  const hero: Hero = heroFor(heroWords(state));
  const card = readings as unknown as CardReading[];
  const snippets = programmeMetrics(care.programme).map((m) => ({ metric: m, ctx: "fasting" as const, unit: UNITS[m], ...tenDays(card, m, now) }));
  return (
    <CareTodayV2
      hero={hero}
      slots={slots}
      nowLabel={kampalaClock(now)}
      snippets={snippets}
      week={week}
      note={note}
      onHeroAction={() => {
        if (hero.kind === "due") {
          const s = slots.find((x) => x.key === hero.due.key);
          if (s) void tick(s);
        }
        if (hero.kind === "danger") router.push("/help");
      }}
      onTick={(s) => void tick(s)}
      onLog={(m) => router.push({ pathname: "/care/reading", params: { kind: m } })}
      onSeePlan={() => router.push("/care/plan")}
    />
  );
}

/**
 * What Home's top card reads in Care mode (home-top.tsx): the same rows, rules and words as Today, so the two
 * never disagree, and no call Today does not already make. Read again each time Home takes focus, so a reading
 * that needs action or a dose just ticked shows on the way back. Only mounted while `careMode` is on.
 *
 * The trend card is one measure: the first of the programme's that has a reading in the last seven days, or
 * the programme's first when none has, so the card still offers "Log a reading".
 */
export function useHomeCare(): HomeCare {
  const router = useRouter();
  const [turn, setTurn] = useState(0);
  const mounted = useRef(false);
  useFocusEffect(
    useCallback(() => {
      // The first focus is the mount, which `useCare` has already read for.
      if (mounted.current) setTurn((n) => n + 1);
      mounted.current = true;
    }, []),
  );
  const { now, care, loaded, ticks, slots, tick } = useCare(turn);
  const { readings, loading: logLoading, error: logError } = useReadings();
  if (!loaded) return { state: "loading" };
  if (!care) return { state: "none" };
  const today = heroWords(
    careTodayState({ items: care.items, ticks, alerts: care.alerts, asks: care.asks, visitToday: null, now }),
  );
  const card = readings as unknown as CardReading[];
  const weeks = programmeMetrics(care.programme).map((m) => {
    const ten = tenDays(card, m, now);
    return { metric: m, ctx: "fasting" as const, unit: UNITS[m], days: ten.days.slice(-7), weekAgo: ten.weekAgo };
  });
  const trend = weeks.find((w) => w.days.some((d) => d.value !== null)) ?? weeks[0] ?? null;
  return {
    state: "ready",
    today,
    trend,
    // Only once the log is read: a log still loading, or one that could not be read, is not "no readings".
    noReadings: !logLoading && !logError && readings.length === 0,
    onHeroAction: (hero) => {
      if (hero.kind === "danger") router.push("/help");
      if (hero.kind === "team") router.push("/care/messages");
      if (hero.kind === "due") {
        const s = slots.find((x) => x.key === hero.due.key);
        if (s) void tick(s);
      }
    },
    onLog: (m) => router.push({ pathname: "/care/reading", params: { kind: m } }),
    onSeeAll: () => router.push("/care/trends"),
  };
}

/** The Plan page's body; its route file draws the Tide `<Screen>` (and so Help, law L6). */
export function CarePlanBody() {
  const { slots, week, tick } = useCare();
  return <CarePlanV2 slots={slots} week={week} onTick={(s) => void tick(s)} />;
}

export function MedicinesV2Route() {
  const { slots, week, tick } = useCare();
  return (
    <Screen title={CARE_V2_COPY.plan.medicines} back={{}}>
      <MedicinesV2 slots={slots} week={week} onTick={(s) => void tick(s)} />
    </Screen>
  );
}
