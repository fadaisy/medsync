import "server-only";

import type { WebSnippet, WebWeekDot } from "@/components/tide/v2-care-web";
import type { CardReading, PlanSlot } from "@patient-core/care-plan";
import { careTodayState, kampalaDayKey, medsWeek, planDay, tenDays } from "@patient-core/care-plan";
import { readingsFrom } from "@patient-core/log";
import { UNITS } from "@patient-core/readings";
import { heroFor } from "@patient-core/today-hero";

import { CARE_V2_COPY } from "@/content/patient-app/care";
import { loadCareWeb } from "@/lib/patient-web/care-v2";
import { loadLog } from "@/lib/patient-web/day";

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const kampalaClock = (d: Date) =>
  new Date(d.getTime() + 3 * 3600_000).toISOString().slice(11, 16);

/** Today, the plan and the week for Care mode on the web, from the patient's own rows (Step 9). */
export async function loadToday(userId: string, now: Date) {
  const care = await loadCareWeb(now);
  if (!care) return null;
  const slots: PlanSlot[] = planDay(care.items, care.ticks, kampalaDayKey(now), now);
  const week: WebWeekDot[] = medsWeek(care.items, care.ticks, now).map((d) => ({
    label: WEEKDAY[new Date(`${d.dayKey}T12:00:00Z`).getUTCDay()]!,
    mark: d.mark,
  }));
  const state = careTodayState({
    items: care.items,
    ticks: care.ticks,
    alerts: care.alerts,
    asks: care.asks,
    visitToday: null,
    now,
  });
  const hero = heroFor({
    ...state,
    danger: state.danger ? { ...state.danger, at: kampalaClock(new Date(state.danger.at)) } : null,
    teamAsks: state.teamAsks ? { ...state.teamAsks, from: CARE_V2_COPY.hero.teamFrom } : null,
  });
  const readings = readingsFrom(
    await loadLog(userId, 14).catch(() => []),
  ) as unknown as CardReading[];
  const metrics: WebSnippet["metric"][] =
    care.programme === "diabetes"
      ? ["sugar", "weight"]
      : care.programme === "hypertension"
        ? ["bp", "weight"]
        : ["sugar", "bp", "weight"];
  const snippets: WebSnippet[] = metrics.map((m) => ({
    metric: m,
    unit: UNITS[m],
    ...tenDays(readings, m, now),
  }));
  return { care, slots, week, hero, snippets };
}
