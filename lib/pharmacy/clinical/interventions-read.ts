import type { QueryFact } from "./interventions";
import type { EmrDb, EmrTx } from "@/lib/emr/db";
import { and, eq, gte, inArray, lt } from "drizzle-orm";

import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { pharmacyQueries, pharmacyQueryEvents } from "@/db/schema/pharmacy-dispensing";

/**
 * IV-4's input: Phase 1 queries in the period with their closing event, by dispensing point. No patient identifier
 * leaves this read. ponytail: "ward" is the query's dispensing point until queries carry the patient's ward.
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
      ward: hospitalDepartments.name,
    })
    .from(pharmacyQueries)
    .leftJoin(hospitalDepartments, eq(hospitalDepartments.id, pharmacyQueries.dispensingPointId))
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
      ward: q.ward,
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
