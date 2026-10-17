import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { prescriptions } from "@/db/schema/prescribing";
import { logger } from "@/lib/logger";
import { allow } from "@/lib/onboarding/rate-limit";
import { isTakeHomeOn, selfMedicationFromPrescription } from "@/lib/patient/visit-medicine";
import {
  getVisitSummary,
  listVisitSummaries,
  prescriptionsInTracker,
} from "@/lib/patient/visit-summaries";
import { takeHomePrescriptionIds } from "@/lib/patient/visit-summary";
import { patientFromBearer } from "../_lib/caller";
import { toMobileSummary } from "../_lib/shape";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const NOT_FOUND = () => NextResponse.json({ error: "That visit record isn't available." }, { status: 404 });

/** GET → { summary: MobileVisitSummary } for one of the caller's own shared copies, else 404. */
export async function GET(request: Request, { params }: Params) {
  if (!(await allow("mobile-visit-summaries", 30)))
    return NextResponse.json({ error: "Too many tries. Wait a minute and try again." }, { status: 429 });
  const caller = await patientFromBearer(request);
  if (!caller.ok) return caller.response;
  const { id } = await params;

  const meta = (await listVisitSummaries(caller.userId)).find((s) => s.id === id);
  const content = meta ? await getVisitSummary(caller.userId, id) : null;
  if (!meta || !content) return NOT_FOUND();
  const inTracker = await prescriptionsInTracker(caller.userId, takeHomePrescriptionIds(content));
  return NextResponse.json({ summary: toMobileSummary(meta, content, inTracker) });
}

const Body = z.object({ prescriptionId: z.string().uuid() });

/**
 * POST { prescriptionId } → { ok: true } | { error }: "Add to my medicines", the phone's door to the web's
 * `addMedicineFromVisitAction` (ADR 0203 §7), with the same checks and the same words. Only a take-home item on
 * the caller's own current shared copy; the prescription is read on the server; the row is written through the
 * patient's own RLS client, with no dose times (the patient sets them).
 */
export async function POST(request: Request, { params }: Params) {
  if (!(await allow("mobile-visit-add-medicine", 10)))
    return NextResponse.json({ error: "Too many tries. Wait a minute and try again." }, { status: 429 });
  const caller = await patientFromBearer(request);
  if (!caller.ok) return caller.response;
  const { id: summaryId } = await params;

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "That medicine can't be added." }, { status: 400 });
  }
  const { prescriptionId } = parsed;

  const content = await getVisitSummary(caller.userId, summaryId);
  if (!content || !isTakeHomeOn(content, prescriptionId))
    return NextResponse.json({ error: "That medicine can't be added." }, { status: 404 });

  const [rx] = await db
    .select({
      id: prescriptions.id,
      drugName: prescriptions.drugName,
      dose: prescriptions.dose,
      route: prescriptions.route,
      frequency: prescriptions.frequency,
      duration: prescriptions.duration,
      state: prescriptions.state,
    })
    .from(prescriptions)
    .where(and(eq(prescriptions.id, prescriptionId), eq(prescriptions.patientUserId, caller.userId)))
    .limit(1);
  if (!rx || rx.state === "cancelled")
    return NextResponse.json(
      { error: "This prescription is no longer active. Ask your care team." },
      { status: 409 },
    );

  const { error } = await caller.client.from("self_medications").insert({
    patient_user_id: caller.userId,
    ...selfMedicationFromPrescription(rx, content.visit),
  });
  if (error) {
    if (error.code === "23505")
      return NextResponse.json({ error: "Already in your medicines." }, { status: 409 });
    logger.warn("patient.mobile.add_med_from_visit_failed", { reason: error.message });
    return NextResponse.json(
      { error: "Couldn't save that — try again in a moment." },
      { status: 500 },
    );
  }

  // The web's pages that show the list, as the web action does.
  revalidatePath("/patient");
  revalidatePath("/patient/track");
  revalidatePath("/patient/track/doses");
  revalidatePath("/patient/track/medications");
  revalidatePath(`/patient/care/visits/${summaryId}`);
  return NextResponse.json({ ok: true });
}
