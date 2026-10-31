import type { Reader } from "@/lib/pharmacy/cd/sql";
import type { Handover, HoPlace, Miss } from "@/lib/pharmacy/handover/derive";
import { sql } from "drizzle-orm";

import { CONTROLS_RULES as R } from "@/content/pharmacy-rework-controls";
import { d8, d8n, name, q } from "@/lib/pharmacy/cd/sql";

/**
 * Shift handover, the reads (rework PRD §6.5). The stations (stores, dispensing points, wards), the last week of
 * handovers with their count lines, and the explained misses: three queries. The dialog's draft (what to count, who is
 * on duty, the open items) is read only when the dialog opens.
 */
const WEEK = "7 days";

export async function loadHandovers(d: Reader, hospitalId: string) {
  const [places, rows, misses] = await Promise.all([
    q<HoPlace>(
      d,
      sql`SELECT id, name, kind FROM public.pharmacy_locations
           WHERE hospital_id = ${hospitalId}::uuid AND archived_at IS NULL AND kind IN ('store','dispensing_point','ward')
           ORDER BY kind <> 'ward', name`,
    ),
    q<{
      id: string; place_id: string; slot_at: string | null; at: string; accepted_at: string | null; from: string;
      to: string; to_user_id: string; keys_handed: boolean; seal_no: string | null; seal_new: boolean; items: number;
      lines: { medicineId: string; medicineName: string; controlled: boolean; expected: number; counted: number; how: string | null }[] | string;
    }>(
      d,
      sql`SELECT h.id, h.location_id AS place_id, h.slot_at, h.created_at AS at, h.accepted_at, ${name("uf")} AS "from",
                 ${name("ut")} AS "to", h.to_user_id, h.keys_handed, h.seal_no, h.seal_new,
                 (SELECT count(*)::int FROM public.pharmacy_shift_handover_items i WHERE i.handover_id = h.id) AS items,
                 coalesce((SELECT json_agg(json_build_object('medicineId', l.medicine_id,
                     'medicineName', coalesce((SELECT p.name FROM public.pharmacy_products p
                        WHERE p.hospital_id = h.hospital_id AND p.medicine_id = l.medicine_id LIMIT 1), l.medicine_id),
                     'controlled', private.pharmacy_medicine_controlled(h.hospital_id, l.medicine_id),
                     'expected', l.expected, 'counted', l.counted,
                     'how', coalesce(r.how, (SELECT cr.how FROM public.pharmacy_cd_checks c
                        JOIN public.pharmacy_control_resolutions cr ON cr.source_type = 'cd_check' AND cr.source_id = c.id
                         AND cr.medicine_id = l.medicine_id WHERE c.shift_handover_id = h.id))))
                    FROM public.pharmacy_shift_handover_lines l
                    LEFT JOIN public.pharmacy_control_resolutions r
                      ON r.source_type = 'handover' AND r.source_id = h.id AND r.medicine_id = l.medicine_id
                   WHERE l.handover_id = h.id), '[]'::json) AS lines
            FROM public.pharmacy_shift_handovers h
            LEFT JOIN public.users uf ON uf.id = h.from_user_id
            LEFT JOIN public.users ut ON ut.id = h.to_user_id
           WHERE h.hospital_id = ${hospitalId}::uuid AND h.created_at > now() - ${WEEK}::interval
           ORDER BY h.created_at DESC`,
    ),
    q<{ place_id: string; slot_at: string; why: string }>(
      d,
      sql`SELECT location_id AS place_id, slot_at, why FROM public.pharmacy_shift_handover_misses
           WHERE hospital_id = ${hospitalId}::uuid AND slot_at > now() - ${WEEK}::interval`,
    ),
  ]);
  const handovers: Handover[] = rows.map((r) => ({
    id: r.id,
    placeId: r.place_id,
    slotAt: d8n(r.slot_at),
    at: d8(r.at),
    acceptedAt: d8n(r.accepted_at),
    from: r.from ?? "",
    to: r.to ?? "",
    toUserId: r.to_user_id,
    keys: r.keys_handed,
    seal: r.seal_no,
    sealNew: r.seal_new,
    items: Number(r.items),
    lines: (typeof r.lines === "string" ? JSON.parse(r.lines) : r.lines).map(
      (l: { medicineId: string; medicineName: string; controlled: boolean; expected: number; counted: number; how: string | null }) => ({
        medicineId: l.medicineId,
        medicineName: l.medicineName,
        controlled: l.controlled,
        expected: Number(l.expected),
        counted: Number(l.counted),
        resolution: l.how ? { how: l.how } : null,
      }),
    ),
  }));
  const ms: Miss[] = misses.map((m) => ({ placeId: m.place_id, slotAt: d8(m.slot_at), why: m.why }));
  return { places, handovers, misses: ms };
}
export type HandoverData = Awaited<ReturnType<typeof loadHandovers>>;

export interface DraftItem {
  medicineId: string;
  name: string;
  controlled: boolean;
  highRisk: boolean;
  expected: number;
}

/**
 * The handover dialog's draft for one place: what to count (controlled medicines held there, and high-risk ward
 * stock), the people on duty at the slot, the last seal number and the open items (unresolved differences and open
 * cases at the place). The expected figures are hidden on screen until everything is counted.
 */
export async function handoverDraft(d: Reader, hospitalId: string, locationId: string, at: Date) {
  const [items, people, seal, open] = await Promise.all([
    q<{ medicine_id: string; name: string; controlled: boolean; kind: string; expected: number }>(
      d,
      sql`SELECT p.medicine_id, min(p.name) AS name, l.kind,
                 private.pharmacy_medicine_controlled(p.hospital_id, p.medicine_id) AS controlled,
                 sum(m.quantity)::int AS expected
            FROM public.pharmacy_stock_movements m
            JOIN public.pharmacy_batches b ON b.id = m.batch_id
            JOIN public.pharmacy_products p ON p.id = b.product_id
            JOIN public.pharmacy_locations l ON l.id = ${locationId}::uuid
           WHERE m.hospital_id = ${hospitalId}::uuid AND coalesce(m.location_id, m.dispensing_point_id) = l.id
           GROUP BY p.hospital_id, p.medicine_id, l.kind
          HAVING sum(m.quantity) > 0
           ORDER BY 2`,
    ),
    q<{ userId: string; name: string; role: string }>(
      d,
      sql`SELECT DISTINCT ON (r.user_id) r.user_id AS "userId", coalesce(u.full_name, u.email) AS name, r.role
            FROM public.pharmacy_duty_roster r JOIN public.users u ON u.id = r.user_id
            JOIN public.pharmacy_locations l ON l.id = ${locationId}::uuid
           WHERE r.hospital_id = ${hospitalId}::uuid AND r.ended_at IS NULL AND r.role <> 'doctor_on_duty'
             AND (r.location_id = l.id OR (r.location_id IS NULL AND l.kind IN ('store','dispensing_point')))
             AND private.pharmacy_on_duty(r.hospital_id, r.user_id, l.id, ${at.toISOString()}::timestamptz)
           ORDER BY r.user_id`,
    ),
    q<{ seal_no: string | null }>(
      d,
      sql`SELECT seal_no FROM public.pharmacy_shift_handovers
           WHERE hospital_id = ${hospitalId}::uuid AND location_id = ${locationId}::uuid AND seal_no IS NOT NULL
           ORDER BY created_at DESC LIMIT 1`,
    ),
    q<{ text: string }>(
      d,
      sql`SELECT coalesce((SELECT p.name FROM public.pharmacy_products p
                   WHERE p.hospital_id = c.hospital_id AND p.medicine_id = c.medicine_id LIMIT 1), c.medicine_id)
                 || ': ' || coalesce(c.what, CASE WHEN c.qty < 0 THEN (-c.qty)::text || ' short' ELSE c.qty::text || ' over' END)
                 AS text
            FROM public.pharmacy_cases c
           WHERE c.hospital_id = ${hospitalId}::uuid AND c.location_id = ${locationId}::uuid AND c.signed_off_at IS NULL
           ORDER BY c.created_at`,
    ),
  ]);
  const list: DraftItem[] = items
    .map((i) => ({
      medicineId: i.medicine_id,
      name: i.name,
      controlled: !!i.controlled,
      highRisk: i.kind === "ward" && R.highRisk.some((h) => i.name.toLowerCase().includes(h)),
      expected: Number(i.expected),
    }))
    .filter((i) => i.controlled || i.highRisk);
  return { items: list, people, seal: seal[0]?.seal_no ?? null, open: open.map((o) => o.text) };
}
export type HandoverDraft = Awaited<ReturnType<typeof handoverDraft>>;
