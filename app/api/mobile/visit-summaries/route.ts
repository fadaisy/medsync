import { NextResponse } from "next/server";

import { allow } from "@/lib/onboarding/rate-limit";
import {
  getVisitSummary,
  listVisitSummaries,
  prescriptionsInTracker,
} from "@/lib/patient/visit-summaries";
import { takeHomePrescriptionIds } from "@/lib/patient/visit-summary";
import { patientFromBearer } from "./_lib/caller";
import { toMobileSummary } from "./_lib/shape";

export const dynamic = "force-dynamic";

/**
 * The phone's shared visit summaries (ADR 0342 §2). The web's own readers decrypt them, so the key never
 * leaves the server; only the caller's own current shared copies come back (a held or superseded copy never
 * reaches a patient, ADR 0203). Each item is the whole copy, so the phone can keep the list for reading offline.
 *
 * GET → { summaries: MobileVisitSummary[] }, newest first.
 */
export async function GET(request: Request) {
  if (!(await allow("mobile-visit-summaries", 30)))
    return NextResponse.json({ error: "Too many tries. Wait a minute and try again." }, { status: 429 });
  const caller = await patientFromBearer(request);
  if (!caller.ok) return caller.response;

  const list = await listVisitSummaries(caller.userId);
  // ponytail: one decrypt per summary after the list's own; a patient has a handful. Add a combined reader
  // in lib/patient/visit-summaries.ts if anyone ever has hundreds.
  const opened = await Promise.all(
    list.map(async (meta) => ({ meta, content: await getVisitSummary(caller.userId, meta.id) })),
  );
  const ready = opened.flatMap((o) => (o.content ? [{ meta: o.meta, content: o.content }] : []));
  const inTracker = await prescriptionsInTracker(
    caller.userId,
    ready.flatMap((o) => takeHomePrescriptionIds(o.content)),
  );
  return NextResponse.json({
    summaries: ready.map((o) => toMobileSummary(o.meta, o.content, inTracker)),
  });
}
