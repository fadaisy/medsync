import "server-only";

import type {
  EmergencyCapability,
  EtaBand,
  PreArrivalStatus,
  SubjectDescriptor,
  TransportMode,
} from "@/db/schema/emergency";
import type { RedFlagLabel } from "@/lib/emergency/labels";
import type { FacilityForOrdering } from "@/lib/emergency/nearest";
import type { Tier } from "@/supabase/functions/_shared/symptom-catalog/types";
import { and, asc, desc, eq, gt, inArray, or } from "drizzle-orm";

import { db } from "@/db";
import {
  emergencyContacts,
  emergencyPreArrivals,
  patientSymptomCatalogVersions,
} from "@/db/schema/emergency";
import { hospitals } from "@/db/schema/hospitals";
import { redFlagLabels } from "@/lib/emergency/labels";
import { decrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger";

/**
 * Emergency Pathway read models (PRD MS-PRD-SYM-001 §8; ADR 0098). Drizzle
 * runs as the DB owner and BYPASSES RLS, so every read of a PHI table below
 * pins the tenant in its own `where` — tests/emergency/queries-invariants
 * checks that at the source level. Writes never happen here: every mutation
 * is an Edge Function.
 */

/** The board's open states — what a receptionist still has to act on. */
export const OPEN_PRE_ARRIVAL_STATUSES: readonly PreArrivalStatus[] = ["sent", "seen", "ready"];

export interface IncomingPreArrival {
  id: string;
  status: PreArrivalStatus;
  subject: SubjectDescriptor;
  /** Lay + clinical labels, in the order the reporter chose (PRD §8.5). */
  redFlags: RedFlagLabel[];
  tier: Tier;
  /** R4: fever + bleeding — "Prepare isolation" banner. */
  isolation: boolean;
  transportMode: TransportMode;
  etaBand: EtaBand;
  onsetAt: Date | null;
  /** `stroke_time`: "When were they last normal?" */
  lastKnownWellAt: Date | null;
  /** Decrypted for tap-to-call on the board; null when absent or undecryptable. */
  callbackPhone: string | null;
  /** True when the reporter was signed in (PRD §8.7). */
  verified: boolean;
  acknowledgedAt: Date | null;
  readyAt: Date | null;
  /** Set by the reporter's "We've arrived" while the row is still open — the desk converts it. */
  arrivedAt: Date | null;
  arrivedIntakeId: string | null;
  expiresAt: Date;
  createdAt: Date;
}

const boardColumns = {
  id: emergencyPreArrivals.id,
  status: emergencyPreArrivals.status,
  subject: emergencyPreArrivals.subjectDescriptor,
  redFlagKeys: emergencyPreArrivals.redFlags,
  tier: emergencyPreArrivals.tier,
  isolation: emergencyPreArrivals.isolationFlag,
  transportMode: emergencyPreArrivals.transportMode,
  etaBand: emergencyPreArrivals.etaBand,
  onsetAt: emergencyPreArrivals.onsetAt,
  lastKnownWellAt: emergencyPreArrivals.lastKnownWellAt,
  callbackPhoneEnc: emergencyPreArrivals.callbackPhoneEnc,
  verified: emergencyPreArrivals.verified,
  acknowledgedAt: emergencyPreArrivals.acknowledgedAt,
  readyAt: emergencyPreArrivals.readyAt,
  arrivedAt: emergencyPreArrivals.arrivedAt,
  arrivedIntakeId: emergencyPreArrivals.arrivedIntakeId,
  expiresAt: emergencyPreArrivals.expiresAt,
  createdAt: emergencyPreArrivals.createdAt,
};

type BoardRow = Awaited<ReturnType<typeof selectBoardRows>>[number];

function selectBoardRows() {
  return db.select(boardColumns).from(emergencyPreArrivals);
}

function decryptOrNull(payload: string | null): string | null {
  if (!payload) return null;
  try {
    return decrypt(payload);
  } catch (e) {
    logger.warn("emergency.board.decrypt_failed", { reason: String(e) });
    return null;
  }
}

function toIncoming(r: BoardRow): IncomingPreArrival {
  const { redFlagKeys, callbackPhoneEnc, ...rest } = r;
  return {
    ...rest,
    redFlags: redFlagLabels(redFlagKeys),
    callbackPhone: decryptOrNull(callbackPhoneEnc),
  };
}

/** Open pre-alerts for one facility's Incoming board, newest first. */
export async function fetchIncomingPreArrivals(args: {
  facilityId: string;
  statuses?: readonly PreArrivalStatus[];
  limit?: number;
}): Promise<IncomingPreArrival[]> {
  const rows = await selectBoardRows()
    .where(
      and(
        eq(emergencyPreArrivals.facilityId, args.facilityId),
        inArray(emergencyPreArrivals.status, [...(args.statuses ?? OPEN_PRE_ARRIVAL_STATUSES)]),
        // The sweeper runs daily (Hobby cadence): a row past its expiry is
        // not live on the board even before it is marked `expired`.
        gt(emergencyPreArrivals.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(emergencyPreArrivals.createdAt))
    .limit(args.limit ?? 50);
  return rows.map(toIncoming);
}

/** One pre-alert, only if it belongs to the caller's facility. */
export async function fetchPreArrivalForBoard(
  id: string,
  facilityId: string,
): Promise<IncomingPreArrival | null> {
  const [row] = await selectBoardRows()
    .where(and(eq(emergencyPreArrivals.id, id), eq(emergencyPreArrivals.facilityId, facilityId)))
    .limit(1);
  return row ? toIncoming(row) : null;
}

/* ── The Emergency sheet (E1) ───────────────────────────────────────── */

export interface EmergencySheetContact {
  /** `emergency_contacts.id`, or `hospital:<id>` for the synthetic own-hospital row (audit logs the id only). */
  id: string;
  label: string;
  number: string;
  kind: "general" | "ambulance" | "crisis" | "sv";
  scope: "national" | "district" | "facility";
  priority: number;
  verificationStatus: "verified" | "unverified" | "to_source";
}

/** Non-PHI facility fields for the pre-alert picker (PRD §8.3). */
export interface PreAlertFacility extends FacilityForOrdering {
  district: string | null;
  emergencyCapability: EmergencyCapability;
  /** False → "Call only" (PRD §8.3): the caller's own hospital is listed regardless. */
  preAlertEnabled: boolean;
  emergencyPhone: string | null;
  emergencySmsNumber: string | null;
  ambulanceNumber: string | null;
  emergencyEntranceDirections: string | null;
}

export interface EmergencySheet {
  contacts: EmergencySheetContact[];
  /** Pre-alert-enabled facilities, the caller's own first when it is one. */
  facilities: PreAlertFacility[];
  own: PreAlertFacility | null;
}

const facilityColumns = {
  id: hospitals.id,
  name: hospitals.name,
  district: hospitals.district,
  latitude: hospitals.latitude,
  longitude: hospitals.longitude,
  emergencyCapability: hospitals.emergencyCapability,
  preAlertEnabled: hospitals.preAlertEnabled,
  emergencyPhone: hospitals.emergencyPhone,
  emergencySmsNumber: hospitals.emergencySmsNumber,
  ambulanceNumber: hospitals.ambulanceNumber,
  emergencyEntranceDirections: hospitals.emergencyEntranceDirections,
};

function toFacility(r: Awaited<ReturnType<typeof selectFacilities>>[number]): PreAlertFacility {
  return { ...r, emergencyCapability: r.emergencyCapability as EmergencyCapability };
}

function selectFacilities() {
  return db.select(facilityColumns).from(hospitals);
}

/**
 * What the sheet may dial and where it may pre-alert. Production shows
 * `verified` contacts only (ADR 0098 ruling 8); `includeDrafts` (non-prod,
 * under the "Unsigned clinical content" watermark) adds the unverified and
 * to-source rows that still carry a number. The hospital's own
 * `emergency_phone` (superadmin-set, ADR 0084 §3) rides along as a synthetic
 * contact so the sheet has a primary call even while nothing national is
 * verified. Contacts and facilities are reference data, not PHI.
 */
export async function fetchEmergencySheet(args: {
  hospitalId?: string | null;
  district?: string | null;
  includeDrafts: boolean;
}): Promise<EmergencySheet> {
  const statusFilter = args.includeDrafts
    ? inArray(emergencyContacts.verificationStatus, ["verified", "unverified", "to_source"])
    : eq(emergencyContacts.verificationStatus, "verified");
  const scopeFilter = or(
    eq(emergencyContacts.scope, "national"),
    args.district ? eq(emergencyContacts.district, args.district) : undefined,
    args.hospitalId ? eq(emergencyContacts.facilityId, args.hospitalId) : undefined,
  );

  const [contactRows, facilityRows, ownRows] = await Promise.all([
    db
      .select({
        id: emergencyContacts.id,
        label: emergencyContacts.label,
        number: emergencyContacts.number,
        kind: emergencyContacts.kind,
        scope: emergencyContacts.scope,
        priority: emergencyContacts.priority,
        verificationStatus: emergencyContacts.verificationStatus,
      })
      .from(emergencyContacts)
      .where(and(eq(emergencyContacts.active, true), statusFilter, scopeFilter))
      .orderBy(asc(emergencyContacts.priority)),
    selectFacilities()
      .where(and(eq(hospitals.preAlertEnabled, true), eq(hospitals.state, "active")))
      .orderBy(asc(hospitals.name)),
    args.hospitalId
      ? selectFacilities().where(eq(hospitals.id, args.hospitalId)).limit(1)
      : Promise.resolve([]),
  ]);

  const own = ownRows[0] ? toFacility(ownRows[0]) : null;
  const contacts: EmergencySheetContact[] = [];
  if (own?.emergencyPhone) {
    contacts.push({
      id: `hospital:${own.id}`,
      label: `${own.name} emergency entrance`,
      number: own.emergencyPhone,
      kind: "general",
      scope: "facility",
      priority: 0,
      verificationStatus: "verified",
    });
  }
  for (const c of contactRows) {
    // A to-source row has no number; it is a runbook item, not a button.
    if (!c.number) continue;
    contacts.push({
      ...c,
      number: c.number,
      kind: c.kind as EmergencySheetContact["kind"],
      scope: c.scope as EmergencySheetContact["scope"],
      verificationStatus: c.verificationStatus as EmergencySheetContact["verificationStatus"],
    });
  }

  // Own hospital first even when it cannot take a pre-alert: the sheet then
  // shows it as "Call only" (PRD §8.3) rather than hiding the patient's home.
  const others = facilityRows.map(toFacility).filter((f) => f.id !== own?.id);
  const facilities = own ? [own, ...others] : others;

  return { contacts, facilities, own };
}

/* ── Hospital-admin settings (PRD §8.5 build prompt Phase 5) ───────── */

export interface EmergencySettings {
  hospitalId: string;
  emergencyCapability: EmergencyCapability;
  preAlertEnabled: boolean;
  boardOwnerNote: string | null;
  emergencyEntranceDirections: string | null;
  emergencySmsNumber: string | null;
  ambulanceNumber: string | null;
  latitude: number | null;
  longitude: number | null;
}

export async function fetchEmergencySettings(
  hospitalId: string,
): Promise<EmergencySettings | null> {
  const [row] = await db
    .select({
      hospitalId: hospitals.id,
      emergencyCapability: hospitals.emergencyCapability,
      preAlertEnabled: hospitals.preAlertEnabled,
      boardOwnerNote: hospitals.boardOwnerNote,
      emergencyEntranceDirections: hospitals.emergencyEntranceDirections,
      emergencySmsNumber: hospitals.emergencySmsNumber,
      ambulanceNumber: hospitals.ambulanceNumber,
      latitude: hospitals.latitude,
      longitude: hospitals.longitude,
    })
    .from(hospitals)
    .where(eq(hospitals.id, hospitalId))
    .limit(1);
  return row
    ? { ...row, emergencyCapability: row.emergencyCapability as EmergencyCapability }
    : null;
}

/* ── Gate CS: is the bundled catalog signed? ───────────────────────── */

export interface CatalogVersionStatus {
  version: string;
  /** `missing` when the seed script has not registered this version yet. */
  status: "draft" | "signed" | "retired" | "missing";
  checksum: string | null;
  signedAt: Date | null;
  /**
   * What Gate CS actually asks: the row is `signed` AND its checksum is the
   * bundled package's. A signed row for a package that has since drifted is
   * not a signed package — the surfaces treat it as draft.
   */
  signed: boolean;
}

export async function fetchCatalogVersionStatus(
  version: string,
  bundledChecksum: string,
): Promise<CatalogVersionStatus> {
  const [row] = await db
    .select({
      status: patientSymptomCatalogVersions.status,
      checksum: patientSymptomCatalogVersions.checksum,
      signedAt: patientSymptomCatalogVersions.signedAt,
    })
    .from(patientSymptomCatalogVersions)
    .where(eq(patientSymptomCatalogVersions.version, version))
    .limit(1);
  if (!row) return { version, status: "missing", checksum: null, signedAt: null, signed: false };
  return {
    version,
    status: row.status as Exclude<CatalogVersionStatus["status"], "missing">,
    checksum: row.checksum,
    signedAt: row.signedAt,
    signed: row.status === "signed" && row.checksum === bundledChecksum,
  };
}
