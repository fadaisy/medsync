import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CriticalComm } from "@/components/emr/results/critical-comm";
import { ResultEntry } from "@/components/emr/results/result-entry";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { REJECTION_REASON_TEXT } from "@/lib/emr/orders";
import { loadResultEntry } from "@/lib/emr/read/results";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { criticalFlaggingActive } from "@/lib/lab/critical-flagging";
import { loadRejectableSpecimen } from "@/lib/lab/read";
import { FlaggingNotice } from "../../_components/flagging-notice";
import { RejectSpecimen } from "../../_components/reject-specimen";

const REASONS = Object.entries(REJECTION_REASON_TEXT).map(([value, words]) => ({
  value,
  label: words.charAt(0).toUpperCase() + words.slice(1),
}));

export const metadata: Metadata = { title: "Enter results · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/**
 * One screen per panel (gate-a E.9): enter, save a preliminary, release the final version; a
 * released result is read here and amended; a released critical one also takes the call record
 * (E.10). EMR v1 only — with the flag off this route does not exist.
 *
 * LAB_WORKSPACE on (Lab Phase 0): the critical-flagging notice above the results while MedSync is
 * not flagging (§5.6, Law 10), and the specimen's Reject, moved here from the worklist row.
 */
export default async function LabResultEntryPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const scope = await requireLabTechScope();
  if (!emrV1LiveFor(scope.hospitalId)) notFound();
  const data = await loadResultEntry(scope, orderId, {
    mode: "direct",
    surface: "lab_result_entry",
  });
  if (!data) notFound();
  const workspace = scope.workspaceLive;
  const specimenId =
    workspace && !data.report?.released
      ? await loadRejectableSpecimen(scope.hospitalId, orderId)
      : null;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <Link
        href="/lab"
        className="text-body-s tap inline-flex min-h-11 items-center self-start font-medium text-teal-700 underline-offset-4 hover:underline sm:min-h-0"
      >
        Back to the worklist
      </Link>
      {workspace && !criticalFlaggingActive(scope.hospitalId) ? <FlaggingNotice /> : null}
      <ResultEntry data={data} surface="lab" />
      {specimenId && scope.access.permissions.has("lab.receive") ? (
        <RejectSpecimen
          patientUserId={data.patientUserId}
          specimenId={specimenId}
          test={data.test}
          reasons={REASONS}
        />
      ) : null}
      {data.communicate ? (
        <CriticalComm
          patientUserId={data.patientUserId}
          identity={data.identity}
          test={data.test}
          target={data.communicate}
        />
      ) : null}
    </div>
  );
}
