import { NextResponse } from "next/server";
import { and, asc, eq, lte } from "drizzle-orm";

import { db } from "@/db";
import { schedulePublishJobs } from "@/db/schema/clinics-schedule";
import { hospitals } from "@/db/schema/hospitals";
import { secretMatches } from "@/lib/channels/webhook-auth";
import { runPublish } from "@/lib/clinics-schedule/publish";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * P8: runs scheduled publishes that are due. Each job is re-validated as its author would publish it now; a job
 * that fails (a clash appeared, a clinic is no longer ready, a band change by the same admin) is marked `failed`
 * with the reason and its changes stay scheduled for the admin to see. Same `CRON_SECRET` Bearer auth as the other
 * crons. NOT in vercel.json: the owner adds the schedule at cut-over.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const supplied = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!env.CRON_SECRET)
    return NextResponse.json(
      { error: "CRON_SECRET not configured on the server." },
      { status: 503 },
    );
  if (!supplied || !secretMatches(supplied, env.CRON_SECRET))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const due = await db
    .select({ job: schedulePublishJobs, name: hospitals.name, level: hospitals.level })
    .from(schedulePublishJobs)
    .innerJoin(hospitals, eq(hospitals.id, schedulePublishJobs.hospitalId))
    .where(
      and(eq(schedulePublishJobs.status, "waiting"), lte(schedulePublishJobs.runAt, new Date())),
    )
    .orderBy(asc(schedulePublishJobs.runAt))
    .limit(20);

  let done = 0;
  let failed = 0;
  for (const { job, name, level } of due) {
    try {
      const r = await runPublish(
        {
          hospitalId: job.hospitalId,
          hospitalName: name,
          level: String(level),
          userId: job.author,
        },
        job.changeIds,
        job.author,
      );
      await db
        .update(schedulePublishJobs)
        .set(
          r.ok
            ? { status: "done", ranAt: new Date() }
            : { status: "failed", failure: r.error, ranAt: new Date() },
        )
        .where(eq(schedulePublishJobs.id, job.id));
      if (r.ok) done++;
      else failed++;
    } catch (e) {
      failed++;
      logger.error("cron.clinics-schedule-publish.failed", { err: e, job: job.id });
      await db
        .update(schedulePublishJobs)
        .set({ status: "failed", failure: "error", ranAt: new Date() })
        .where(eq(schedulePublishJobs.id, job.id));
    }
  }
  return NextResponse.json({ due: due.length, done, failed });
}
