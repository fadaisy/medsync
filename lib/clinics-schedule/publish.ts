import "server-only";

import type { PortResult } from "@/components/clinics-schedule/port";
/**
 * The publish core (P4, P8, P10, CS9), shared by "Publish now", "Publish now instead" and the scheduled job: the
 * server re-reads the drafts and re-validates, then `cs_publish` writes every edit in one transaction.
 */
import { sql } from "drizzle-orm";

import { CS_ERRORS } from "@/content/clinics-schedule/copy";
import { db } from "@/db";
import { saAuditLog } from "@/db/schema/sa-audit-log";
import { loadClinicsSchedule } from "./load";
import { applyChanges, impactOf, publishBlockers } from "./model";
import { opsForChanges } from "./ops";

type Scope = { hospitalId: string; hospitalName: string; level: string; userId: string };

/** P10 + CS9, re-checked on the server: no clash, nothing unready going live, a band change needs a second admin. */
export async function checkPublish(s: Scope, ids: string[], publisher: string) {
  const data = await loadClinicsSchedule(s);
  const pending = [...(data.job?.changes ?? []), ...data.drafts];
  const chosen = pending.filter((c) => ids.includes(c.id));
  if (chosen.length !== ids.length) return { ok: false, error: CS_ERRORS.stale } as const;
  const view = applyChanges(data.published, pending);
  const deptLive = (id: string) => data.departments[id]?.live ?? true;
  if (publishBlockers(data.published, view, deptLive).length)
    return { ok: false, error: CS_ERRORS.blocked } as const;
  if (chosen.some((c) => c.author === publisher && c.edits.some((e) => e.entity === "bands")))
    return { ok: false, error: CS_ERRORS.fourEyes } as const;
  const texts = chosen.reduce((n, ch) => n + impactOf(view, ch, data.booked, 0).texts, 0);
  return { ok: true, data, chosen, texts, view } as const;
}

export async function runPublish(
  s: Scope,
  ids: string[],
  publisher: string,
): Promise<PortResult<{ version: number; texts: number }>> {
  const r = await checkPublish(s, ids, publisher);
  if (!r.ok) return { ok: false, error: r.error };
  const ops = opsForChanges(
    r.chosen.flatMap((c) => c.edits),
    { actor: s.userId, today: r.data.today, view: r.view, newId: () => crypto.randomUUID() },
  );
  // Bands published by a second admin are approved (CS9).
  for (const o of ops)
    if (o.t === "hospital_fee_bands" && o.v)
      Object.assign(o.v, { approved_by: s.userId, approved_at: new Date().toISOString() });
  const rows = await db.execute<{ n: number }>(
    sql`select public.cs_publish(${s.hospitalId}::uuid, ${s.userId}::uuid, ${ids}::uuid[], ${JSON.stringify(ops)}::jsonb, ${r.texts}::int) as n`,
  );
  const version = Number((rows as unknown as { n: number }[])[0]?.n ?? 0);
  await db.insert(saAuditLog).values({
    actorId: s.userId,
    action: "cs_publish",
    targetKind: "hospital",
    targetId: s.hospitalId,
    reason: `Published version ${version}`,
    beforeData: null,
    afterData: { version, changes: ids, ops: ops.length },
  });
  return { ok: true, version, texts: r.texts };
}
