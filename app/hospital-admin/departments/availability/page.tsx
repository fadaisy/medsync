import type { HistoryRow } from "../_components/availability-view";

import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import {
  availabilityNow,
  loadAvailabilityEvents,
  loadClinics,
  loadDepartments,
  loadTestCatalogue,
  loadWards,
} from "@/lib/services/data";
import { CAPABILITY_KEYS, IMAGING_ITEMS } from "@/supabase/functions/_shared/services-hub";
import { AvailabilityView } from "../_components/availability-view";

export const dynamic = "force-dynamic";

/**
 * Availability now (§5.8): reported problems, closed wards and closures in one list (AV-3); past the
 * expected-back date a problem is "Unconfirmed — check", never silently available (AV-2); resolving
 * keeps its history (AV-1). Informs only — nothing clinical reads this to block (AV-4).
 */
export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const scope = await requireHospitalAdminScope();
  const h = scope.hospitalId;
  const [now, events, departments, wards, clinics, tests] = await Promise.all([
    availabilityNow(h),
    loadAvailabilityEvents(h, 90),
    loadDepartments(h),
    loadWards(h),
    loadClinics(h),
    loadTestCatalogue(),
  ]);

  // History: problems resolved in the last 90 days.
  const byProblem = new Map<string, typeof events>();
  for (const e of events) byProblem.set(e.problemId, [...(byProblem.get(e.problemId) ?? []), e]);
  const history: HistoryRow[] = [...byProblem.values()]
    .filter((list) => list.at(-1)?.event === "resolved")
    .map((list) => {
      const first = list[0]!;
      const last = list.at(-1)!;
      return {
        problemId: first.problemId,
        kind: first.subjectKind,
        label: first.subjectLabel,
        state: list.find((e) => e.state)?.state ?? "unavailable",
        reason: list.find((e) => e.reason)?.reason ?? null,
        since: first.at,
        resolvedAt: last.at,
        days: Math.max(1, Math.round((Date.parse(last.at) - Date.parse(first.at)) / 86_400_000)),
      };
    })
    .sort((a, b) => b.resolvedAt.localeCompare(a.resolvedAt));

  const lab = departments.find((d) => d.parentId === null && d.catalogueCode === "LABORATORY");
  return (
    <AvailabilityView
      reportOpen={sp.report === "1"}
      problems={now.problems}
      closedWards={now.closedWards.map((w) => ({
        id: w.id,
        name: w.name,
        reason: w.reason,
        since: w.closedAt!.toISOString(),
        back: w.back,
      }))}
      closures={now.closures.map((c) => ({
        id: c.id,
        scope: c.scope,
        startsOn: c.startsOn,
        endsOn: c.endsOn,
        reason: c.reason,
      }))}
      history={history}
      subjects={{
        department: departments
          .filter((d) => d.parentId === null && !d.archived)
          .map((d) => ({ ref: d.id, label: d.name })),
        ward: wards.filter((w) => !w.archived).map((w) => ({ ref: w.id, label: w.name })),
        clinic: clinics
          .filter((c) => c.status !== "archived")
          .map((c) => ({ ref: c.id, label: c.name })),
        test: tests.map((t) => ({ ref: t.code, label: t.name })),
        lab_section: lab
          ? departments
              .filter((d) => d.parentId === lab.id && !d.archived)
              .map((d) => ({ ref: d.id, label: d.name }))
          : [],
        imaging: IMAGING_ITEMS.map((i) => ({ ref: i.code, label: i.label })),
        capability: CAPABILITY_KEYS.filter((k) => !k.derived && k.key !== "opd_hours").map((k) => ({
          ref: k.key,
          label: k.label,
        })),
      }}
    />
  );
}
