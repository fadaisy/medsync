import type { QueryFact } from "./interventions";
import type { EmrDb, EmrTx } from "@/lib/emr/db";
import { and, eq, gte, inArray, lt } from "drizzle-orm";

import { db as appDb } from "@/db";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { pharmacyQueries, pharmacyQueryEvents } from "@/db/schema/pharmacy-dispensing";

/**
 * IV-4's input: Phase 1 queries in the period with their closing event, by dispensing point. No patient identifier
 * leaves this read. ponytail: "ward" is the query's dispensing point until queries carry the patient's ward.
 * `ward` holds the point's id here; `nameWards` names it after the reader's transaction, on the app connection, as every
 * hub-name read does: the clinical reader role has no grant on hospital_departments, so joining it inside failed.
 */
export async function queryFacts(
  db: EmrDb | EmrTx,
  hospitalId: string,
  from: Date,
  to: Date,
): Promise<QueryFact[]> {
  const qs = await db
    .select({
      id: pharmacyQueries.id,
      typeCode: pharmacyQueries.typeCode,
      intent: pharmacyQueries.intent,
      sentAt: pharmacyQueries.createdAt,
      pointId: pharmacyQueries.dispensingPointId,
    })
    .from(pharmacyQueries)
    .where(
      and(
        eq(pharmacyQueries.hospitalId, hospitalId),
        gte(pharmacyQueries.createdAt, from),
        lt(pharmacyQueries.createdAt, to),
      ),
    );
  if (!qs.length) return [];
  const events = await db
    .select({
      queryId: pharmacyQueryEvents.queryId,
      kind: pharmacyQueryEvents.kind,
      answer: pharmacyQueryEvents.answer,
      at: pharmacyQueryEvents.occurredAt,
    })
    .from(pharmacyQueryEvents)
    .where(
      and(
        inArray(
          pharmacyQueryEvents.queryId,
          qs.map((q) => q.id),
        ),
        inArray(pharmacyQueryEvents.kind, ["answered", "withdrawn"]),
      ),
    );
  // The first answer or withdrawal closes a query (a dispute reopens it in Phase 1; the latest event wins).
  const closing = new Map<string, (typeof events)[number]>();
  for (const e of events.sort((a, b) => +new Date(a.at) - +new Date(b.at)))
    closing.set(e.queryId, e);
  return qs.map((q) => {
    const c = closing.get(q.id);
    return {
      id: q.id,
      typeCode: q.typeCode,
      ward: q.pointId,
      intent: q.intent,
      sentAt: new Date(q.sentAt),
      closed: !c
        ? null
        : c.kind === "withdrawn"
          ? { kind: "withdrawn" as const, at: new Date(c.at) }
          : {
              kind: "answered" as const,
              answer: c.answer as "keep" | "changed" | "stopped",
              at: new Date(c.at),
            },
    };
  });
}

/** Swaps each fact's point id for the point's name. Run outside the reader's transaction. */
export async function nameWards(
  facts: QueryFact[],
  hospitalId: string,
  database: EmrDb = appDb as unknown as EmrDb,
): Promise<QueryFact[]> {
  const ids = [...new Set(facts.flatMap((q) => (q.ward ? [q.ward] : [])))];
  if (!ids.length) return facts;
  const rows = await database
    .select({ id: hospitalDepartments.id, name: hospitalDepartments.name })
    .from(hospitalDepartments)
    .where(and(eq(hospitalDepartments.hospitalId, hospitalId), inArray(hospitalDepartments.id, ids)));
  const name = new Map(rows.map((d) => [d.id, d.name]));
  return facts.map((q) => ({ ...q, ward: (q.ward && name.get(q.ward)) || null }));
}
