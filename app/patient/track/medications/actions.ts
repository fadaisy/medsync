"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { prescriptions } from "@/db/schema/prescribing";
import { EmrWriteError } from "@/lib/emr/write/context";
import { logger } from "@/lib/logger";
import { requirePatientScope } from "@/lib/patient/scope";
import {
  PATIENT_REPORT_COPY,
  patientListLive,
  PatientReportInput,
  reportFromPatient,
} from "@/lib/pharmacy/patient-list";

export type ReportState = { ok: boolean; error?: string };

const Input = PatientReportInput.omit({ report: true });
const FAILED = "That could not be saved. Try again in a moment.";

/**
 * `reportBoughtOutside` · `reportCouldNotGet` (Section 8: Patient; ML-4): the patient, for their own line,
 * where the hospital's list is live. Zod with a client key → the patient's own session → the line is theirs
 * → one transaction (lib/pharmacy/patient-list.ts). A refusal comes back in words.
 */
async function report(raw: unknown, kind: "bought" | "could_not_get"): Promise<ReportState> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: FAILED };
  try {
    const scope = await requirePatientScope();
    const [rx] = await db
      .select({ hospitalId: prescriptions.hospitalId })
      .from(prescriptions)
      .where(
        and(
          eq(prescriptions.id, parsed.data.lineId),
          eq(prescriptions.patientUserId, scope.userId),
        ),
      )
      .limit(1);
    if (!rx || !(await patientListLive(rx.hospitalId)))
      return { ok: false, error: PATIENT_REPORT_COPY.notYours };
    await reportFromPatient(scope.userId, { ...parsed.data, report: kind });
    revalidatePath("/patient/track/medications");
    return { ok: true };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof EmrWriteError) return { ok: false, error: e.message };
    logger.warn("patient.pharmacy.report_failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, error: FAILED };
  }
}

export async function reportBoughtOutside(raw: unknown) {
  return report(raw, "bought");
}

export async function reportCouldNotGet(raw: unknown) {
  return report(raw, "could_not_get");
}
