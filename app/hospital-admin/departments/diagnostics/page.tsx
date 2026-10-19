import Link from "next/link";
import { redirect } from "next/navigation";

import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { loadTestMenuData } from "@/lib/lab/test-menu-read";
import {
  loadDepartments,
  loadOfferings,
  loadOpenProblems,
  standardsComparison,
} from "@/lib/services/data";
import { DiagnosticsView } from "../_components/diagnostics-view";

export const dynamic = "force-dynamic";

/**
 * Diagnostics (§5.6): the laboratory's menu is one row per catalogue test (Lab test menu v2, DX-1, ADR 0350), the
 * same component and store as the lab's Set-up → Tests; imaging is the A.4 catalogue. `loinc_codes` is a code
 * reference, never a menu (ADR 0355). The hospital admin sees "Restricted test" for restricted classes (Law 6).
 */
export default async function DiagnosticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  // Step 10: the old per-LOINC focus (?test=<LOINC>) opens the new menu; its other filters carry over.
  if (typeof sp.test === "string") {
    const keep = new URLSearchParams(
      Object.entries(sp).flatMap(([k, v]) =>
        k !== "test" && typeof v === "string" ? [[k, v]] : [],
      ),
    );
    redirect(`/hospital-admin/departments/diagnostics${keep.size ? `?${keep}` : ""}`);
  }
  const scope = await requireHospitalAdminScope();
  const h = scope.hospitalId;
  const [departments, offerings, problems, comparison, menu] = await Promise.all([
    loadDepartments(h),
    loadOfferings(h),
    loadOpenProblems(h),
    standardsComparison(h),
    loadTestMenuData(h, "hub", false),
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
        tab={sp.tab === "profiles" ? "profiles" : "menu"}
        lab={lab ? { id: lab.id, live: lab.live } : null}
        sections={
          lab
            ? departments
                .filter((d) => d.parentId === lab.id && !d.archived)
                .map((d) => ({ id: d.id, name: d.name, code: d.catalogueCode }))
            : []
        }
        menu={menu}
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
