/**
 * pt-submit-symptoms — the patient reports what is wrong, in the catalog's
 * lay words, and hears the advisory tier (PRD MS-PRD-SYM-001 §5, §9.4
 * `submitSymptoms`; ADR 0098 rulings 1, 3, 5).
 *
 * The tier is RECOMPUTED here with the same pure `classify` the phone and
 * the web ran offline. A client never sends a tier and this function never
 * reads one: the row's `computed_tier` and `rule_trace` are the server's
 * answer over the server's copy of the package, which is what makes any
 * advice given reconstructable later (§5.1 principle 6). Items outside the
 * catalog are refused outright (400) rather than silently ignored — a
 * phone on a newer package than the server must not have its words dropped
 * on the floor.
 *
 * What lands: a `symptom_submissions` row with outcome `abandoned`. The
 * writers that come after — the booking core (`booked`), the queue door
 * (`queued`), the same-day path (`same_day`), the pre-alert (`emergency`)
 * and the interrupt's decline (`emergency_declined`) — each set their own
 * outcome; a report nobody acted on stays `abandoned`, honestly.
 *
 * Free text is PHI: encrypted with the shared AES-256-GCM helper before it
 * touches the row, and it never changes the tier (R6 — the classifier has
 * no branch that reads it). Nothing in a log line or the audit row is a
 * label, a key list or the free text: counts and the tier only.
 */

import { z } from "npm:zod@4.4.3";

import { getCaller, serviceClient } from "../_shared/auth.ts";
import { preflight } from "../_shared/cors.ts";
import { blindIndex, encrypt } from "../_shared/encryption.ts";
import { badRequest, methodNotAllowed, ok, serverError, unauthorized } from "../_shared/errors.ts";
import { makeLogger } from "../_shared/logger.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";
import { CATALOG, classify, MAX_FREE_TEXT } from "../_shared/symptom-catalog/index.ts";
import { MAX_SELECTED_ITEMS } from "../_shared/symptom-catalog/types.ts";

const log = makeLogger("pt-submit-symptoms");

/** More than the tray ever holds (PRD §6.1 "2 selected · Continue"); a cap, not a target. */
const MAX_ITEMS = MAX_SELECTED_ITEMS;

const InputSchema = z.object({
  hospital_id: z.string().uuid().optional(),
  audience: z.enum(["adult", "child_u2m", "child_2m_5y", "child_5_12", "pregnant"]),
  pregnant: z.boolean().default(false),
  items: z.array(z.string().min(1).max(64)).min(1).max(MAX_ITEMS),
  /** item key → qualifier key → option key, as the chips were answered. */
  qualifiers: z
    .record(z.string().max(64), z.record(z.string().max(64), z.string().max(64)))
    .default({}),
  free_text: z.string().max(MAX_FREE_TEXT).nullable().optional(),
  channel: z.enum(["web", "app", "desk"]),
  device_hash: z.string().max(128).optional(),
});

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
  if (!parsed.success) return badRequest("Invalid input", init, parsed.error.flatten());
  const input = parsed.data;

  const caller = await getCaller(request);
  if (!caller) return unauthorized(init);

  // Unknown keys are refused, not ignored (see the header). The keys are
  // catalog vocabulary, not PHI, so naming them in the 400 is safe.
  const known = new Set(CATALOG.items.map((i) => i.key));
  const unknown = input.items.filter((k) => !known.has(k));
  if (unknown.length) {
    return badRequest("Some symptoms are not in this catalog version.", init, {
      unknown_items: unknown,
      catalog_version: CATALOG.version,
    });
  }

  // The pregnancy toggle (PRD §6.1) IS the pregnant audience for the rules:
  // bias to over-triage (§5.1 principle 1) means the toggle always wins.
  const audience = input.pregnant && input.audience === "adult" ? "pregnant" : input.audience;
  const classification = classify(
    { audience, items: input.items, qualifiers: input.qualifiers, freeText: input.free_text },
    CATALOG,
  );

  const sb = serviceClient();

  // Whose report: the patient's own row when the caller is a patient,
  // otherwise the caller reported for someone (a desk user, a bystander
  // with an account) — the CHECK wants one of the two.
  const { data: patient, error: patientError } = await sb
    .from("patient_profiles")
    .select("id")
    .eq("id", caller.id)
    .maybeSingle();
  if (patientError) return serverError(patientError.message, init);
  const who = patient
    ? { patient_user_id: caller.id, reporter_user_id: null }
    : { patient_user_id: null, reporter_user_id: caller.id };

  // PHI: encrypt or refuse — never a plaintext fallback. The device id is
  // stored as the same blind index `pt-create-pre-arrival` uses, so the raw
  // id never lands in a column (and the two tables still correlate).
  const phiKey = Deno.env.get("MEDSYNC_PHI_KEY");
  if (!phiKey) return serverError("MEDSYNC_PHI_KEY is not configured for Functions.", init);
  let freeTextEnc: string | null = null;
  let deviceHash: string | null = null;
  try {
    if (input.free_text?.trim()) freeTextEnc = await encrypt(input.free_text.trim(), phiKey);
    if (input.device_hash) deviceHash = await blindIndex(input.device_hash, phiKey);
  } catch (e) {
    log.error("encryption failed", { requestId, reason: String(e) });
    return serverError("could not store your report", init);
  }

  // Audit FIRST (fail closed), on an id minted here so the row can be named
  // before it exists. Counts and the tier only — never labels or words.
  const submissionId = crypto.randomUUID();
  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "submit_symptoms",
      targetKind: "symptom_submission",
      targetId: submissionId,
      reason: `Patient symptom report classified ${classification.tier} (catalog ${CATALOG.version}).`,
      requestId,
      ipAddress,
      userAgent,
      beforeData: null,
      afterData: {
        hospital_id: input.hospital_id ?? null,
        audience,
        tier: classification.tier,
        item_count: input.items.length,
        flag_count: classification.flags.length,
        catalog_version: CATALOG.version,
        channel: input.channel,
        has_free_text: freeTextEnc !== null,
      },
    });
  } catch (e) {
    log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  const { error: insertError } = await sb.from("symptom_submissions").insert({
    id: submissionId,
    hospital_id: input.hospital_id ?? null,
    ...who,
    audience,
    pregnant: input.pregnant || audience === "pregnant",
    items: input.items,
    qualifiers: input.qualifiers,
    computed_tier: classification.tier,
    rule_trace: classification.trace,
    catalog_version: CATALOG.version,
    free_text_enc: freeTextEnc,
    outcome: "abandoned",
    device_hash: deviceHash,
    channel: input.channel,
  });
  if (insertError) {
    log.error("submission insert failed", { requestId, reason: insertError.message });
    return serverError("could not save your report", init);
  }

  log.info("symptoms submitted", {
    requestId,
    submission_id: submissionId,
    tier: classification.tier,
    item_count: input.items.length,
    channel: input.channel,
  });
  return ok(
    {
      submission_id: submissionId,
      tier: classification.tier,
      reasons: classification.reasons,
      flags: classification.flags,
      service_line_hint: classification.serviceLineHint,
      catalog_version: classification.catalogVersion,
    },
    init,
  );
});
