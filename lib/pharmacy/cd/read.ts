import type { CdCheck, CdEvent, CdMove, CdPlace } from "@/lib/pharmacy/cd/derive";
import type { Reader } from "@/lib/pharmacy/cd/sql";
import { sql } from "drizzle-orm";

import { d8, name, q } from "@/lib/pharmacy/cd/sql";

/**
 * Controlled drugs, the reads (rework PRD §6.5). Every controlled ledger line at the hospital with its dose and later
 * events, every balance check with its lines, resolutions and cases, and the places. Three queries; the registers,
 * balances and flags are derived from them (lib/pharmacy/cd/derive). Read through the server connection.
 */

interface MoveRow {
  id: string;
  at: string;
  recorded_at: string;
  kind: string;
  qty: number;
  medicine_id: string;
  medicine_name: string;
  place_id: string;
  by: string | null;
  witness: string | null;
  paper_witness_name: string | null;
  late: boolean;
  note: string | null;
  reversed: boolean;
  dose_id: string | null;
  patient_label: string | null;
  bed: string | null;
  prescriber: string | null;
  given_by: string | null;
  dose_mg: string | null;
  route: string | null;
  residue_mg: string | null;
  residue_disposed: boolean | null;
  late_entry: boolean | null;
  events:
    | {
        kind: CdEvent["kind"];
        at: string;
        by: string | null;
        reason: string | null;
        witness: string | null;
      }[]
    | string;
}

interface CheckRow {
  id: string;
  at: string;
  place_id: string;
  by: string | null;
  witness: string | null;
  handover: boolean;
  lines:
    | string
    | {
        medicineId: string;
        expected: number;
        counted: number;
        resolution: { how: string; at: string; by: string | null } | null;
        case: { owner: string | null; dueAt: string; closed: boolean } | null;
      }[];
}

const json = <T>(v: T | string): T => (typeof v === "string" ? (JSON.parse(v) as T) : v);

export type CaseWord = { owner: string | null; dueAt: Date; closed: boolean };

export async function loadCd(d: Reader, hospitalId: string) {
  const [moveRows, checkRows, placeRows] = await Promise.all([
    q<MoveRow>(
      d,
      sql`WITH cp AS (
            SELECT p.id, p.medicine_id, p.name FROM public.pharmacy_products p
             WHERE p.hospital_id = ${hospitalId}::uuid AND private.pharmacy_medicine_controlled(p.hospital_id, p.medicine_id))
          SELECT m.id, m.effective_at AS at, m.recorded_at, m.kind, m.quantity AS qty, cp.medicine_id, cp.name AS medicine_name,
                 coalesce(m.location_id, m.dispensing_point_id) AS place_id, ${name("ua")} AS by, ${name("uw")} AS witness,
                 m.paper_witness_name, m.late, m.reason_note AS note,
                 EXISTS (SELECT 1 FROM public.pharmacy_stock_movements r WHERE r.reverses_id = m.id) AS reversed,
                 d.id AS dose_id, d.patient_label, d.bed, ${name("up")} AS prescriber, ${name("ug")} AS given_by,
                 d.dose_mg, d.route, d.residue_mg, d.residue_disposed, d.late_entry,
                 (SELECT coalesce(json_agg(json_build_object('kind', e.kind, 'at', e.created_at, 'by', ${name("ue")},
                           'reason', e.reason, 'witness', ${name("uew")}) ORDER BY e.created_at), '[]'::json)
                    FROM public.pharmacy_cd_events e
                    LEFT JOIN public.users ue ON ue.id = e.actor_user_id
                    LEFT JOIN public.pharmacy_attestations ea ON ea.id = e.witness_attestation_id
                    LEFT JOIN public.users uew ON uew.id = ea.attester_user_id
                   WHERE e.movement_id = m.id) AS events
            FROM public.pharmacy_stock_movements m
            JOIN public.pharmacy_batches b ON b.id = m.batch_id
            JOIN cp ON cp.id = b.product_id
            LEFT JOIN public.users ua ON ua.id = m.actor_user_id
            LEFT JOIN public.pharmacy_attestations a ON a.id = m.witness_attestation_id
            LEFT JOIN public.users uw ON uw.id = a.attester_user_id
            LEFT JOIN public.pharmacy_cd_doses d ON d.id = m.source_id AND m.reason_code = 'cd_dose'
            LEFT JOIN public.users up ON up.id = d.prescriber_user_id
            LEFT JOIN public.users ug ON ug.id = d.given_by_user_id
           WHERE m.hospital_id = ${hospitalId}::uuid
           ORDER BY m.effective_at, m.recorded_at`,
    ),
    q<CheckRow>(
      d,
      sql`SELECT c.id, c.created_at AS at, c.location_id AS place_id, ${name("u")} AS by,
                 coalesce(${name("uw")}, c.paper_witness_name, ${name("uh")}) AS witness,
                 c.shift_handover_id IS NOT NULL AS handover,
                 (SELECT json_agg(json_build_object('medicineId', l.medicine_id, 'expected', l.expected, 'counted', l.counted,
                     'resolution', CASE WHEN r.how IS NULL THEN NULL
                       ELSE json_build_object('how', r.how, 'at', r.resolved_at, 'by', ${name("ur")}) END,
                     'case', CASE WHEN pc.id IS NULL THEN NULL
                       ELSE json_build_object('owner', ${name("uo")}, 'dueAt', pc.due_at, 'closed', pc.signed_off_at IS NOT NULL) END)
                     ORDER BY l.medicine_id)
                    FROM public.pharmacy_cd_check_lines l
                    LEFT JOIN public.pharmacy_control_resolutions r
                      ON r.source_type = 'cd_check' AND r.source_id = c.id AND r.medicine_id = l.medicine_id
                    LEFT JOIN public.users ur ON ur.id = r.resolved_by
                    LEFT JOIN public.pharmacy_cases pc
                      ON pc.source_type = 'cd_check' AND pc.source_id = c.id AND pc.medicine_id = l.medicine_id
                    LEFT JOIN public.users uo ON uo.id = pc.owner_user_id
                   WHERE l.check_id = c.id) AS lines
            FROM public.pharmacy_cd_checks c
            LEFT JOIN public.users u ON u.id = c.checked_by
            LEFT JOIN public.pharmacy_attestations a ON a.id = c.witness_attestation_id
            LEFT JOIN public.users uw ON uw.id = a.attester_user_id
            LEFT JOIN public.pharmacy_shift_handovers h ON h.id = c.shift_handover_id
            LEFT JOIN public.users uh ON uh.id = h.to_user_id
           WHERE c.hospital_id = ${hospitalId}::uuid
           ORDER BY c.created_at DESC`,
    ),
    q<{ id: string; name: string; kind: string }>(
      d,
      sql`SELECT id, name, kind FROM public.pharmacy_locations
           WHERE hospital_id = ${hospitalId}::uuid AND archived_at IS NULL ORDER BY name`,
    ),
  ]);
  const moves: CdMove[] = moveRows.map((r) => ({
    id: r.id,
    at: d8(r.at),
    recordedAt: d8(r.recorded_at),
    kind: r.kind,
    qty: Number(r.qty),
    medicineId: r.medicine_id,
    medicineName: r.medicine_name,
    placeId: r.place_id,
    by: r.by ?? "",
    witness: r.witness,
    paperWitness: r.paper_witness_name,
    late: !!r.late,
    reversed: !!r.reversed,
    note: r.note,
    dose: r.dose_id
      ? {
          id: r.dose_id,
          patient: r.patient_label ?? "",
          bed: r.bed,
          prescriber: r.prescriber ?? "",
          givenBy: r.given_by,
          doseMg: Number(r.dose_mg),
          route: r.route ?? "",
          residueMg: Number(r.residue_mg),
          residueDisposed: !!r.residue_disposed,
          lateEntry: !!r.late_entry,
        }
      : null,
    events: json(r.events).map((e) => ({ ...e, at: d8(e.at), by: e.by ?? "" })),
  }));
  const cases = new Map<string, CaseWord>();
  const checks: CdCheck[] = checkRows.map((r) => ({
    id: r.id,
    at: d8(r.at),
    placeId: r.place_id,
    by: r.by ?? "",
    witness: r.witness,
    handover: !!r.handover,
    lines: (json(r.lines) ?? []).map((l) => {
      if (l.case)
        cases.set(`${r.id}|${l.medicineId}`, {
          owner: l.case.owner,
          dueAt: d8(l.case.dueAt),
          closed: l.case.closed,
        });
      return {
        medicineId: l.medicineId,
        expected: Number(l.expected),
        counted: Number(l.counted),
        resolution: l.resolution
          ? { how: l.resolution.how, at: d8(l.resolution.at), by: l.resolution.by ?? "" }
          : null,
      };
    }),
  }));
  const places: CdPlace[] = placeRows;
  return { moves, checks, places, cases };
}

export type CdData = Awaited<ReturnType<typeof loadCd>>;

/** For the dose dialog: patients on the ward now (admissions arrived), with the clinician who admitted them. */
export async function wardPatients(d: Reader, hospitalId: string, locationId: string) {
  return q<{ userId: string; name: string; admittedBy: string | null }>(
    d,
    sql`SELECT a.patient_user_id AS "userId", coalesce(u.full_name, 'Patient') AS name, a.decided_by AS "admittedBy"
          FROM public.admissions a
          JOIN public.pharmacy_locations l ON l.ward_id = a.ward_id AND l.id = ${locationId}::uuid
          LEFT JOIN public.users u ON u.id = a.patient_user_id
         WHERE a.hospital_id = ${hospitalId}::uuid AND a.status = 'arrived'
         ORDER BY name`,
  );
}

/** Staff allowed to prescribe this controlled medicine (latest line per person); the place's own team first. */
export async function cdPrescribers(
  d: Reader,
  hospitalId: string,
  medicineId: string,
  locationId: string,
) {
  return q<{ userId: string; name: string; department: string | null; own: boolean }>(
    d,
    sql`SELECT x.user_id AS "userId", coalesce(u.full_name, u.email) AS name, x.department,
               coalesce(x.department = hd.name, false) AS own
          FROM (SELECT DISTINCT ON (user_id) * FROM public.pharmacy_cd_prescribers
                 WHERE hospital_id = ${hospitalId}::uuid ORDER BY user_id, created_at DESC) x
          JOIN public.users u ON u.id = x.user_id
          LEFT JOIN public.pharmacy_locations l ON l.id = ${locationId}::uuid
          LEFT JOIN public.hospital_departments hd ON hd.id = l.department_id
         WHERE x.cd_allowed AND (cardinality(x.only_medicines) = 0 OR ${medicineId} = ANY (x.only_medicines))
         ORDER BY own DESC, name`,
  );
}

/** The place's people on the roster (nurses on a ward, pharmacy staff elsewhere), for "given by" and taking over. */
export async function rosterAt(d: Reader, hospitalId: string, locationId: string, at: Date) {
  return q<{ userId: string; name: string; role: string; shift: string; onDuty: boolean }>(
    d,
    sql`SELECT DISTINCT ON (r.user_id) r.user_id AS "userId", coalesce(u.full_name, u.email) AS name, r.role, r.shift,
               private.pharmacy_on_duty(r.hospital_id, r.user_id, ${locationId}::uuid, ${at.toISOString()}::timestamptz)
                 AS "onDuty"
          FROM public.pharmacy_duty_roster r JOIN public.users u ON u.id = r.user_id
          JOIN public.pharmacy_locations l ON l.id = ${locationId}::uuid
         WHERE r.hospital_id = ${hospitalId}::uuid AND r.ended_at IS NULL AND r.role <> 'doctor_on_duty'
           AND (r.location_id = l.id OR (r.location_id IS NULL AND l.kind IN ('store','dispensing_point')))
           AND (${at.toISOString()}::timestamptz AT TIME ZONE 'Africa/Kampala')::date BETWEEN r.date_from AND r.date_to + 1
         ORDER BY r.user_id, name`,
  );
}

/** The controlled registers held at one place, with their balances (the nurse's dose screen). */
export async function placeRegisters(d: Reader, hospitalId: string, locationId: string) {
  return q<{ medicineId: string; name: string; balance: number }>(
    d,
    sql`SELECT p.medicine_id AS "medicineId", min(p.name) AS name, sum(m.quantity)::int AS balance
          FROM public.pharmacy_stock_movements m
          JOIN public.pharmacy_batches b ON b.id = m.batch_id
          JOIN public.pharmacy_products p ON p.id = b.product_id
         WHERE m.hospital_id = ${hospitalId}::uuid AND coalesce(m.location_id, m.dispensing_point_id) = ${locationId}::uuid
           AND private.pharmacy_medicine_controlled(p.hospital_id, p.medicine_id)
         GROUP BY p.medicine_id ORDER BY 2`,
  );
}
