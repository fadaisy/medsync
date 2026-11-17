import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { todayStats, todayTodo } from "@/lib/hospital-admin/today";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { TodayView } from "./_components/today-view";
import { loadToday } from "./_lib/load";
import { loadSetupFacts } from "./_lib/setup";

export const dynamic = "force-dynamic";

const DUE = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const DATE = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: DEFAULT_TIME_ZONE,
});

/**
 * Today (ADR 0521), the admin's home on both domains: four counts that each open where the work is done, and a
 * short Do next list from the same records as the menu's badges and Requests. Above them, "Set up Tether" (ADR 0522)
 * with each step's done state read from the hospital's own records.
 */
export default async function TodayPage() {
  const scope = await requireHospitalAdminScope();
  const [input, setup] = await Promise.all([
    loadToday(scope.hospitalId, scope.userId, (d) => DUE.format(new Date(`${d}T00:00:00Z`))),
    loadSetupFacts(scope.hospitalId),
  ]);
  return (
    <TodayView
      date={DATE.format(new Date(input.now))}
      stats={todayStats(input)}
      todo={todayTodo(input)}
      setup={setup}
    />
  );
}
