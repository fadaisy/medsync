import Link from "next/link";

import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import {
  loadDepartments,
  loadOfferings,
  loadOpenProblems,
  loadTestCatalogue,
  standardsComparison,
} from "@/lib/services/data";
import { DiagnosticsView } from "../_components/diagnostics-view";

export const dynamic = "force-dynamic";

/**
 * Diagnostics (§5.6): the lab test menu is a per-hospital overlay on the ordering catalogue
 * (`loinc_codes`, DX-1); imaging is the A.4 catalogue. The national-menu comparison waits for MoH's
 * list (unobtainable 26 Sep 2026) — the page says so rather than showing a number (Law 5).
 */
export default async function DiagnosticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const scope = await requireHospitalAdminScope();
  const h = scope.hospitalId;
  const [departments, tests, offerings, problems, comparison] = await Promise.all([
    loadDepartments(h),
    loadTestCatalogue(),
    loadOfferings(h),
    loadOpenProblems(h),
    standardsComparison(h),
  ]);
  const lab =
    departments.find(
      (d) => d.parentId === null && d.catalogueCode === "LABORATORY" && !d.archived,
    ) ?? null;
  return (
    <>
      {/* Lab Phase 1 (§5.9, artboard 14): the switch to one result path lives under Laboratory. */}
      {emrV1LiveFor(h) ? (
        <p className="text-body-s mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
          <Link
            href="/hospital-admin/departments/diagnostics/one-result-path"
            className="font-medium text-teal-700 underline-offset-4 hover:underline"
          >
            One result path for the laboratory
          </Link>
        </p>
      ) : null}
      <DiagnosticsView
        sub={sp.sub === "imaging" ? "imaging" : "lab"}
        focusTest={typeof sp.test === "string" ? sp.test : null}
        lab={lab ? { id: lab.id, live: lab.live } : null}
        sections={
          lab
            ? departments
                .filter((d) => d.parentId === lab.id && !d.archived)
                .map((d) => ({ id: d.id, name: d.name, code: d.catalogueCode }))
            : []
        }
        tests={tests.map((t) => ({ code: t.code, name: t.name, category: t.category }))}
        offerings={offerings}
        problems={problems.filter(
          (p) =>
            p.subjectKind === "test" ||
            p.subjectKind === "imaging" ||
            p.subjectKind === "lab_section",
        )}
        imagingComparison={comparison?.rows.find((r) => r.kind === "imaging") ?? null}
        presetLabel={comparison?.preset.levelLabel ?? null}
      />
    </>
  );
}
