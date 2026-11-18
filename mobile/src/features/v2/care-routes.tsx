/**
 * Care mode routes on the phone, v2 (Step 7), behind `careMode`. Each loads the patient's own
 * rows (`@/data/care-v2`, the readings log), runs the shared rules (`@patient-core/care-plan`, the ladder) and
 * renders the props-driven screens in `care-today.tsx`. A tick shows at once and is sent, or kept on this phone
 * until it can be (S18).
 */
import type { CareData } from "@/data/care-v2";
import type { CardReading, DoseTick, PlanSlot } from "@patient-core/care-plan";
import type { Hero } from "@patient-core/today-hero";
import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
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

/** The patient's care rows plus ticks made on this phone since the last load. */
function useCare() {
  const now = useNow();
  const [care, setCare] = useState<CareData | null>(null);
  const [local, setLocal] = useState<DoseTick[]>([]);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void loadCare().then((c) => live && setCare(c));
    return () => {
      live = false;
    };
  }, []);
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
  return { now, care, ticks, slots, week, tick, note };
}

export function CareTodayV2Route() {
  const router = useRouter();
  const { now, care, ticks, slots, week, tick, note } = useCare();
  const { readings } = useReadings();
  if (!care) return null;
  const state = careTodayState({ items: care.items, ticks, alerts: care.alerts, asks: care.asks, visitToday: null, now });
  // Words for the hero: the team, never a name; the alert's time in Kampala.
  const hero: Hero = heroFor({
    ...state,
    danger: state.danger ? { ...state.danger, at: kampalaClock(new Date(state.danger.at)) } : null,
    teamAsks: state.teamAsks ? { ...state.teamAsks, from: CARE_V2_COPY.hero.teamFrom } : null,
  });
  const card = readings as unknown as CardReading[];
  const metrics: ("sugar" | "bp" | "weight")[] =
    care.programme === "diabetes" ? ["sugar", "weight"] : care.programme === "hypertension" ? ["bp", "weight"] : ["sugar", "bp", "weight"];
  const snippets = metrics.map((m) => ({ metric: m, ctx: "fasting" as const, unit: UNITS[m], ...tenDays(card, m, now) }));
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
