import type { EmrTx } from "@/lib/emr/db";
import { sql } from "drizzle-orm";

import { pharmacyIssueConfirmations } from "@/db/schema/pharmacy-stores";
import { rowsOf } from "@/lib/pharmacy/audit/read";
import { batchRef, loadLocation, movePair } from "./write";

/**
 * A dispatch's arrival (STORE.md §C3): the confirmation first, then transit → place, so stock counts at the place only
 * from here on (0275 `psm_dispatch_leg`). A note is a difference: it opens a case and marks the requisition.
 */
export async function transitOf(tx: EmrTx, hospitalId: string) {
  const [t] = rowsOf<{ id: string }>(
    await tx.execute(sql`SELECT private.pharmacy_transit_location(${hospitalId}::uuid) AS id`),
  );
  return loadLocation(tx, hospitalId, t!.id);
}

export async function arriveDispatch(
  tx: EmrTx,
  a: {
    hospitalId: string;
    issue: { id: string; toLocationId: string; requisitionId: string | null };
    note: string | null;
    confirmedBy: string;
    now: Date;
  },
): Promise<string> {
  const h = a.hospitalId;
  const [row] = await tx
    .insert(pharmacyIssueConfirmations)
    .values({
      issueId: a.issue.id,
      hospitalId: h,
      confirmedBy: a.confirmedBy,
      confirmedAt: a.now,
      note: a.note,
    })
    .returning({ id: pharmacyIssueConfirmations.id });
  const [transit, place] = [
    await transitOf(tx, h),
    await loadLocation(tx, h, a.issue.toLocationId),
  ];
  const legs = rowsOf<{ batch_id: string; qty: number; medicine_id: string; cd: boolean }>(
    await tx.execute(sql`
      SELECT m.batch_id, sum(m.quantity)::int AS qty, p.medicine_id, private.pharmacy_batch_controlled(m.batch_id) AS cd
        FROM public.pharmacy_stock_movements m
        JOIN public.pharmacy_batches b ON b.id = m.batch_id
        JOIN public.pharmacy_products p ON p.id = b.product_id
       WHERE m.source_id = ${a.issue.id}::uuid AND m.kind = 'received_from_issue' AND m.location_id = ${transit.id}::uuid
       GROUP BY 1, 3`),
  );
  for (const l of legs)
    await movePair(tx, {
      pair: "issue",
      hospitalId: h,
      from: transit,
      to: place,
      batch: await batchRef(tx, h, l.batch_id, transit.id),
      quantity: Number(l.qty),
      sourceId: a.issue.id,
      actorUserId: a.confirmedBy,
      effectiveAt: a.now,
    });
  if (a.note && legs[0])
    await tx.execute(sql`
      SELECT private.pharmacy_open_case(${h}::uuid, 'receipt', ${a.issue.id}::uuid, ${legs[0].medicine_id}, ${place.id}::uuid, 0,
        ${legs.some((l) => l.cd) ? "high" : "medium"}, ${a.confirmedBy}::uuid, ${a.now.toISOString()}::timestamptz)`);
  if (a.issue.requisitionId)
    // Closed once fully issued and every voucher against it has arrived; any note marks it.
    await tx.execute(sql`
      UPDATE public.pharmacy_requisitions r
         SET state = CASE WHEN EXISTS (SELECT 1 FROM public.pharmacy_issue_confirmations c
                                        JOIN public.pharmacy_issues i ON i.id = c.issue_id
                                       WHERE i.requisition_id = r.id AND c.note IS NOT NULL)
                          THEN 'confirmed_with_difference' ELSE 'confirmed' END,
             closed_at = ${a.now.toISOString()}::timestamptz
       WHERE r.id = ${a.issue.requisitionId}::uuid AND r.state = 'issued'
         AND NOT EXISTS (SELECT 1 FROM public.pharmacy_issues i WHERE i.requisition_id = r.id AND i.voucher IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.pharmacy_issue_confirmations c WHERE c.issue_id = i.id))`);
  return row!.id;
}
