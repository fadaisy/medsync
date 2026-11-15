/**
 * Draft edits → the engine's own rows (ADR 0502). Pure: the publish action and the scheduled job both turn the
 * workspace's edits into `cs_publish` ops here, so a scheduled publish writes exactly what "Publish now" would.
 * Only columns `cs_publish` allows appear; anything else is refused by the database and the publish rolls back.
 */
import type {
  Clinic,
  Device,
  Edit,
  Exception,
  FeeBand,
  HolidayDecision,
  LeaveRequest,
  Person,
  Place,
  Session,
  Snapshot,
} from "./model";

import { isoDow, placesOf } from "./model";

export interface Op {
  t: string;
  op: "insert" | "update" | "delete";
  id: string;
  v?: Record<string, unknown>;
}

export interface OpCtx {
  actor: string;
  /** Today in Kampala, YYYY-MM-DD. */
  today: string;
  /** The published view the edits apply to (people's user ids, clinics' departments). */
  view: Snapshot;
  newId: () => string;
}

/** "08:30" in EAT on a civil day → an ISO instant (Kampala is UTC+3, no DST). */
const eat = (ymd: string, min: number) =>
  new Date(Date.parse(`${ymd}T00:00:00Z`) + (min - 180) * 60_000).toISOString();

const userIds = (ctx: OpCtx, personIds: string[]) =>
  personIds.map((p) => ctx.view.people[p]?.userId).filter((u): u is string => !!u);

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "clinic";

function clinicCols(c: Clinic) {
  return {
    name: c.name,
    department_id: c.departmentId,
    active: c.live,
    archived_at: null,
    short_name: c.shortName || null,
    colour: c.colour || null,
    room_place_ids: c.roomIds,
    block_place_id: c.blockId,
    place_id: c.roomIds[0] ?? null,
    tier: c.tier,
    ages: c.ages,
    patient_words: c.words || null,
    referral_required: c.referral,
    fee_mode: c.feeMode,
    fee_ugx: c.feeMode === "flat" ? c.feeUgx : null,
    fee_private_ugx: c.feeMode === "flat" ? c.feePrivateUgx : null,
    fee_overrides: c.feeOverrides,
    booking_rules: c.rules,
    pay_options: { ...c.pay, when: c.payWhen },
    paused_at: c.paused ? undefined : null,
  };
}

function sessionCols(ctx: OpCtx, x: Session) {
  const clinic = ctx.view.clinics[x.clinicId];
  const docs = userIds(ctx, x.personIds);
  const total = placesOf(x);
  return {
    service_line_id: x.clinicId,
    department_id: clinic?.departmentId,
    weekday: x.weekday,
    start_minutes_local: x.start,
    duration_minutes: x.end - x.start,
    capacity_total: total,
    capacity_booked: total - Math.round((total * x.holdPct) / 100),
    kind: x.kind,
    slot_minutes: x.kind === "times" ? x.slotMin : null,
    visit_minutes: x.visitMin,
    walk_in_hold_pct: x.holdPct,
    break_start_minutes: x.brk?.start ?? null,
    break_end_minutes: x.brk?.end ?? null,
    place_ids: x.roomIds,
    place_id: x.roomIds[0] ?? null,
    clinician_user_ids: docs,
    clinician_user_id: docs[0] ?? null,
    repeat_every_weeks: x.every,
    nth_weekday: x.nth,
    places_set: x.places != null,
    active: true,
  };
}

const drop = (v: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined));

/** The ops for one edit. A removal is never a delete of an engine row: it stops, lifts or cancels it. */
export function opsFor(e: Edit, ctx: OpCtx): Op[] {
  const before = e.before as Record<string, unknown> | null;
  const isNew = before == null;
  switch (e.entity) {
    case "clinics": {
      const c = e.after as Clinic | null;
      if (!c)
        return [
          {
            t: "service_lines",
            op: "update",
            id: e.key,
            v: { archived_at: new Date().toISOString(), active: false },
          },
        ];
      const v = drop(clinicCols(c));
      return [
        isNew
          ? {
              t: "service_lines",
              op: "insert",
              id: e.key,
              v: { ...v, slug: `${slug(c.name)}-${e.key.slice(0, 6)}`, catalogue_code: c.code },
            }
          : { t: "service_lines", op: "update", id: e.key, v },
      ];
    }
    case "sessions": {
      const x = e.after as Session | null;
      if (!x)
        return [
          {
            t: "session_templates",
            op: "update",
            id: e.key,
            v: { active: false, valid_until: ctx.today },
          },
        ];
      const v = sessionCols(ctx, x);
      return [
        isNew
          ? { t: "session_templates", op: "insert", id: e.key, v: { ...v, valid_from: ctx.today } }
          : { t: "session_templates", op: "update", id: e.key, v },
      ];
    }
    case "places": {
      const p = e.after as Place | null;
      if (!p)
        return [
          {
            t: "hospital_places",
            op: "update",
            id: e.key,
            v: { archived_at: new Date().toISOString() },
          },
        ];
      const v = { name: p.name, kind: p.kind, parent_id: p.parentId, tier: p.tier };
      return [{ t: "hospital_places", op: isNew ? "insert" : "update", id: e.key, v }];
    }
    case "people": {
      const p = e.after as Person | null;
      if (!p || isNew) return []; // people are created by the staff invite, never here (D-CS-09)
      return [
        {
          t: "staff_affiliations",
          op: "update",
          id: e.key,
          v: {
            fee_band: p.band,
            office_place_id: p.officeId,
            card_name: p.showName,
            card_photo: p.showPhoto,
            card_consent_on: p.consentOn,
            card_consent_by: p.consentBy,
          },
        },
      ];
    }
    case "devices": {
      const d = e.after as Device | null;
      if (!d)
        return [{ t: "desk_devices", op: "update", id: e.key, v: { mine_service_line_ids: [] } }];
      const v = {
        label: d.name,
        kind: d.kind,
        place: d.place,
        mine_service_line_ids: d.clinicIds,
        lock_minutes: d.lockMin,
      };
      // The row already exists: "Add a device" creates it to issue the pairing code (desk_pair_issue).
      return [{ t: "desk_devices", op: "update", id: e.key, v }];
    }
    case "exceptions":
      return exceptionOps(e, ctx);
    case "holidays": {
      const h = e.after as HolidayDecision | null;
      const b = e.before as HolidayDecision | null;
      if (!h)
        return b?.rowId ? [{ t: "hospital_holiday_decisions", op: "delete", id: b.rowId }] : [];
      if (b?.rowId)
        return [
          {
            t: "hospital_holiday_decisions",
            op: "update",
            id: b.rowId,
            v: { decision: h.decision, decided_by: ctx.actor },
          },
        ];
      return [
        {
          t: "hospital_holiday_decisions",
          op: "insert",
          id: ctx.newId(),
          v: { holiday_id: Number(h.id), decision: h.decision, decided_by: ctx.actor },
        },
      ];
    }
    case "leave": {
      const l = e.after as LeaveRequest | null;
      if (!l || l.status === "new") return [];
      return [
        {
          t: "availability_blocks",
          op: "update",
          id: e.key,
          v: {
            state: l.status === "approved" ? "active" : "declined",
            decided_by: ctx.actor,
            decided_at: new Date().toISOString(),
          },
        },
      ];
    }
    case "bands": {
      const b = e.after as FeeBand | null;
      if (!b) return [];
      const v = {
        band: b.id,
        general_ugx: b.general,
        private_ugx: b.private,
        proposed_by: ctx.actor,
        approved_by: null,
        approved_at: null,
      };
      const prev = e.before as FeeBand | null;
      return [
        prev?.rowId
          ? { t: "hospital_fee_bands", op: "update", id: prev.rowId, v }
          : { t: "hospital_fee_bands", op: "insert", id: ctx.newId(), v },
      ];
    }
  }
}

function exceptionOps(e: Edit, ctx: OpCtx): Op[] {
  const x = e.after as Exception | null;
  const b = e.before as Exception | null;
  if (!x) {
    if (!b) return [];
    if (b.type === "closed")
      return [
        {
          t: "service_closures",
          op: "update",
          id: e.key,
          v: { lifted_at: new Date().toISOString(), lifted_by: ctx.actor },
        },
      ];
    if (b.type === "away")
      return [{ t: "availability_blocks", op: "update", id: e.key, v: { state: "cancelled" } }];
    return [{ t: "session_templates", op: "update", id: e.key, v: { active: false } }];
  }
  if (b) return []; // a published exception is removed and added again, never edited in place
  if (x.type === "closed") {
    const base = {
      starts_on: x.from,
      ends_on: x.to,
      reason: x.reason.padEnd(8, "."),
      created_by: ctx.actor,
      part_start_minutes: x.part?.start ?? null,
      part_end_minutes: x.part?.end ?? null,
      booking_policy: x.policy,
    };
    if (x.clinicIds === "all")
      return [
        { t: "service_closures", op: "insert", id: e.key, v: { ...base, scope: "hospital" } },
      ];
    return x.clinicIds.map((id, i) => ({
      t: "service_closures",
      op: "insert" as const,
      id: i ? ctx.newId() : e.key,
      v: { ...base, scope: "clinic", service_line_id: id },
    }));
  }
  if (x.type === "away") {
    const p = x.personId ? ctx.view.people[x.personId] : null;
    if (!p?.userId) return [];
    return [
      {
        t: "availability_blocks",
        op: "insert",
        id: e.key,
        v: {
          clinician_user_id: p.userId,
          department_id: p.departmentId,
          kind: "leave",
          starts_at: eat(x.from, x.part?.start ?? 0),
          ends_at: eat(x.to, x.part?.end ?? 24 * 60),
          recurrence: "none",
          state: "active",
          notes: x.reason || null,
          created_by_user_id: ctx.actor,
          cover_user_id: x.coverId ? (ctx.view.people[x.coverId]?.userId ?? null) : null,
          booking_policy: x.policy,
        },
      },
    ];
  }
  const ex = x.extra;
  if (!ex) return [];
  const docs = userIds(ctx, ex.personIds);
  return [
    {
      t: "session_templates",
      op: "insert",
      id: e.key,
      v: {
        service_line_id: ex.clinicId,
        department_id: ctx.view.clinics[ex.clinicId]?.departmentId,
        weekday: isoDow(x.from),
        start_minutes_local: ex.start,
        duration_minutes: ex.end - ex.start,
        capacity_total: ex.places,
        capacity_booked: ex.places,
        valid_from: x.from,
        valid_until: x.from,
        clinician_user_ids: docs,
        clinician_user_id: docs[0] ?? null,
        place_ids: ex.roomIds ?? [],
        place_id: ex.roomIds?.[0] ?? null,
        active: true,
      },
    },
  ];
}

export function opsForChanges(edits: readonly Edit[], ctx: OpCtx): Op[] {
  return edits.flatMap((e) => opsFor(e, ctx));
}
