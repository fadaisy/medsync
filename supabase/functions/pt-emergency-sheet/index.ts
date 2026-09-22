/**
 * pt-emergency-sheet — what the Emergency sheet (E1) may dial and where it
 * may pre-alert (PRD MS-PRD-SYM-001 §8.2, §8.3, §9.4 `listEmergencyContacts`;
 * ADR 0098 rulings 8, 9).
 *
 * This is the phone's source; the web reads the same answer through
 * `lib/emergency/queries.ts#fetchEmergencySheet`, and the two return one
 * shape on purpose so a screen has one type. Read-only: nothing is written,
 * nothing is audited, and nothing here is PHI — contacts are reference
 * data, facilities are the public hospital record. The caller is OPTIONAL
 * (the sheet opens signed out, ruling 7) and, since the answer is the same
 * for everyone, never asked for: the anon key on a signed-out call passes
 * verify_jwt and that is all this needs.
 *
 * Gate CS (ruling 2): production answers `verified` contacts only. Outside
 * production the unverified / to-source rows that carry a number come too,
 * each tagged `draft: true`, for the "Unsigned clinical content" watermark.
 * Because nothing national is verified at ship (ruling 8), the hospital's
 * own `emergency_phone` (superadmin-set, ADR 0084 §3's one trusted number)
 * rides along as a synthetic verified contact whenever a hospital is named,
 * so the sheet has a primary call from day one.
 *
 * Nearest facility is the DEVICE's arithmetic (ruling 9, DPPA 2019): this
 * returns coordinates, never reads any.
 */

import { z } from "npm:zod@4.4.3";

import { serviceClient } from "../_shared/auth.ts";
import { preflight } from "../_shared/cors.ts";
import { badRequest, methodNotAllowed, ok, serverError } from "../_shared/errors.ts";
import { makeLogger } from "../_shared/logger.ts";

const log = makeLogger("pt-emergency-sheet");

const InputSchema = z.object({
  hospital_id: z.string().uuid().optional(),
  /** Unverified rows for a development client only; production never sends it and the env refuses it anyway. */
  include_drafts: z.boolean().optional(),
  /** A district name as `hospitals.district` spells it; the pattern keeps it out of the PostgREST filter grammar. */
  district: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[A-Za-z][A-Za-z .'-]*$/)
    .optional(),
});

type ContactKind = "general" | "ambulance" | "crisis" | "sv";
type ContactScope = "national" | "district" | "facility";
type VerificationStatus = "verified" | "unverified" | "to_source";

interface ContactRow {
  id: string;
  label: string;
  number: string | null;
  kind: ContactKind;
  scope: ContactScope;
  priority: number;
  verification_status: VerificationStatus;
}

/** `EmergencySheetContact` on the web, plus `draft` (absent in production by construction). */
interface SheetContact {
  /** `emergency_contacts.id`, or `hospital:<id>` for the synthetic own-hospital row (audit logs the id only). */
  id: string;
  label: string;
  number: string;
  kind: ContactKind;
  scope: ContactScope;
  priority: number;
  verificationStatus: VerificationStatus;
  draft?: true;
}

interface FacilityRow {
  id: string;
  name: string;
  level: string;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  emergency_capability: "none" | "daytime" | "24h";
  pre_alert_enabled: boolean;
  emergency_phone: string | null;
  emergency_sms_number: string | null;
  ambulance_number: string | null;
  emergency_entrance_directions: string | null;
}

/** `PreAlertFacility` on the web, plus `level` for the picker's "Call only" line. */
interface SheetFacility {
  id: string;
  name: string;
  level: string;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  emergencyCapability: FacilityRow["emergency_capability"];
  /** False → "Call only" (PRD §8.3): the caller's own hospital is listed regardless. */
  preAlertEnabled: boolean;
  emergencyPhone: string | null;
  emergencySmsNumber: string | null;
  ambulanceNumber: string | null;
  emergencyEntranceDirections: string | null;
}

const FACILITY_COLUMNS =
  "id, name, level, district, latitude, longitude, emergency_capability, pre_alert_enabled, " +
  "emergency_phone, emergency_sms_number, ambulance_number, emergency_entrance_directions";

function toFacility(r: FacilityRow): SheetFacility {
  return {
    id: r.id,
    name: r.name,
    level: r.level,
    district: r.district,
    latitude: r.latitude,
    longitude: r.longitude,
    emergencyCapability: r.emergency_capability,
    preAlertEnabled: r.pre_alert_enabled,
    emergencyPhone: r.emergency_phone,
    emergencySmsNumber: r.emergency_sms_number,
    ambulanceNumber: r.ambulance_number,
    emergencyEntranceDirections: r.emergency_entrance_directions,
  };
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const init = { origin, requestId };

  const pre = preflight(request);
  if (pre) return pre;
  if (request.method !== "POST") return methodNotAllowed(init);

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return badRequest("Body must be JSON", init);
  }
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid input", init, parsed.error.flatten());
  const input = parsed.data;

  // Fail closed on the numbers: drafts leave only when the client asked (a
  // dev build) AND this project is not marked production. One Supabase
  // project serves every environment, so the default with nothing set is
  // verified-only.
  const includeDrafts =
    input.include_drafts === true && Deno.env.get("MEDSYNC_ENV") !== "production";
  const sb = serviceClient();

  // Scope: national always; the district's rows when one is named; the
  // hospital's own facility rows when one is named.
  const scopes = ["scope.eq.national"];
  if (input.district) scopes.push(`district.eq.${input.district}`);
  if (input.hospital_id) scopes.push(`facility_id.eq.${input.hospital_id}`);

  const [contactsRes, facilitiesRes, ownRes] = await Promise.all([
    sb
      .from("emergency_contacts")
      .select("id, label, number, kind, scope, priority, verification_status")
      .eq("active", true)
      .in(
        "verification_status",
        includeDrafts ? ["verified", "unverified", "to_source"] : ["verified"],
      )
      .or(scopes.join(","))
      .order("priority", { ascending: true }),
    sb
      .from("hospitals")
      .select(FACILITY_COLUMNS)
      .eq("pre_alert_enabled", true)
      .eq("state", "active")
      .order("name", { ascending: true }),
    input.hospital_id
      ? sb.from("hospitals").select(FACILITY_COLUMNS).eq("id", input.hospital_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const failure = contactsRes.error ?? facilitiesRes.error ?? ownRes.error;
  if (failure) {
    log.error("emergency sheet read failed", { requestId, reason: failure.message });
    return serverError("could not load emergency numbers", init);
  }

  const own = ownRes.data ? toFacility(ownRes.data as FacilityRow) : null;
  const contacts: SheetContact[] = [];
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
  for (const c of (contactsRes.data ?? []) as ContactRow[]) {
    // A to-source row has no number; it is a runbook item, not a button.
    if (!c.number) continue;
    contacts.push({
      id: c.id,
      label: c.label,
      number: c.number,
      kind: c.kind,
      scope: c.scope,
      priority: c.priority,
      verificationStatus: c.verification_status,
      ...(c.verification_status === "verified" ? {} : { draft: true as const }),
    });
  }

  // Own hospital first even when it cannot take a pre-alert: the sheet then
  // shows it as "Call only" (PRD §8.3) rather than hiding the patient's home.
  const others = ((facilitiesRes.data ?? []) as FacilityRow[])
    .map(toFacility)
    .filter((f) => f.id !== own?.id);
  const facilities = own ? [own, ...others] : others;

  log.info("emergency sheet served", {
    requestId,
    contacts: contacts.length,
    facilities: facilities.length,
    include_drafts: includeDrafts,
  });
  return ok({ contacts, facilities, own }, init);
});
