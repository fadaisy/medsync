import "server-only";

import { and, asc, count, desc, eq, gte, ilike, inArray, lt } from "drizzle-orm";

import { db } from "@/db";
import { clinicalPhiAccessLog } from "@/db/schema/doctor-workspace";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { hospitals } from "@/db/schema/hospitals";
import { patientIntakes } from "@/db/schema/patient-intakes";
import { patientProfiles } from "@/db/schema/patient-profiles";
import { appointments } from "@/db/schema/scheduling";
import { users } from "@/db/schema/users";
import { decrypt } from "@/lib/encryption";
import { presenceAt, presenceOf } from "@/lib/intake/queries";
import { logger } from "@/lib/logger";
import {
  DEFAULT_TIME_ZONE,
  endOfLocalDay,
  startOfLocalDay,
} from "@/supabase/functions/_shared/slots";

/**
 * Reception query layer. All reads are STRICTLY operational +
 * demographic — no clinical-content joins. The clinical-content RLS
 * widening in migration 0033 enforces the same boundary at the DB,
 * so even if these helpers grew a buggy join the DB would deny it.
 *
 * Patient names ARE revealed here, narrowly and audited — see the
 * operational name-reveal block below. Everything else stays
 * `patient_code`.
 */

/* ─── Audited operational name reveal (ADR 0084 §11) ────────────── */

/**
 * A patient who declared from home walks up to the desk and says their name.
 * The clerk holds a `patient_code` that exists only on the patient's phone —
 * which may be a relative's, at home, or flat. Unable to match the row, the
 * clerk registers a fresh walk-in: the declared row becomes a ghost and the
 * patient is counted, queued and later clerked twice under two identities.
 *
 * So reception gets names. The scope is drawn as tightly as the job allows:
 *
 *   WHAT — first name + surname, and nothing else. ADR 0032 §2 already grants
 *   reception `patient_code`, `sex` and `date_of_birth` (plaintext columns);
 *   the encrypted set is name, phone, ID number, village address and
 *   next-of-kin. Only the name is needed to match a person who is standing in
 *   front of you, so only the name opens. Phone and address would serve
 *   chasing a no-show, which is not a thing this product does yet, and would
 *   be a larger reveal than the task justifies.
 *
 *   WHO — rows that are already on TODAY'S BOARD at the caller's own
 *   hospital. This is enforced structurally, by the WHERE clause of the query
 *   that loads the rows, not by a separate permission check a later caller
 *   could forget or race: there is no code path here that can name a patient
 *   who is not on the board. Deliberately NOT a hospital-wide
 *   patient-search-by-name.
 *
 *   WHY it is not clinical — reception is a non-clinical cadre (ADR 0032) and
 *   the basis is operational: matching a person to a queue ticket at a desk.
 *   It carries no clinical content and grants none; the RLS widening in
 *   migration 0033 still denies reception every clinical-content table.
 *
 * Every revealed name writes one `clinical_phi_access_log` row, and the
 * reveal FAILS CLOSED if that write fails — the doctor path's contract
 * (`fetchPatientSummaryAudited`), not the triage worklist's best-effort one.
 * Triage may proceed unaudited because blocking a nurse's queue is itself a
 * clinical risk; a front-desk lookup has no such claim, and this is the only
 * record that a non-clinical actor read PHI.
 */

/**
 * ponytail: reception's honest basis is "on this hospital's board today", but
 * `phi_access_basis_check` only permits the four clinical values, so we map
 * onto the nearest and carry the true basis in `surface` — exactly as
 * lib/nurse/patient-access.ts maps its four nursing bases onto two enum
 * values. CEILING: an audit query filtering on `access_basis` alone cannot
 * tell a front-desk name match from a clinician's department read; it has to
 * match `surface LIKE '%#operational_today'`. UPGRADE PATH: additive
 * migration widening the CHECK with 'operational_today', write it directly,
 * backfill from `surface`.
 */
const OPERATIONAL_BASIS_SUFFIX = "#operational_today";

/** Decrypt "First Surname". Null when the patient is unidentified or the
 * payload/key is unusable — never throws into a front-desk page. */
function decryptName(first: string | null, surname: string | null): string | null {
  if (!first || !surname) return null;
  try {
    return `${decrypt(first)} ${decrypt(surname)}`.trim();
  } catch (e) {
    logger.warn("reception.name_reveal.decrypt_failed", { reason: String(e) });
    return null;
  }
}

/** One append-only log row per patient named. Returns false if the audit
 * could not be written, in which case the caller MUST withhold the names. */
async function auditNameReveals(args: {
  hospitalId: string;
  receptionUserId: string;
  surface: string;
  patientUserIds: ReadonlyArray<string>;
}): Promise<boolean> {
  const unique = [...new Set(args.patientUserIds)];
  if (unique.length === 0) return true;
  try {
    await db.insert(clinicalPhiAccessLog).values(
      unique.map((patientUserId) => ({
        hospitalId: args.hospitalId,
        clinicianUserId: args.receptionUserId,
        patientUserId,
        accessBasis: "department_recent" as const,
        surface: `${args.surface}${OPERATIONAL_BASIS_SUFFIX}`,
      })),
    );
    return true;
  } catch (e) {
    logger.error("reception.name_reveal.audit_failed", {
      reason: String(e),
      surface: args.surface,
      count: unique.length,
    });
    return false;
  }
}

/* ─── Today's front-desk counts ─────────────────────────────────── */

export interface ReceptionTodayCounts {
  expectedToday: number;
  arrivedToday: number;
  awaitingTriage: number;
  noShowsToday: number;
  /** Patient-declared intakes that haven't been checked in yet
   * (status='declared', book-or-queue migration 0035). Reception's
   * cue that someone said "I'm coming today" but isn't here yet. */
  declaredToday: number;
}

export async function fetchReceptionTodayCounts(args: {
  hospitalId: string;
}): Promise<ReceptionTodayCounts> {
  // The hospital's day, not the host's (UTC on Vercel — 03:00 EAT).
  const now = new Date();
  const start = startOfLocalDay(now, DEFAULT_TIME_ZONE);
  const end = endOfLocalDay(now, DEFAULT_TIME_ZONE);

  const [expected, arrived, awaiting, noShows, declared] = await Promise.all([
    db
      .select({ n: count() })
      .from(appointments)
      .where(
        and(
          eq(appointments.hospitalId, args.hospitalId),
          gte(appointments.startsAt, start),
          lt(appointments.startsAt, end),
          inArray(appointments.status, ["confirmed", "pending_approval", "requested"]),
        ),
      ),
    db
      .select({ n: count() })
      .from(appointments)
      .where(
        and(
          eq(appointments.hospitalId, args.hospitalId),
          gte(appointments.startsAt, start),
          lt(appointments.startsAt, end),
          inArray(appointments.status, ["arrived", "in_progress", "completed"]),
        ),
      ),
    db
      .select({ n: count() })
      .from(patientIntakes)
      .where(
        and(
          eq(patientIntakes.hospitalId, args.hospitalId),
          inArray(patientIntakes.status, ["arrived", "awaiting_triage"]),
          // Windowed on presence like every sibling count in this function.
          // Unbounded, one intake that never progressed past awaiting_triage
          // inflated "Awaiting triage" under the "Today counts" heading
          // forever — a number the database could not prove was today's.
          gte(presenceAt, start),
          lt(presenceAt, end),
        ),
      ),
    db
      .select({ n: count() })
      .from(appointments)
      .where(
        and(
          eq(appointments.hospitalId, args.hospitalId),
          gte(appointments.startsAt, start),
          lt(appointments.startsAt, end),
          eq(appointments.status, "no_show"),
        ),
      ),
    db
      .select({ n: count() })
      .from(patientIntakes)
      .where(
        and(
          eq(patientIntakes.hospitalId, args.hospitalId),
          eq(patientIntakes.status, "declared"),
          gte(patientIntakes.arrivedAt, start),
          lt(patientIntakes.arrivedAt, end),
        ),
      ),
  ]);

  return {
    expectedToday: Number(expected[0]?.n ?? 0),
    arrivedToday: Number(arrived[0]?.n ?? 0),
    awaitingTriage: Number(awaiting[0]?.n ?? 0),
    noShowsToday: Number(noShows[0]?.n ?? 0),
    declaredToday: Number(declared[0]?.n ?? 0),
  };
}

/* ─── Expected arrivals (today, or a chosen date) ───────────────── */

export interface ExpectedArrival {
  id: string;
  startsAtIso: string;
  status: string;
  type: string;
  patientUserId: string;
  patientCode: string;
  clinicianName: string | null;
  departmentName: string | null;
}

export async function fetchExpectedArrivals(args: {
  hospitalId: string;
  date?: Date;
  limit?: number;
}): Promise<ExpectedArrival[]> {
  // The hospital's day containing `date` (a `?date=YYYY-MM-DD` parses as
  // UTC midnight = 03:00 EAT, which lands on the right Kampala day).
  const on = args.date ?? new Date();
  const start = startOfLocalDay(on, DEFAULT_TIME_ZONE);
  const end = endOfLocalDay(on, DEFAULT_TIME_ZONE);

  const rows = await db
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      status: appointments.status,
      type: appointments.type,
      patientUserId: appointments.patientUserId,
      patientCode: patientProfiles.patientCode,
      clinicianName: users.fullName,
      departmentName: hospitalDepartments.name,
    })
    .from(appointments)
    .innerJoin(patientProfiles, eq(patientProfiles.id, appointments.patientUserId))
    .leftJoin(users, eq(users.id, appointments.clinicianUserId))
    .leftJoin(hospitalDepartments, eq(hospitalDepartments.id, appointments.departmentId))
    .where(
      and(
        eq(appointments.hospitalId, args.hospitalId),
        gte(appointments.startsAt, start),
        lt(appointments.startsAt, end),
        inArray(appointments.status, [
          "confirmed",
          "pending_approval",
          "requested",
          "arrived",
          "in_progress",
          "completed",
          "no_show",
        ]),
      ),
    )
    .orderBy(asc(appointments.startsAt))
    .limit(args.limit ?? 100);

  return rows.map((r) => ({
    id: r.id,
    startsAtIso: r.startsAt.toISOString(),
    status: r.status,
    type: r.type,
    patientUserId: r.patientUserId,
    patientCode: r.patientCode,
    clinicianName: r.clinicianName,
    departmentName: r.departmentName,
  }));
}

/* ─── Patient search (operational identifiers only) ─────────────── */

export interface ReceptionPatientHit {
  patientUserId: string;
  patientCode: string;
  sex: string;
  dateOfBirth: string;
  primaryHospitalName: string | null;
}

/**
 * Search by patient_code (exact-prefix). Name + phone are encrypted
 * at rest; a name-search Edge Function is the separate audited path
 * deferred from this PR. For MVP reception searches by code only —
 * which is the lookup the front desk does 95% of the time anyway
 * (patient hands over their MedSync card / states their code).
 */
export async function searchPatientsByCode(args: {
  hospitalId: string;
  query: string;
  limit?: number;
}): Promise<ReceptionPatientHit[]> {
  const q = args.query.trim();
  if (q.length < 3) return [];

  const rows = await db
    .select({
      patientUserId: patientProfiles.id,
      patientCode: patientProfiles.patientCode,
      sex: patientProfiles.sex,
      dateOfBirth: patientProfiles.dateOfBirth,
      primaryHospitalId: patientProfiles.primaryFacilityId,
      primaryHospitalName: hospitals.name,
    })
    .from(patientProfiles)
    .leftJoin(hospitals, eq(hospitals.id, patientProfiles.primaryFacilityId))
    .where(ilike(patientProfiles.patientCode, `${q}%`))
    .orderBy(asc(patientProfiles.patientCode))
    .limit(args.limit ?? 20);

  // Surface order: this-hospital primary first, then others.
  rows.sort((a, b) => {
    const aHere = a.primaryHospitalId === args.hospitalId ? 0 : 1;
    const bHere = b.primaryHospitalId === args.hospitalId ? 0 : 1;
    return aHere - bHere;
  });

  return rows.map((r) => ({
    patientUserId: r.patientUserId,
    patientCode: r.patientCode,
    sex: r.sex,
    dateOfBirth: r.dateOfBirth,
    primaryHospitalName: r.primaryHospitalName,
  }));
}

/* ─── Today's declared queue tickets (book-or-queue, mig 0035) ──── */

export interface DeclaredIntakeRow {
  id: string;
  patientCode: string | null;
  patientUserId: string | null;
  /** Decrypted "First Surname" — the audited operational reveal (ADR 0084
   * §11). Null for an unidentified patient, or when the audit write failed
   * and the reveal was withheld. Render `patientCode` as the fallback. */
  displayName: string | null;
  declaredAtIso: string;
  departmentId: string | null;
  departmentName: string | null;
  presentingComplaint: string | null;
}

/**
 * Patient-initiated intakes that are still in 'declared' (haven't been
 * checked in). Reception's "we know they're on their way" list — feeds
 * the Check-in affordance on /reception/expected.
 *
 * Names are revealed and audited: a clerk who cannot match the person at the
 * desk to a row creates a duplicate identity (ADR 0084 §11).
 */
export async function fetchDeclaredIntakesToday(args: {
  hospitalId: string;
  /** The scoped receptionist — required to audit the name reveals. */
  receptionUserId: string;
  limit?: number;
}): Promise<DeclaredIntakeRow[]> {
  const now = new Date();
  const start = startOfLocalDay(now, DEFAULT_TIME_ZONE);
  const end = endOfLocalDay(now, DEFAULT_TIME_ZONE);

  const rows = await db
    .select({
      id: patientIntakes.id,
      patientUserId: patientIntakes.patientUserId,
      patientCode: patientProfiles.patientCode,
      firstNameEncrypted: patientProfiles.firstNameEncrypted,
      surnameEncrypted: patientProfiles.surnameEncrypted,
      declaredAt: patientIntakes.arrivedAt,
      departmentId: patientIntakes.receivingDepartmentId,
      departmentName: hospitalDepartments.name,
      presentingComplaint: patientIntakes.presentingComplaint,
    })
    .from(patientIntakes)
    .leftJoin(patientProfiles, eq(patientProfiles.id, patientIntakes.patientUserId))
    .leftJoin(hospitalDepartments, eq(hospitalDepartments.id, patientIntakes.receivingDepartmentId))
    .where(
      and(
        eq(patientIntakes.hospitalId, args.hospitalId),
        eq(patientIntakes.status, "declared"),
        gte(patientIntakes.arrivedAt, start),
        lt(patientIntakes.arrivedAt, end),
      ),
    )
    // Earliest declaration leads: this is a queue the desk works top-down,
    // not a log. (On a still-declared row `checked_in_at` is null, so
    // `arrived_at` IS the declaration — no presence split to make here.)
    .orderBy(asc(patientIntakes.arrivedAt))
    .limit(args.limit ?? 100);

  const named = rows.map((r) => ({
    id: r.id,
    patientCode: r.patientCode,
    patientUserId: r.patientUserId,
    displayName: r.patientUserId ? decryptName(r.firstNameEncrypted, r.surnameEncrypted) : null,
    declaredAtIso: r.declaredAt.toISOString(),
    departmentId: r.departmentId,
    departmentName: r.departmentName,
    presentingComplaint: r.presentingComplaint,
  }));

  const revealed = named.filter((r) => r.displayName && r.patientUserId);
  const audited = await auditNameReveals({
    hospitalId: args.hospitalId,
    receptionUserId: args.receptionUserId,
    surface: "reception_declared_list",
    patientUserIds: revealed.map((r) => r.patientUserId!),
  });
  // Fail closed: unaudited PHI is not shown. The list still renders, on
  // patient codes, so check-in keeps working.
  return audited ? named : named.map((r) => ({ ...r, displayName: null }));
}

/* ─── Find a person on today's board (ADR 0084 §11) ─────────────── */

export interface BoardSearchHit {
  intakeId: string;
  patientUserId: string;
  patientCode: string | null;
  /** Decrypted "First Surname" — the reveal this search exists for. */
  displayName: string;
  status: string;
  declaredByPatient: boolean;
  /** `coalesce(checked_in_at, arrived_at)` — when they got here, or when
   * they declared if they haven't. */
  presenceAtIso: string;
  departmentName: string | null;
}

/**
 * ponytail: a linear scan of today's board, decrypting to match. Names are
 * AES-256-GCM with a random IV (lib/encryption.ts), so there is no SQL
 * predicate and no index that can match one — searching means decrypting
 * candidates. Bounding the candidate set to one hospital's board for one day
 * is what makes that affordable, and is the same boundary that makes the
 * reveal justifiable at all. CEILING: BOARD_SCAN_ROWS rows per keystroke-load
 * (~2ms of AES at Mulago OPD volumes); a board larger than that silently
 * truncates to the longest-present rows. UPGRADE PATH: a blind index — a
 * deterministic HMAC of the normalised surname in its own column — which is a
 * schema change plus a backfill, and buys nothing until the scan hurts.
 */
const BOARD_SCAN_ROWS = 500;

/**
 * Match a person standing at the desk to a row on today's board, BY NAME.
 * Scoped to live intakes at the caller's hospital today — not a hospital-wide
 * patient search. Every name handed back is audited; if the audit cannot be
 * written, nothing is handed back.
 *
 * Name only, deliberately: patient codes share a prefix, so letting the query
 * match them would turn `MS-` into "show me everyone on the board" — a bulk
 * reveal wearing a search box. Codes are already served by
 * `searchPatientsByCode`, which needs no reveal at all.
 */
export async function searchTodaysBoard(args: {
  hospitalId: string;
  /** The scoped receptionist — required to audit the name reveals. */
  receptionUserId: string;
  query: string;
  limit?: number;
}): Promise<BoardSearchHit[]> {
  const q = args.query.trim().toLowerCase();
  // Same floor as the code search.
  if (q.length < 3) return [];
  const limit = args.limit ?? 20;

  const now = new Date();
  const start = startOfLocalDay(now, DEFAULT_TIME_ZONE);
  const end = endOfLocalDay(now, DEFAULT_TIME_ZONE);

  const rows = await db
    .select({
      intakeId: patientIntakes.id,
      patientUserId: patientIntakes.patientUserId,
      patientCode: patientProfiles.patientCode,
      firstNameEncrypted: patientProfiles.firstNameEncrypted,
      surnameEncrypted: patientProfiles.surnameEncrypted,
      status: patientIntakes.status,
      declaredByPatient: patientIntakes.declaredByPatient,
      arrivedAt: patientIntakes.arrivedAt,
      checkedInAt: patientIntakes.checkedInAt,
      departmentName: hospitalDepartments.name,
    })
    .from(patientIntakes)
    // innerJoin: an unknown-patient intake has no profile and no name to
    // match on — it is found by its label on the flow board, not here.
    .innerJoin(patientProfiles, eq(patientProfiles.id, patientIntakes.patientUserId))
    .leftJoin(hospitalDepartments, eq(hospitalDepartments.id, patientIntakes.receivingDepartmentId))
    .where(
      and(
        eq(patientIntakes.hospitalId, args.hospitalId),
        inArray(patientIntakes.status, ["declared", "arrived", "awaiting_triage", "triaged"]),
        gte(presenceAt, start),
        lt(presenceAt, end),
      ),
    )
    .orderBy(presenceAt)
    .limit(BOARD_SCAN_ROWS);

  const hits: BoardSearchHit[] = [];
  for (const r of rows) {
    if (!r.patientUserId) continue;
    // Decrypt-to-match is transient and never leaves this process. Only rows
    // handed back to the caller are a reveal, and only those are audited —
    // logging the whole board on every page load would be both noise and a
    // false record of what the clerk saw.
    const displayName = decryptName(r.firstNameEncrypted, r.surnameEncrypted);
    if (!displayName) continue;
    if (!displayName.toLowerCase().includes(q)) continue;
    hits.push({
      intakeId: r.intakeId,
      patientUserId: r.patientUserId,
      patientCode: r.patientCode,
      displayName,
      status: r.status,
      declaredByPatient: r.declaredByPatient,
      presenceAtIso: presenceOf(r).toISOString(),
      departmentName: r.departmentName,
    });
    if (hits.length >= limit) break;
  }

  if (hits.length === 0) return [];
  const audited = await auditNameReveals({
    hospitalId: args.hospitalId,
    receptionUserId: args.receptionUserId,
    surface: "reception_board_search",
    patientUserIds: hits.map((h) => h.patientUserId),
  });
  return audited ? hits : [];
}

/* ─── Today's flow status board (operational only) ──────────────── */

export interface FlowRow {
  patientUserId: string | null;
  patientCode: string | null;
  patientUnknownLabel: string | null;
  /** `declared` = patient-initiated queue ticket, not yet physically
   * present. Distinct from `expected` (booked appointment, not yet
   * arrived) and `arrived` (here, not yet in a triage queue).
   * Migration 0035. */
  stage: "declared" | "expected" | "arrived" | "in_queue" | "awaiting_triage";
  departmentName: string | null;
  whenIso: string;
  detail: string;
  /** Set when this row came from a patient_intakes row in 'declared'
   * status — gives the reception UI an ID to wire a Check-in button. */
  declaredIntakeId: string | null;
}

export async function fetchTodayFlow(args: {
  hospitalId: string;
  limit?: number;
}): Promise<FlowRow[]> {
  const now = new Date();
  const start = startOfLocalDay(now, DEFAULT_TIME_ZONE);
  const end = endOfLocalDay(now, DEFAULT_TIME_ZONE);

  // Today's bookings + arrivals via appointments.
  const apptRows = await db
    .select({
      patientUserId: appointments.patientUserId,
      patientCode: patientProfiles.patientCode,
      status: appointments.status,
      startsAt: appointments.startsAt,
      departmentName: hospitalDepartments.name,
    })
    .from(appointments)
    .innerJoin(patientProfiles, eq(patientProfiles.id, appointments.patientUserId))
    .leftJoin(hospitalDepartments, eq(hospitalDepartments.id, appointments.departmentId))
    .where(
      and(
        eq(appointments.hospitalId, args.hospitalId),
        gte(appointments.startsAt, start),
        lt(appointments.startsAt, end),
      ),
    )
    .orderBy(asc(appointments.startsAt))
    .limit(args.limit ?? 200);

  // Walk-ins / referrals / patient declarations via intake.
  const intakeRows = await db
    .select({
      id: patientIntakes.id,
      patientUserId: patientIntakes.patientUserId,
      patientCode: patientProfiles.patientCode,
      patientUnknownLabel: patientIntakes.patientUnknownLabel,
      status: patientIntakes.status,
      arrivedAt: patientIntakes.arrivedAt,
      checkedInAt: patientIntakes.checkedInAt,
      declaredByPatient: patientIntakes.declaredByPatient,
      departmentName: hospitalDepartments.name,
    })
    .from(patientIntakes)
    .leftJoin(patientProfiles, eq(patientProfiles.id, patientIntakes.patientUserId))
    .leftJoin(hospitalDepartments, eq(hospitalDepartments.id, patientIntakes.receivingDepartmentId))
    // Windowed and ordered on presence: a patient who declared at 06:10 and
    // was checked in at 13:00 is a 13:00 event on a "what happened today"
    // board, not an 06:10 one — and one who declared at 23:50 last night and
    // walked in this morning belongs on today's.
    .where(
      and(
        eq(patientIntakes.hospitalId, args.hospitalId),
        gte(presenceAt, start),
        lt(presenceAt, end),
      ),
    )
    .orderBy(desc(presenceAt))
    .limit(args.limit ?? 200);

  const out: FlowRow[] = [];

  for (const r of apptRows) {
    const stage: FlowRow["stage"] =
      r.status === "arrived" || r.status === "in_progress"
        ? "in_queue"
        : r.status === "confirmed" || r.status === "pending_approval" || r.status === "requested"
          ? "expected"
          : "arrived";
    out.push({
      patientUserId: r.patientUserId,
      patientCode: r.patientCode,
      patientUnknownLabel: null,
      stage,
      departmentName: r.departmentName,
      whenIso: r.startsAt.toISOString(),
      detail: `Booked · ${r.status}`,
      declaredIntakeId: null,
    });
  }
  for (const r of intakeRows) {
    const stage: FlowRow["stage"] =
      r.status === "declared"
        ? "declared"
        : r.status === "awaiting_triage"
          ? "awaiting_triage"
          : r.status === "triaged"
            ? "in_queue"
            : "arrived";
    const source = r.declaredByPatient ? "Self-declared" : "Intake";
    out.push({
      patientUserId: r.patientUserId,
      patientCode: r.patientCode,
      patientUnknownLabel: r.patientUnknownLabel,
      stage,
      departmentName: r.departmentName,
      whenIso: presenceOf(r).toISOString(),
      detail: `${source} · ${r.status}`,
      declaredIntakeId: r.status === "declared" ? r.id : null,
    });
  }

  // Stable sort: most-recent event first.
  out.sort((a, b) => b.whenIso.localeCompare(a.whenIso));
  return out.slice(0, args.limit ?? 100);
}
