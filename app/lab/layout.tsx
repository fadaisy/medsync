import type { LabNavEntry } from "./_components/lab-nav";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

import { db } from "@/db";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { loadLabWorklist as loadLegacyWorklist } from "@/lib/lab-tech/worklist";
import { countOpenCriticals } from "@/lib/lab/criticals/read";
import { criticalsLive } from "@/lib/lab/criticals/readiness";
import { isDemoHospital } from "@/lib/lab/demo";
import { countFormsWaiting } from "@/lib/lab/downtime-read";
import {
  labCatalogueV2LiveFor,
  labCriticalsLiveFor,
  labDeltaChecksLiveFor,
  labDowntimeLiveFor,
  labEqaLiveFor,
  labEquipmentLiveFor,
  labExchangeLiveFor,
  labHmisLiveFor,
  labOneMenuLiveFor,
  labPoctQualityLiveFor,
  labQcLiveFor,
  labReferralLiveFor,
  labReportsLiveFor,
  labSettingsLiveFor,
  labStockLiveFor,
  labUnitsRangesLiveFor,
  patientResultsLiveFor,
} from "@/lib/lab/feature";
import { countMatchesWaiting } from "@/lib/lab/match-read";
import { navFor } from "@/lib/lab/nav";
import { labWorklistFor, rejectedFor, releasedTodayFor } from "@/lib/lab/page-data";
import { cn } from "@/lib/utils";
import { LabShell } from "./_components/lab-shell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * The laboratory workspace. Auth: `requireLabTechScope()` enforces auth + AAL2/MFA + an active
 * AHPC lab affiliation, and, where LAB_WORKSPACE is on, `lab.view` (lib/lab/access.ts).
 *
 * LAB_WORKSPACE on (Lab Phase 0): the workspace shell, with the registered navigation and its
 * counts. Off: the original top bar, unchanged (Law 11).
 */
export default async function LabLayout({ children }: { children: ReactNode }) {
  const scope = await requireLabTechScope();
  if (!scope.workspaceLive) return <LegacyLabLayout scope={scope}>{children}</LegacyLabLayout>;

  const emr = emrV1LiveFor(scope.hospitalId);
  const criticals = emr && (await criticalsLive(scope.hospitalId));
  const downtime = emr && labDowntimeLiveFor(scope.hospitalId);
  const formsWaiting = downtime ? await countFormsWaiting(scope.hospitalId) : null;
  const referral = emr && labReferralLiveFor(scope.hospitalId);
  const matchesWaiting = referral ? await countMatchesWaiting(scope.hospitalId) : null;
  const [open, released, rejected, criticalsOpen] = emr
    ? await Promise.all([
        labWorklistFor(scope.hospitalId).then((w) => w.inputs.length),
        releasedTodayFor(scope.hospitalId).then((r) => r.length),
        rejectedFor(scope.hospitalId).then((r) => r.length),
        criticals ? countOpenCriticals(scope.hospitalId) : 0,
      ])
    : [(await loadLegacyWorklist(scope.hospitalId)).length, 0, 0, 0];
  const counts = {
    worklist: open,
    released,
    rejected,
    criticals: criticalsOpen,
    setup_catalogue: null,
    setup_ranges: null,
    setup_limits: null,
    setup_delta: null,
    setup_patient_release: null,
    setup_demo: null,
    setup_criticals: null,
    setup_profiles: null,
    setup_drafts: null,
    setup_settings: null,
    to_refer: null,
    setup_menu: null,
    stock: null,
    equipment: null,
    quality: null,
    qc: null,
    nonconformities: null,
    eqa: null,
    bedside_quality: null,
    register: null,
    hmis: null,
    reports: null,
    referrals: null,
    partners: null,
    connections: null,
    matches: matchesWaiting,
    analysers: null,
    downtime: formsWaiting,
  };
  const words = {
    worklist: `${open} waiting`,
    released: `${released} released today`,
    rejected: `${rejected} rejected in 7 days`,
    criticals: `${criticalsOpen} open critical ${criticalsOpen === 1 ? "alert" : "alerts"}`,
    setup_catalogue: "",
    setup_ranges: "",
    setup_limits: "",
    setup_criticals: "",
    setup_profiles: "",
    setup_drafts: "",
    setup_settings: "",
    to_refer: "",
    setup_menu: "",
    stock: "",
    equipment: "",
    quality: "",
    qc: "",
    nonconformities: "",
    eqa: "",
    bedside_quality: "",
    register: "",
    hmis: "",
    reports: "",
    referrals: "",
    partners: "",
    connections: "",
    matches: `${matchesWaiting ?? 0} waiting for a match`,
    analysers: "",
    setup_delta: "",
    setup_patient_release: "",
    setup_demo: "",
    downtime: `${formsWaiting} printed ${formsWaiting === 1 ? "form" : "forms"} to enter`,
  };
  const nav: LabNavEntry[] = navFor(scope.access.permissions, {
    criticals,
    // Set-up follows the flag alone: it is where the production gate's gaps are fixed.
    criticalsSetup: emr && labCriticalsLiveFor(scope.hospitalId),
    unitsRanges: emr && labUnitsRangesLiveFor(scope.hospitalId),
    downtime,
    catalogueV2: emr && labCatalogueV2LiveFor(scope.hospitalId),
    oneMenu: emr && labOneMenuLiveFor(scope.hospitalId),
    settings: emr && labSettingsLiveFor(scope.hospitalId),
    stock: emr && labStockLiveFor(scope.hospitalId),
    equipment: emr && labEquipmentLiveFor(scope.hospitalId),
    qc: emr && labQcLiveFor(scope.hospitalId),
    eqa: emr && labEqaLiveFor(scope.hospitalId),
    poctQuality: emr && labPoctQualityLiveFor(scope.hospitalId),
    hmis: emr && labHmisLiveFor(scope.hospitalId),
    reports: emr && labReportsLiveFor(scope.hospitalId),
    referral: referral,
    exchange: emr && labExchangeLiveFor(scope.hospitalId),
    deltaChecks: emr && labDeltaChecksLiveFor(scope.hospitalId),
    patientResults: emr && patientResultsLiveFor(scope.hospitalId),
    demo: emr && (await isDemoHospital(db as never, scope.hospitalId)),
  }).map((i) => ({
    id: i.id,
    label: i.label,
    href: i.href,
    exact: i.exact,
    count: counts[i.id],
    countLabel: words[i.id],
    ...(i.group ? { group: i.group } : {}),
  }));
  return (
    <LabShell
      scope={scope}
      sectionName={scope.sectionIds.length ? scope.departmentName : null}
      nav={nav}
    >
      {children}
    </LabShell>
  );
}

/** The pre-Phase-0 lab top bar, byte for byte, for hospitals with LAB_WORKSPACE off. */
function LegacyLabLayout({
  scope,
  children,
}: {
  scope: Awaited<ReturnType<typeof requireLabTechScope>>;
  children: ReactNode;
}) {
  return (
    <div className="bg-background text-foreground flex min-h-svh w-full flex-col">
      <header className="border-border glass sticky top-0 z-30 flex h-[52px] items-center justify-between gap-3 border-b px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="font-display text-foreground text-body-m font-semibold">
            MedSync
          </Link>
          <span
            className="text-muted-foreground hidden truncate font-mono text-[10px] tracking-[0.12em] uppercase sm:inline"
            title={`${scope.hospitalName}${scope.departmentName ? ` · ${scope.departmentName}` : ""}`}
          >
            <span
              aria-hidden
              className="bg-grape-icon ring-grape-edge mr-1.5 inline-block size-1 -translate-y-px rounded-full ring-2"
            />
            Laboratory · {scope.hospitalName}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={cn("text-muted-foreground truncate text-[12px]", "hidden sm:inline")}
            title={scope.userEmail}
          >
            {scope.fullName ?? scope.userEmail}
          </span>
          <Link
            href="/accounts"
            className="text-muted-foreground hover:text-foreground text-[12px] underline-offset-4 transition-colors hover:underline"
          >
            Switch account
          </Link>
          <Link
            href="/sign-out"
            className="text-muted-foreground hover:text-foreground text-[12px] underline-offset-4 transition-colors hover:underline"
          >
            Sign out
          </Link>
        </div>
      </header>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
