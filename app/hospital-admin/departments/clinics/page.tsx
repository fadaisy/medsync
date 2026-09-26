import type { TimetableCell } from "../_components/clinics-view";
import type { ClosureWindow } from "@/supabase/functions/_shared/services-hub";

import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import {
  loadClinics,
  loadClosures,
  loadDepartments,
  loadHolidays,
  loadPlaces,
  loadStaffPool,
} from "@/lib/services/data";
import { skipDayFor } from "@/supabase/functions/_shared/services-hub";
import { DEFAULT_TIME_ZONE, expandSessionTemplate } from "@/supabase/functions/_shared/slots";
import { ClinicsView } from "../_components/clinics-view";

export const dynamic = "force-dynamic";

const ymd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: DEFAULT_TIME_ZONE });

/** The Monday of the week holding `ymdStr` (or today), as YYYY-MM-DD. */
function mondayOf(ymdStr?: string): string {
  const base =
    ymdStr && /^\d{4}-\d{2}-\d{2}$/.test(ymdStr)
      ? new Date(`${ymdStr}T12:00:00+03:00`)
      : new Date();
  const local = new Date(`${ymd(base)}T12:00:00+03:00`);
  const iso = ((local.getUTCDay() + 6) % 7) + 1; // 1 = Monday
  return ymd(new Date(local.getTime() - (iso - 1) * 86_400_000));
}

/**
 * Clinics & clinic days (§5.5). The timetable is computed from the booking engine's own templates
 * with the same expander and the same skip rule the engine materialises with (CLN-3, CLN-4), so the
 * week shown is the week patients can book — and the holiday-skipped days are named, not hidden.
 */
export default async function ClinicsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const scope = await requireHospitalAdminScope();
  const h = scope.hospitalId;
  const week = mondayOf(typeof sp.week === "string" ? sp.week : undefined);
  const weekEnd = ymd(new Date(new Date(`${week}T12:00:00+03:00`).getTime() + 6 * 86_400_000));
  const horizonEnd = ymd(new Date(new Date(`${week}T12:00:00+03:00`).getTime() + 62 * 86_400_000));

  const [clinics, departments, places, pool, holidays, closures] = await Promise.all([
    loadClinics(h),
    loadDepartments(h),
    loadPlaces(h),
    loadStaffPool(h),
    loadHolidays(week, horizonEnd),
    loadClosures(h),
  ]);

  const liveClosures: ClosureWindow[] = closures
    .filter((c) => !c.lifted && c.scope !== "ward")
    .map((c) => ({
      scope: c.scope,
      departmentId: c.departmentId,
      serviceLineId: c.serviceLineId,
      startsOn: c.startsOn,
      endsOn: c.endsOn,
    }));
  const holidayDates = holidays.map((x) => x.holidayDate);
  const placeName = new Map(places.map((p) => [p.id, p.name]));
  const rangeStart = new Date(`${week}T00:00:00+03:00`);
  const rangeEnd = new Date(rangeStart.getTime() + 7 * 86_400_000);

  const cells: TimetableCell[] = [];
  const skipped: { clinic: string; day: string; why: string }[] = [];
  for (const c of clinics.filter((x) => x.status !== "archived")) {
    for (const t of c.templates.filter((x) => x.active)) {
      const row = {
        weekday: t.weekday,
        startMinutesLocal: t.startMinutesLocal,
        durationMinutes: t.durationMinutes,
        validFrom: t.validFrom,
        validUntil: t.validUntil,
        repeatEveryWeeks: t.repeatEveryWeeks,
        nthWeekday: t.nthWeekday,
      };
      const skip = skipDayFor({
        holidays: holidayDates,
        closures: liveClosures,
        runsOnHolidays: t.runsOnHolidays,
        departmentIds: [c.departmentId, ...(c.unitId ? [c.unitId] : [])],
        serviceLineId: c.id,
      });
      const all = expandSessionTemplate(row, rangeStart, rangeEnd, DEFAULT_TIME_ZONE);
      for (const o of all) {
        const day = ymd(o.startsAt);
        if (skip(day)) {
          const hol = holidays.find((x) => x.holidayDate === day);
          skipped.push({ clinic: c.name, day, why: hol ? hol.name : "Closure" });
          continue;
        }
        cells.push({
          clinicId: c.id,
          clinic: c.name,
          status: c.status,
          confidential: c.confidential,
          day,
          weekday: t.weekday,
          start: t.startMinutesLocal,
          end: t.startMinutesLocal + t.durationMinutes,
          place: t.placeId ? (placeName.get(t.placeId) ?? t.venue) : t.venue,
          capacity: t.capacityTotal,
          booked: t.capacityBooked,
          pattern: t.nthWeekday
            ? "nth"
            : t.repeatEveryWeeks > 1
              ? "every"
              : t.validFrom === t.validUntil
                ? "one_off"
                : "weekly",
        });
      }
    }
  }

  return (
    <ClinicsView
      week={week}
      weekEnd={weekEnd}
      view={sp.view === "list" ? "list" : "timetable"}
      printMode={sp.print === "1"}
      openId={typeof sp.open === "string" ? sp.open : null}
      addOpen={sp.add === "1"}
      clinics={clinics}
      departments={departments
        .filter((d) => !d.archived)
        .map((d) => ({
          id: d.id,
          parentId: d.parentId,
          name: d.name,
          catalogueCode: d.catalogueCode,
          live: d.live,
        }))}
      places={places.filter((p) => !p.archived).map((p) => ({ id: p.id, name: p.name }))}
      clinicians={[
        ...new Map(
          pool
            .filter((p) => p.cadreCode && p.cadreCode !== "RECEPTION")
            .map((p) => [p.userId, { userId: p.userId, name: p.name }]),
        ).values(),
      ]}
      cells={cells}
      skipped={skipped}
      upcomingHolidays={holidays.map((x) => ({ date: x.holidayDate, name: x.name }))}
      closures={closures
        .filter((c) => !c.lifted && c.scope === "clinic")
        .map((c) => ({
          serviceLineId: c.serviceLineId,
          startsOn: c.startsOn,
          endsOn: c.endsOn,
          reason: c.reason,
        }))}
      hospitalName={scope.hospitalName}
    />
  );
}
