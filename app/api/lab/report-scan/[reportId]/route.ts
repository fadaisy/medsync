import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { diagnosticReports, labResultAttachments } from "@/db/schema";
import { getAuthState } from "@/lib/auth";
import { logChartAccess, resolveEmrAccess } from "@/lib/emr/access";
import { asClinicalWriter } from "@/lib/emr/db";
import { labReferralLiveFor } from "@/lib/lab/feature";
import { logger } from "@/lib/logger";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * "Open the original report" (Lab Phase 4 §5.5, RB-6, A9): the scan of a referred result's paper report, through a
 * 5-minute signed URL, only for someone the platform's access rule lets open that patient at that hospital (the
 * same rule as the chart), at AAL2. Every opening is written to the chart-access log. The bucket has no client
 * policy: only this route reads it.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const parsed = z.uuid().safeParse((await params).reportId);
  if (!parsed.success) return new NextResponse("Not found", { status: 404 });
  const state = await getAuthState();
  if (!state.user || state.aal !== "aal2")
    return new NextResponse("Sign in with your authenticator", { status: 401 });
  const [rep] = await db
    .select({
      hospitalId: diagnosticReports.hospitalId,
      patientUserId: diagnosticReports.patientUserId,
      referralId: diagnosticReports.referralId,
    })
    .from(diagnosticReports)
    .where(eq(diagnosticReports.id, parsed.data));
  if (!rep?.referralId || !labReferralLiveFor(rep.hospitalId))
    return new NextResponse("Not found", { status: 404 });
  const who = { userId: state.user.id, hospitalId: rep.hospitalId };
  const path = await asClinicalWriter(who, async (tx) => {
    const access = await resolveEmrAccess(tx, { ...who, patientUserId: rep.patientUserId });
    if (!access.allowed) return null;
    const [scan] = await tx
      .select({ path: labResultAttachments.path })
      .from(labResultAttachments)
      .where(
        and(
          eq(labResultAttachments.referralId, rep.referralId!),
          eq(labResultAttachments.hospitalId, rep.hospitalId),
        ),
      )
      .orderBy(desc(labResultAttachments.uploadedAt))
      .limit(1);
    if (scan)
      await logChartAccess(tx, {
        ...who,
        patientUserId: rep.patientUserId,
        basis: access.basis,
        surface: "lab_report_scan",
      });
    return scan?.path ?? null;
  });
  if (!path) return new NextResponse("Not found", { status: 404 });
  const { data, error } = await createServiceClient()
    .storage.from("lab-report-scans")
    .createSignedUrl(path, 300);
  if (error || !data) {
    logger.warn("lab.report_scan.sign_failed", {});
    return new NextResponse("The scan could not be opened. Try again.", { status: 502 });
  }
  return NextResponse.redirect(data.signedUrl, { status: 302 });
}
