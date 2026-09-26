/**
 * ha-set-hospital-emergency-settings — the facility's emergency profile
 * (PRD MS-PRD-SYM-001 §8.3 "Hospital", Phase 5 "Hospital admin settings";
 * migration 0066 §6; ADR 0098 ruling 5).
 *
 * Auth: the hospital's own admin (`requireHospitalAdminScope`, state-checked)
 * or superadmin. Audited FIRST (fail closed) as
 * `set_hospital_emergency_settings` with before/after — institutional
 * numbers and a landmark are not patient PII, and "what did we ship, who
 * set it, when" is what the trail is for (the sa-set-emergency-phone rule).
 *
 * A BOARD NOBODY OWNS IS A BOARD NOBODY WATCHES (PRD §12): enabling
 * pre-alerts needs `board_owner_note` — the CHECK
 * `hospitals_pre_alert_has_owner` would refuse too; this says it in words.
 *
 * THE AMBULANCE NUMBER IS A CONTACT, NOT A FACT. Registering one writes an
 * `emergency_contacts` row keyed `FACILITY.<hospital_id>.AMBULANCE`, scope
 * facility, kind ambulance, ALWAYS `unverified` — nothing here can prove a
 * human dialled it, so production never shows it until
 * sa-verify-emergency-contact (four-eyes) says so. A changed number drops
 * back to unverified; clearing it deactivates the row. Every optional
 * field is tri-state: absent = untouched, null = cleared.
 *
 * `emergency_phone` (the one number ADR 0084 §3 trusts) stays
 * sa-set-emergency-phone's — superadmin-only, dialled first.
 *
 * 0080 (ADR 0158, CAP-5): the ROUTING values — emergency capability, pre-alerts and their board
 * owner, directions, the SMS and ambulance numbers — change only through the Departments &
 * services hub, where a second admin verifies them. This function now keeps the coordinates and
 * refuses any change to a routing value (sending the current value unchanged is fine).
 */

import { z } from "npm:zod@4.4.3";

import { getCaller, hasRole, serviceClient } from "../_shared/auth.ts";
import { preflight } from "../_shared/cors.ts";
import {
  badRequest,
  conflict,
  forbidden,
  methodNotAllowed,
  notFound,
  ok,
  serverError,
  unauthorized,
} from "../_shared/errors.ts";
import { requireHospitalAdminScope } from "../_shared/hospital-admin-scope.ts";
import { makeLogger } from "../_shared/logger.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";

const log = makeLogger("ha-set-hospital-emergency-settings");

/** Mirrors `hospitals_emergency_sms_format` / `hospitals_ambulance_format` (0066 §6) so a bad number is refused in words. */
const UG_E164 = /^[+]2567[0-9]{8}$|^[+]256[23489][0-9]{7,8}$/;
const UG_E164_OR_TOLLFREE = /^[+]2567[0-9]{8}$|^[+]256[23489][0-9]{7,8}$|^0800[0-9]{6}$/;
const NUMBER_HINT = "Use the full international form with no spaces, e.g. +256XXXXXXXXX.";

const InputSchema = z
  .object({
    hospital_id: z.string().uuid(),
    emergency_capability: z.enum(["none", "daytime", "24h"]).optional(),
    pre_alert_enabled: z.boolean().optional(),
    board_owner_note: z.string().trim().min(3).max(240).nullable().optional(),
    emergency_entrance_directions: z.string().trim().min(1).max(500).nullable().optional(),
    emergency_sms_number: z.string().trim().regex(UG_E164, NUMBER_HINT).nullable().optional(),
    ambulance_number: z
      .string()
      .trim()
      .regex(UG_E164_OR_TOLLFREE, `${NUMBER_HINT} A toll-free 0800XXXXXX line is also accepted.`)
      .nullable()
      .optional(),
    latitude: z.number().min(-2).max(5).nullable().optional(),
    longitude: z.number().min(29).max(36).nullable().optional(),
    reason: z.string().trim().min(8).max(500),
  })
  .refine((v) => (v.latitude === undefined) === (v.longitude === undefined), {
    message: "Send latitude and longitude together.",
    path: ["longitude"],
  })
  .refine((v) => (v.latitude === null) === (v.longitude === null), {
    message: "Clear latitude and longitude together.",
    path: ["longitude"],
  });

interface HospitalRow {
  id: string;
  name: string;
  emergency_capability: string;
  pre_alert_enabled: boolean;
  board_owner_note: string | null;
  emergency_entrance_directions: string | null;
  emergency_sms_number: string | null;
  ambulance_number: string | null;
  latitude: number | null;
  longitude: number | null;
}

const SETTING_KEYS = [
  "emergency_capability",
  "pre_alert_enabled",
  "board_owner_note",
  "emergency_entrance_directions",
  "emergency_sms_number",
  "ambulance_number",
  "latitude",
  "longitude",
] as const;

/** The routing values (CAP-5): only the hub's verify step writes them now. */
const ROUTING_KEYS = [
  "emergency_capability",
  "pre_alert_enabled",
  "board_owner_note",
  "emergency_entrance_directions",
  "emergency_sms_number",
  "ambulance_number",
] as const;

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const init = { origin, requestId };

  const pre = preflight(request);
  if (pre) return pre;
  if (request.method !== "POST") return methodNotAllowed(init);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Body must be JSON", init);
  }
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message;
    return badRequest(first ?? "Invalid input", init, parsed.error.flatten());
  }
  const input = parsed.data;

  const caller = await getCaller(request);
  if (!caller) return unauthorized(init);
  if (!(await hasRole(caller.id, "superadmin"))) {
    const scope = await requireHospitalAdminScope(caller.id, input.hospital_id);
    if (!scope.ok) return forbidden(init, scope.reason);
  }

  const sb = serviceClient();
  const { data: row, error: rowError } = await sb
    .from("hospitals")
    .select(`id, name, ${SETTING_KEYS.join(", ")}`)
    .eq("id", input.hospital_id)
    .maybeSingle();
  if (rowError) return serverError(rowError.message, init);
  const hospital = (row as unknown as HospitalRow | null) ?? null;
  if (!hospital) return notFound(init, "hospital not found");

  // Absent = untouched, null = cleared.
  const patch: Partial<Record<(typeof SETTING_KEYS)[number], unknown>> = {};
  for (const key of SETTING_KEYS) if (input[key] !== undefined) patch[key] = input[key];

  // CAP-5: one person may not change where an emergency goes.
  const changedRouting = ROUTING_KEYS.filter(
    (key) => key in patch && (patch[key] ?? null) !== (hospital[key] ?? null),
  );
  if (changedRouting.length > 0) {
    return conflict(
      "Emergency routing values change in Departments & services → Emergency & support, where a second admin verifies them.",
      init,
      { fields: changedRouting },
    );
  }
  const next = { ...hospital, ...patch } as HospitalRow;

  if (next.pre_alert_enabled && !next.board_owner_note) {
    return badRequest(
      "Name who owns the Incoming board each shift before enabling pre-alerts — a board nobody owns is a board nobody watches.",
      init,
    );
  }

  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const key of SETTING_KEYS) {
    if (hospital[key] !== next[key]) {
      before[key] = hospital[key];
      after[key] = next[key];
    }
  }
  const ambulanceChanged = "ambulance_number" in after;

  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "set_hospital_emergency_settings",
      targetKind: "hospital",
      targetId: hospital.id,
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      beforeData: before,
      afterData: { ...after, ambulance_contact_touched: ambulanceChanged },
    });
  } catch (e) {
    log.error("audit insert failed", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  if (Object.keys(patch).length) {
    const { error } = await sb.from("hospitals").update(patch).eq("id", hospital.id);
    if (error) {
      log.error("hospital update failed", { requestId, reason: error.message });
      return serverError("update failed", init);
    }
  }

  // The ambulance line as reference data — never verified from here.
  if (ambulanceChanged) {
    const key = `FACILITY.${hospital.id}.AMBULANCE`;
    const { error } = next.ambulance_number
      ? await sb.from("emergency_contacts").upsert(
          {
            key,
            scope: "facility",
            facility_id: hospital.id,
            label: `${hospital.name} ambulance`,
            number: next.ambulance_number,
            kind: "ambulance",
            priority: 80,
            verification_status: "unverified",
            verified_by_user_id: null,
            verified_at: null,
            basis: "Registered by the hospital admin; to be dialled and verified (four-eyes).",
            active: true,
          },
          { onConflict: "key" },
        )
      : await sb.from("emergency_contacts").update({ active: false }).eq("key", key);
    if (error) {
      log.error("ambulance contact write failed", { requestId, reason: error.message });
      return serverError("the settings were saved but the ambulance contact was not", init);
    }
  }

  log.info("emergency settings recorded", {
    requestId,
    hospital_id: hospital.id,
    changed: Object.keys(after),
    pre_alert_enabled: next.pre_alert_enabled,
  });
  return ok(
    {
      hospital_id: hospital.id,
      emergency_capability: next.emergency_capability,
      pre_alert_enabled: next.pre_alert_enabled,
      has_ambulance_contact: !!next.ambulance_number,
    },
    init,
  );
});
