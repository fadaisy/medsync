import "server-only";

import type { LabNavFlags } from "@/lib/lab/nav";
import { cache } from "react";

import { db } from "@/db";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { criticalsLive } from "@/lib/lab/criticals/readiness";
import { isDemoHospital } from "@/lib/lab/demo";
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
  labWorkspaceV2LiveFor,
  patientResultsLiveFor,
} from "@/lib/lab/feature";
import { placesFor } from "@/lib/lab/places";

/** The lab scope, once per request (the layout and the page both ask). */
export const labScope = cache(requireLabTechScope);

/** The flags the lab's navigation registry reads (lib/lab/nav.ts), once per request. */
export const labNavFlagsFor = cache(async (hospitalId: string): Promise<LabNavFlags> => {
  const emr = emrV1LiveFor(hospitalId);
  return {
    criticals: emr && (await criticalsLive(hospitalId)),
    // Set-up follows the flag alone: it is where the production gate's gaps are fixed.
    criticalsSetup: emr && labCriticalsLiveFor(hospitalId),
    unitsRanges: emr && labUnitsRangesLiveFor(hospitalId),
    downtime: emr && labDowntimeLiveFor(hospitalId),
    catalogueV2: emr && labCatalogueV2LiveFor(hospitalId),
    oneMenu: emr && labOneMenuLiveFor(hospitalId),
    settings: emr && labSettingsLiveFor(hospitalId),
    stock: emr && labStockLiveFor(hospitalId),
    equipment: emr && labEquipmentLiveFor(hospitalId),
    qc: emr && labQcLiveFor(hospitalId),
    eqa: emr && labEqaLiveFor(hospitalId),
    poctQuality: emr && labPoctQualityLiveFor(hospitalId),
    hmis: emr && labHmisLiveFor(hospitalId),
    reports: emr && labReportsLiveFor(hospitalId),
    referral: emr && labReferralLiveFor(hospitalId),
    exchange: emr && labExchangeLiveFor(hospitalId),
    deltaChecks: emr && labDeltaChecksLiveFor(hospitalId),
    patientResults: emr && patientResultsLiveFor(hospitalId),
    demo: emr && (await isDemoHospital(db as never, hospitalId)),
  };
});

/** Lab Workspace v2 context for a page: scope, the v2 flag, and the viewer's places and tabs. */
export const labV2 = cache(async () => {
  const scope = await labScope();
  const live =
    scope.workspaceLive &&
    emrV1LiveFor(scope.hospitalId) &&
    labWorkspaceV2LiveFor(scope.hospitalId);
  const flags = await labNavFlagsFor(scope.hospitalId);
  return { scope, live, flags, ...placesFor(scope.access.permissions, flags) };
});
