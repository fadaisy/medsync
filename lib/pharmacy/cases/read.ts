import type { CaseEventKind, CaseFindings } from "@/db/schema/pharmacy-rework-controls";
import type { CaseRow } from "@/lib/pharmacy/cases/derive";
import type { Reader } from "@/lib/pharmacy/cd/sql";
import { sql } from "drizzle-orm";

import { d8, d8n, name, q } from "@/lib/pharmacy/cd/sql";

/**
 * Investigations, the reads (rework PRD §6.5). Every case with its place, medicine, owner and how its number was
 * fixed (one query); one case's timeline and the people it can be assigned to only when a case is open.
 */
export async function loadCases(d: Reader, hospitalId: string): Promise<CaseRow[]> {
  const rows = await q<Record<string, unknown>>(
    d,
    sql`SELECT c.*, l.name AS place_name, ${name("uo")} AS owner, ${name("uc")} AS found_by,
               coalesce((SELECT p.name FROM public.pharmacy_products p
                  WHERE p.hospital_id = c.hospital_id AND p.medicine_id = c.medicine_id LIMIT 1), c.medicine_id) AS medicine_name,
               (SELECT r.how FROM public.pharmacy_control_resolutions r
                 WHERE r.source_type = c.source_type AND r.source_id = c.source_id AND r.medicine_id = c.medicine_id) AS fixed_how,
               EXISTS (SELECT 1 FROM public.pharmacy_cd_checks k
                        WHERE c.source_type = 'cd_check' AND k.id = c.source_id AND k.shift_handover_id IS NOT NULL) AS from_handover,
               EXISTS (SELECT 1 FROM public.pharmacy_case_events e WHERE e.case_id = c.id AND e.kind = 'escalated') AS escalated
          FROM public.pharmacy_cases c
          JOIN public.pharmacy_locations l ON l.id = c.location_id
          LEFT JOIN public.users uo ON uo.id = c.owner_user_id
          LEFT JOIN public.users uc ON uc.id = c.created_by
         WHERE c.hospital_id = ${hospitalId}::uuid
         ORDER BY c.created_at DESC`,
  );
  return rows.map((r) => ({
    id: r.id as string,
    sourceType: r.source_type as CaseRow["sourceType"],
    sourceId: (r.source_id as string | null) ?? null,
    medicineId: r.medicine_id as string,
    medicineName: r.medicine_name as string,
    placeId: r.location_id as string,
    placeName: r.place_name as string,
    qty: Number(r.qty),
    what: (r.what as string | null) ?? null,
    severity: r.severity as CaseRow["severity"],
    dueAt: d8(r.due_at),
    ownerUserId: (r.owner_user_id as string | null) ?? null,
    owner: (r.owner as string | null) ?? null,
    fixedAt: d8n(r.fixed_at),
    fixedHow: (r.fixed_how as string | null) ?? null,
    findings: (typeof r.findings === "string" ? JSON.parse(r.findings) : r.findings) as CaseFindings | null,
    submittedAt: d8n(r.submitted_at),
    signedOffAt: d8n(r.signed_off_at),
    selfSigned: !!r.self_signed,
    createdAt: d8(r.created_at),
    foundBy: (r.found_by as string | null) ?? "",
    fromHandover: !!r.from_handover,
    escalated: !!r.escalated,
  }));
}

export interface CaseEventRow {
  kind: CaseEventKind;
  what: string | null;
  note: string | null;
  by: string;
  at: Date;
}

/** One case's timeline (an assignment names its owner) and the people on the roster it can go to. */
export async function caseDetail(d: Reader, hospitalId: string, caseId: string) {
  const [events, people] = await Promise.all([
    q<{ kind: CaseEventKind; what: string | null; note: string | null; by: string | null; at: string }>(
      d,
      sql`SELECT e.kind, CASE WHEN e.kind = 'assigned' THEN coalesce(${name("ua")}, e.what) ELSE e.what END AS what,
                 e.note, ${name("u")} AS by, e.created_at AS at
            FROM public.pharmacy_case_events e
            LEFT JOIN public.users u ON u.id = e.actor_user_id
            LEFT JOIN public.users ua ON e.kind = 'assigned' AND ua.id::text = e.what
           WHERE e.case_id = ${caseId}::uuid AND e.hospital_id = ${hospitalId}::uuid
           ORDER BY e.created_at, e.id`,
    ),
    q<{ userId: string; name: string; ward: boolean }>(
      d,
      sql`SELECT DISTINCT ON (r.user_id) r.user_id AS "userId", coalesce(u.full_name, u.email) AS name,
                 r.role IN ('second_nurse','nurse_in_charge','epi_nurse') AS ward
            FROM public.pharmacy_duty_roster r JOIN public.users u ON u.id = r.user_id
           WHERE r.hospital_id = ${hospitalId}::uuid AND r.ended_at IS NULL AND r.role <> 'doctor_on_duty'
             AND r.date_to >= current_date - 1
           ORDER BY r.user_id`,
    ),
  ]);
  return {
    events: events.map((e): CaseEventRow => ({ ...e, by: e.by ?? "", at: d8(e.at) })),
    people: people.sort((a, b) => a.name.localeCompare(b.name)),
  };
}
export type CaseDetail = Awaited<ReturnType<typeof caseDetail>>;

/** For "Report a discrepancy": the controlled or high-risk medicines held at each place. */
export async function caseMedicines(d: Reader, hospitalId: string) {
  return q<{ placeId: string; place: string; medicineId: string; name: string; controlled: boolean }>(
    d,
    sql`SELECT DISTINCT ON (l.id, p.medicine_id) l.id AS "placeId", l.name AS place, p.medicine_id AS "medicineId", p.name,
               private.pharmacy_medicine_controlled(p.hospital_id, p.medicine_id) AS controlled
          FROM public.pharmacy_stock_movements m
          JOIN public.pharmacy_batches b ON b.id = m.batch_id
          JOIN public.pharmacy_products p ON p.id = b.product_id
          JOIN public.pharmacy_locations l ON l.id = coalesce(m.location_id, m.dispensing_point_id)
         WHERE m.hospital_id = ${hospitalId}::uuid AND l.archived_at IS NULL
         ORDER BY l.id, p.medicine_id`,
  );
}
