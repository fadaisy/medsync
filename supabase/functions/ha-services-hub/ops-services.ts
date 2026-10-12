/**
 * Services ops (prompt §8): clinics (the booking engine's service_lines), diagnostics, capabilities
 * (four-eyes), availability, closures, presets and the one-time legacy import.
 * Clinic DAYS stay with ha-upsert-session-template (the booking engine's own writer).
 */
import type { AvailabilityEvent, CapabilityRow } from "../_shared/services-hub.ts";
import type { Ctx, OpHandler } from "./common.ts";
import { z } from "npm:zod@4.4.3";

import {
  capabilityKey,
  checkCapabilityValue,
  clinicByCode,
  departmentByCode,
  departmentSlug,
  isImagingCode,
  LAB_SECTIONS,
  PHARMACY_DERIVED_KEYS,
  planLegacyImport,
  planPreset,
  projectAvailability,
  setOutcome,
  signedPresetFor,
  verifyVerdict,
} from "../_shared/services-hub.ts";
import { assertAnyHead, HubError, loadDepartment, must, reasonOr, slugify } from "./common.ts";

const uuid = z.string().uuid();
const reason = z.string().trim().max(500).optional();
const sensitiveReason = z.string().trim().min(8, "Say why in a few words (audited).").max(500);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoTime = z.string().datetime({ offset: true });

const offering = z.object({
  kind: z.enum(["lab", "imaging"]),
  code: z.string().regex(/^[A-Za-z0-9._-]{1,40}$/),
  provision: z.enum(["in_house", "referred", "not_offered"]),
  section_id: uuid.nullable().optional(),
  hours: z.enum(["24h", "scheduled"]).nullable().optional(),
  hours_note: z.string().trim().max(60).nullable().optional(),
  stated_tat: z.string().trim().max(40).nullable().optional(),
  referred_to: z.string().trim().max(120).nullable().optional(),
  machines: z.number().int().min(0).max(500).nullable().optional(),
});

export const ServiceOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add_clinics"),
    items: z
      .array(
        z.object({
          code: z.string().max(40).optional(),
          name: z.string().trim().min(2).max(120).optional(),
          department_id: uuid,
        }),
      )
      .min(1)
      .max(30),
    reason,
  }),
  z.object({
    op: z.literal("update_clinic"),
    service_line_id: uuid,
    name: z.string().trim().min(2).max(120).optional(),
    department_id: uuid.optional(),
    unit_id: uuid.nullable().optional(),
    place_id: uuid.nullable().optional(),
    audience: z.enum(["patients", "referral", "staff"]).optional(),
    confidential: z.boolean().optional(),
    live: z.boolean().optional(),
    reason,
  }),
  z.object({ op: z.literal("upsert_offerings"), items: z.array(offering).min(1).max(300), reason }),
  z.object({
    op: z.literal("set_capability"),
    key: z.string().max(40),
    value: z.unknown(),
    reason,
  }),
  z.object({ op: z.literal("verify_capability"), key: z.string().max(40), reason }),
  z.object({
    op: z.literal("reject_capability"),
    key: z.string().max(40),
    reason: sensitiveReason,
  }),
  z.object({
    op: z.literal("report_problem"),
    subject_kind: z.enum([
      "department",
      "ward",
      "clinic",
      "test",
      "lab_section",
      "imaging",
      "capability",
    ]),
    subject_ref: z.string().min(1).max(80),
    state: z.enum(["unavailable", "limited"]),
    reason_code: z.enum([
      "equipment_down",
      "stock_out",
      "staff",
      "power_water",
      "maintenance",
      "building_works",
      "other",
    ]),
    note: z.string().trim().max(280).optional(),
    expected_back_at: isoTime.nullable().optional(),
    reason,
  }),
  z.object({
    op: z.literal("update_problem"),
    problem_id: uuid,
    state: z.enum(["unavailable", "limited"]).optional(),
    reason_code: z
      .enum([
        "equipment_down",
        "stock_out",
        "staff",
        "power_water",
        "maintenance",
        "building_works",
        "other",
      ])
      .optional(),
    note: z.string().trim().max(280).optional(),
    expected_back_at: isoTime.nullable().optional(),
    reason,
  }),
  z.object({
    op: z.literal("resolve_problem"),
    problem_id: uuid,
    note: z.string().trim().max(280).optional(),
    reason,
  }),
  z.object({
    op: z.literal("confirm_still_down"),
    problem_id: uuid,
    expected_back_at: isoTime.nullable().optional(),
    reason,
  }),
  z.object({
    op: z.literal("add_closure"),
    scope: z.enum(["hospital", "department", "ward", "clinic"]),
    target_id: uuid.nullable().optional(),
    starts_on: date,
    ends_on: date,
    reason: sensitiveReason,
  }),
  z.object({ op: z.literal("lift_closure"), closure_id: uuid, reason }),
  z.object({ op: z.literal("apply_preset"), reason }),
  z.object({ op: z.literal("import_legacy"), accept: z.boolean(), reason }),
]);

const nowIso = () => new Date().toISOString();

/* ─── clinics ───────────────────────────────────────────────────────── */

/** New lines are session-mode and Planned (active = false) until the admin sets them live. */
function newLine(
  ctx: Ctx,
  departmentId: string,
  name: string,
  slug: string,
  code: string | null,
  confidential: boolean,
) {
  return {
    hospital_id: ctx.hospitalId,
    department_id: departmentId,
    name,
    slug,
    capacity_mode: "session",
    confidential,
    reason_codes: ["routine", "follow_up", "new_concern", "other"],
    active: false,
    catalogue_code: code,
    audience: "patients",
  };
}

async function freeLineSlug(ctx: Ctx, base: string): Promise<string> {
  const rows = must(
    await ctx.sb
      .from("service_lines")
      .select("slug")
      .eq("hospital_id", ctx.hospitalId)
      .like("slug", `${base}%`),
    "line slugs",
  ) as { slug: string }[];
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  throw new HubError("Too many clinics with that name.");
}

const addClinics: OpHandler = async (ctx, i) => {
  const rows: Record<string, unknown>[] = [];
  const names: string[] = [];
  for (const it of i.items as { code?: string; name?: string; department_id: string }[]) {
    const dept = await loadDepartment(ctx, it.department_id);
    if (dept.archived_at) throw new HubError(`${dept.name} is archived.`);
    const cat = it.code ? clinicByCode(it.code) : null;
    if (it.code && !cat) throw new HubError(`Not in the clinic catalogue: ${it.code}`);
    const name = it.name ?? cat?.label;
    if (!name) throw new HubError("Name the clinic.");
    const label = cat && !it.name ? `${cat.label} clinic` : name;
    const slug = await freeLineSlug(ctx, slugify(label) || "clinic");
    rows.push(newLine(ctx, dept.id, label, slug, cat?.code ?? null, cat?.confidential ?? false));
    names.push(label);
  }
  return {
    audit: {
      action: "update_service_line",
      reason: reasonOr(
        i.reason,
        `Added ${rows.length} clinic(s): ${names.join(", ")}`.slice(0, 480),
      ),
      after: { added: names },
    },
    apply: async () => {
      must(await ctx.sb.from("service_lines").insert(rows), "insert clinics");
      return { added: names.length };
    },
  };
};

const updateClinic: OpHandler = async (ctx, i) => {
  const line = must(
    await ctx.sb
      .from("service_lines")
      .select(
        "id, name, department_id, unit_id, place_id, audience, confidential, active, archived_at",
      )
      .eq("id", i.service_line_id)
      .eq("hospital_id", ctx.hospitalId)
      .maybeSingle(),
    "clinic",
  ) as Record<string, unknown> | null;
  if (!line) throw new HubError("Clinic not found at this hospital.");
  if (line.archived_at) throw new HubError("Restore the clinic from the archive first.", 409);
  const patch: Record<string, unknown> = {};
  if (i.name !== undefined) patch.name = i.name;
  if (i.department_id !== undefined)
    patch.department_id = (await loadDepartment(ctx, i.department_id)).id;
  if (i.unit_id !== undefined) {
    if (i.unit_id) {
      const unit = await loadDepartment(ctx, i.unit_id);
      const parent = (patch.department_id ?? line.department_id) as string;
      if (unit.parent_id !== parent)
        throw new HubError("The unit must belong to the clinic's department.");
    }
    patch.unit_id = i.unit_id;
  }
  if (i.place_id !== undefined) {
    if (i.place_id) {
      const p = must(
        await ctx.sb
          .from("hospital_places")
          .select("id")
          .eq("id", i.place_id)
          .eq("hospital_id", ctx.hospitalId)
          .maybeSingle(),
        "place",
      );
      if (!p) throw new HubError("That place isn't at this hospital.");
    }
    patch.place_id = i.place_id;
  }
  if (i.audience !== undefined) patch.audience = i.audience;
  if (i.confidential !== undefined) patch.confidential = i.confidential;
  if (i.live !== undefined) patch.active = i.live;
  if (!Object.keys(patch).length) throw new HubError("Nothing to change.");
  return {
    audit: {
      action: "update_service_line",
      reason: reasonOr(i.reason, `Updated clinic ${line.name as string}`),
      before: line,
      after: patch,
    },
    apply: async () => {
      must(
        await ctx.sb
          .from("service_lines")
          .update(patch)
          .eq("id", line.id as string),
        "update clinic",
      );
    },
  };
};

/* ─── diagnostics (DX-1…DX-3) ───────────────────────────────────────── */

const upsertOfferings: OpHandler = async (ctx, i) => {
  const items = i.items as z.infer<typeof offering>[];
  const labCodes = [...new Set(items.filter((x) => x.kind === "lab").map((x) => x.code))];
  if (labCodes.length) {
    const found = must(
      await ctx.sb.from("loinc_codes").select("code").in("code", labCodes),
      "loinc",
    ) as { code: string }[];
    const missing = labCodes.filter((c) => !found.some((f) => f.code === c));
    if (missing.length) throw new HubError(`Not in the ordering catalogue: ${missing.join(", ")}`);
  }
  const badImaging = items.filter((x) => x.kind === "imaging" && !isImagingCode(x.code));
  if (badImaging.length)
    throw new HubError(`Not in the imaging catalogue: ${badImaging.map((x) => x.code).join(", ")}`);
  const sectionIds = [...new Set(items.map((x) => x.section_id).filter((x): x is string => !!x))];
  if (sectionIds.length) {
    const lab = must(
      await ctx.sb
        .from("hospital_departments")
        .select("id")
        .eq("hospital_id", ctx.hospitalId)
        .eq("catalogue_code", "LABORATORY")
        .is("parent_id", null),
      "laboratory",
    ) as { id: string }[];
    const sections = must(
      await ctx.sb
        .from("hospital_departments")
        .select("id, parent_id")
        .in("id", sectionIds)
        .eq("hospital_id", ctx.hospitalId),
      "sections",
    ) as { id: string; parent_id: string | null }[];
    const labIds = new Set(lab.map((l) => l.id));
    if (
      sections.length !== sectionIds.length ||
      sections.some((s) => !s.parent_id || !labIds.has(s.parent_id))
    ) {
      throw new HubError("A section must be a unit of this hospital's Laboratory.");
    }
  }
  const at = nowIso();
  const rows = items.map((x) => ({
    hospital_id: ctx.hospitalId,
    kind: x.kind,
    code: x.code,
    provision: x.provision,
    section_id: x.section_id ?? null,
    hours: x.provision === "in_house" ? (x.hours ?? null) : null,
    hours_note: x.provision === "in_house" ? (x.hours_note ?? null) : null,
    stated_tat: x.provision === "not_offered" ? null : (x.stated_tat ?? null),
    referred_to: x.provision === "referred" ? (x.referred_to ?? null) : null,
    machines: x.kind === "imaging" && x.provision === "in_house" ? (x.machines ?? null) : null,
    confirmed_at: at,
    updated_by: ctx.callerId,
  }));
  return {
    audit: {
      action: "update_diagnostics",
      reason: reasonOr(i.reason, `Updated ${rows.length} test/imaging offering(s)`),
      after: { codes: rows.map((r) => `${r.kind}:${r.code}:${r.provision}`).slice(0, 60) },
    },
    apply: async () => {
      must(
        await ctx.sb
          .from("diagnostic_offerings")
          .upsert(rows, { onConflict: "hospital_id,kind,code" }),
        "upsert offerings",
      );
      return { saved: rows.length };
    },
  };
};

/* ─── capabilities (CAP-1…CAP-5) ────────────────────────────────────── */

async function capabilityRow(ctx: Ctx, key: string): Promise<CapabilityRow | null> {
  const r = must(
    await ctx.sb
      .from("capability_values")
      .select("*")
      .eq("hospital_id", ctx.hospitalId)
      .eq("key", key)
      .maybeSingle(),
    "capability",
  ) as Record<string, unknown> | null;
  return r
    ? {
        key,
        value: r.value,
        authoredBy: r.authored_by as string | null,
        verifiedBy: r.verified_by as string | null,
        verifiedAt: r.verified_at as string | null,
        pendingValue: r.pending_value,
        pendingBy: r.pending_by as string | null,
        pendingAt: r.pending_at as string | null,
      }
    : null;
}

const setCapability: OpHandler = async (ctx, i) => {
  const key = capabilityKey(i.key);
  if (!key) throw new HubError(`Unknown capability: ${i.key}`);
  const checked = checkCapabilityValue(i.key, i.value);
  if (!checked.ok) throw new HubError(checked.error);
  // DP-2 (CAP-3 pattern): once a hospital has a dispensing point, these two are worked out from the
  // points and can no longer be typed.
  if (PHARMACY_DERIVED_KEYS.includes(key.key)) {
    const { count, error } = await ctx.sb
      .from("pharmacy_dispensing_points")
      .select("department_id", { count: "exact", head: true })
      .eq("hospital_id", ctx.hospitalId);
    if (error) throw new Error(`dispensing points: ${error.message}`);
    if ((count ?? 0) > 0)
      throw new HubError(`${key.label} is worked out from the dispensing points.`);
  }
  const outcome = setOutcome(key, checked.value);
  const row = await capabilityRow(ctx, key.key);
  return {
    audit: {
      action: "set_capability",
      reason: reasonOr(
        i.reason,
        outcome.kind === "pending"
          ? `${key.label} changed — waiting for a second admin`
          : `${key.label} updated`,
      ),
      before: { key: key.key, value: row?.value ?? null, pending: row?.pendingValue ?? null },
      after: { value: checked.value, needs_second_person: outcome.kind === "pending" },
    },
    apply: async () => {
      const base = { hospital_id: ctx.hospitalId, key: key.key };
      const patch =
        outcome.kind === "pending"
          ? {
              ...base,
              pending_value: checked.value,
              pending_by: ctx.callerId,
              pending_at: nowIso(),
            }
          : {
              ...base,
              value: checked.value,
              authored_by: ctx.callerId,
              authored_at: nowIso(),
              verified_by: null,
              verified_at: null,
            };
      must(
        await ctx.sb.from("capability_values").upsert(patch, { onConflict: "hospital_id,key" }),
        "save capability",
      );
      return { pending: outcome.kind === "pending" };
    },
  };
};

/** CAP-2: the emergency pathway's own columns, written only once a second person verifies. */
async function writePathwayKey(ctx: Ctx, key: string, value: unknown) {
  const h = must(
    await ctx.sb.from("hospitals").select("id, name").eq("id", ctx.hospitalId).single(),
    "hospital",
  ) as {
    id: string;
    name: string;
  };
  if (key === "emergency_capability") {
    must(
      await ctx.sb
        .from("hospitals")
        .update({ emergency_capability: value ?? "none" })
        .eq("id", h.id),
      "ed",
    );
  } else if (key === "accepts_pre_alerts") {
    const v = (value ?? { enabled: false, owner: null }) as {
      enabled: boolean;
      owner: string | null;
    };
    must(
      await ctx.sb
        .from("hospitals")
        .update({ pre_alert_enabled: v.enabled, board_owner_note: v.owner })
        .eq("id", h.id),
      "pre-alert",
    );
  } else if (key === "emergency_sms_number") {
    must(
      await ctx.sb.from("hospitals").update({ emergency_sms_number: value }).eq("id", h.id),
      "sms number",
    );
  } else if (key === "arrival_directions") {
    must(
      await ctx.sb
        .from("hospitals")
        .update({ emergency_entrance_directions: value })
        .eq("id", h.id),
      "directions",
    );
  } else if (key === "ambulance_line") {
    must(
      await ctx.sb.from("hospitals").update({ ambulance_number: value }).eq("id", h.id),
      "ambulance number",
    );
    // The ambulance line as reference data, exactly as ha-set-hospital-emergency-settings writes it:
    // dialling-verified by a superadmin later (its own four-eyes), never from here.
    const k = `FACILITY.${h.id}.AMBULANCE`;
    must(
      value
        ? await ctx.sb.from("emergency_contacts").upsert(
            {
              key: k,
              scope: "facility",
              facility_id: h.id,
              label: `${h.name} ambulance`,
              number: value,
              kind: "ambulance",
              priority: 80,
              verification_status: "unverified",
              verified_by_user_id: null,
              verified_at: null,
              basis:
                "Registered by the hospital admin and verified by a second admin; to be dialled and verified (four-eyes).",
              active: true,
            },
            { onConflict: "key" },
          )
        : await ctx.sb.from("emergency_contacts").update({ active: false }).eq("key", k),
      "ambulance contact",
    );
  }
}

const verifyCapability: OpHandler = async (ctx, i) => {
  const key = capabilityKey(i.key);
  if (!key) throw new HubError(`Unknown capability: ${i.key}`);
  const row = await capabilityRow(ctx, key.key);
  const verdict = verifyVerdict(row, ctx.callerId);
  if (!verdict.ok) throw new HubError(verdict.reason, 409);
  return {
    audit: {
      action: "verify_capability",
      reason: reasonOr(i.reason, `${key.label} verified by a second admin`),
      before: { key: key.key, value: row!.value, author: row!.pendingBy },
      after: { value: row!.pendingValue },
    },
    apply: async () => {
      if (key.pathway) await writePathwayKey(ctx, key.key, row!.pendingValue);
      must(
        await ctx.sb
          .from("capability_values")
          .update({
            value: key.pathway ? null : row!.pendingValue,
            authored_by: row!.pendingBy,
            authored_at: row!.pendingAt,
            verified_by: ctx.callerId,
            verified_at: nowIso(),
            pending_value: null,
            pending_by: null,
            pending_at: null,
          })
          .eq("hospital_id", ctx.hospitalId)
          .eq("key", key.key),
        "verify",
      );
    },
  };
};

const rejectCapability: OpHandler = async (ctx, i) => {
  const key = capabilityKey(i.key);
  if (!key) throw new HubError(`Unknown capability: ${i.key}`);
  const row = await capabilityRow(ctx, key.key);
  if (!row?.pendingAt) throw new HubError("Nothing is waiting to be verified.", 409);
  return {
    audit: {
      action: "reject_capability",
      reason: i.reason,
      before: { key: key.key, pending: row.pendingValue, author: row.pendingBy },
    },
    apply: async () => {
      must(
        await ctx.sb
          .from("capability_values")
          .update({ pending_value: null, pending_by: null, pending_at: null })
          .eq("hospital_id", ctx.hospitalId)
          .eq("key", key.key),
        "reject",
      );
    },
  };
};

/* ─── availability (AV-1…AV-4) ──────────────────────────────────────── */

async function subjectLabel(ctx: Ctx, kind: string, ref: string): Promise<string> {
  const byId = async (table: string, what: string) => {
    const r = must(
      await ctx.sb
        .from(table)
        .select("name")
        .eq("id", ref)
        .eq("hospital_id", ctx.hospitalId)
        .maybeSingle(),
      what,
    ) as { name: string } | null;
    if (!r) throw new HubError(`That ${what} isn't at this hospital.`);
    return r.name;
  };
  switch (kind) {
    case "department":
    case "lab_section":
      return byId("hospital_departments", kind === "department" ? "department" : "section");
    case "ward":
      return byId("hospital_wards", "ward");
    case "clinic":
      return byId("service_lines", "clinic");
    case "test": {
      const t = must(
        await ctx.sb.from("loinc_codes").select("display").eq("code", ref).maybeSingle(),
        "test",
      ) as { display: string } | null;
      if (!t) throw new HubError("That test isn't in the ordering catalogue.");
      return t.display.slice(0, 120);
    }
    case "imaging": {
      if (!isImagingCode(ref)) throw new HubError("That imaging service isn't in the catalogue.");
      return ref;
    }
    case "capability": {
      const k = capabilityKey(ref);
      if (!k) throw new HubError("Unknown capability.");
      return k.label;
    }
  }
  throw new HubError("Unknown subject.");
}

async function problemEvents(ctx: Ctx, problemId: string): Promise<AvailabilityEvent[]> {
  const rows = must(
    await ctx.sb
      .from("availability_events")
      .select("*")
      .eq("hospital_id", ctx.hospitalId)
      .eq("problem_id", problemId)
      .order("at"),
    "events",
  ) as Record<string, unknown>[];
  return rows.map((r) => ({
    problemId: r.problem_id as string,
    subjectKind: r.subject_kind as string,
    subjectRef: r.subject_ref as string,
    subjectLabel: r.subject_label as string,
    event: r.event as AvailabilityEvent["event"],
    state: r.state as AvailabilityEvent["state"],
    reason: r.reason as string | null,
    note: r.note as string | null,
    expectedBackAt: r.expected_back_at as string | null,
    actorUserId: r.actor_user_id as string | null,
    at: r.at as string,
  }));
}

async function openProblem(ctx: Ctx, problemId: string) {
  const events = await problemEvents(ctx, problemId);
  const [open] = projectAvailability(events, new Date());
  if (!open)
    throw new HubError(
      events.length ? "That problem is already resolved." : "Problem not found at this hospital.",
      409,
    );
  return open;
}

function eventRow(
  ctx: Ctx,
  base: { problem_id: string; subject_kind: string; subject_ref: string; subject_label: string },
  e: Record<string, unknown>,
) {
  return { hospital_id: ctx.hospitalId, ...base, actor_user_id: ctx.callerId, ...e };
}

const reportProblem: OpHandler = async (ctx, i) => {
  await assertAnyHead(ctx);
  if (i.reason_code === "other" && !i.note)
    throw new HubError("Add a short note when the reason is Other.");
  const label = await subjectLabel(ctx, i.subject_kind, i.subject_ref);
  const problemId = crypto.randomUUID();
  const base = {
    problem_id: problemId,
    subject_kind: i.subject_kind,
    subject_ref: i.subject_ref,
    subject_label: label,
  };
  return {
    audit: {
      action: "report_availability",
      reason: reasonOr(i.reason, `${label}: reported ${i.state}`),
      after: {
        ...base,
        state: i.state,
        reason: i.reason_code,
        expected_back_at: i.expected_back_at ?? null,
      },
    },
    apply: async () => {
      must(
        await ctx.sb.from("availability_events").insert(
          eventRow(ctx, base, {
            event: "reported",
            state: i.state,
            reason: i.reason_code,
            note: i.note ?? null,
            expected_back_at: i.expected_back_at ?? null,
          }),
        ),
        "report",
      );
      return { problem_id: problemId };
    },
  };
};

const updateProblem: OpHandler = async (ctx, i) => {
  await assertAnyHead(ctx);
  const open = await openProblem(ctx, i.problem_id);
  const base = {
    problem_id: open.problemId,
    subject_kind: open.subjectKind,
    subject_ref: open.subjectRef,
    subject_label: open.subjectLabel,
  };
  const reasonCode = i.reason_code ?? open.reason ?? "other";
  const note = i.note ?? open.note;
  if (reasonCode === "other" && !note)
    throw new HubError("Add a short note when the reason is Other.");
  return {
    audit: {
      action: "report_availability",
      reason: reasonOr(i.reason, `${open.subjectLabel}: updated`),
      after: { problem_id: open.problemId },
    },
    apply: async () => {
      must(
        await ctx.sb.from("availability_events").insert(
          eventRow(ctx, base, {
            event: "updated",
            state: i.state ?? open.state,
            reason: reasonCode,
            note: note ?? null,
            expected_back_at:
              i.expected_back_at === undefined ? open.expectedBackAt : i.expected_back_at,
          }),
        ),
        "update",
      );
    },
  };
};

const resolveProblem: OpHandler = async (ctx, i) => {
  await assertAnyHead(ctx);
  const open = await openProblem(ctx, i.problem_id);
  const base = {
    problem_id: open.problemId,
    subject_kind: open.subjectKind,
    subject_ref: open.subjectRef,
    subject_label: open.subjectLabel,
  };
  return {
    audit: {
      action: "report_availability",
      reason: reasonOr(i.reason, `${open.subjectLabel}: back to normal`),
      after: { problem_id: open.problemId, resolved: true },
    },
    apply: async () => {
      must(
        await ctx.sb
          .from("availability_events")
          .insert(eventRow(ctx, base, { event: "resolved", note: i.note ?? null })),
        "resolve",
      );
    },
  };
};

const confirmStillDown: OpHandler = async (ctx, i) => {
  await assertAnyHead(ctx);
  const open = await openProblem(ctx, i.problem_id);
  const base = {
    problem_id: open.problemId,
    subject_kind: open.subjectKind,
    subject_ref: open.subjectRef,
    subject_label: open.subjectLabel,
  };
  return {
    audit: {
      action: "report_availability",
      reason: reasonOr(i.reason, `${open.subjectLabel}: confirmed still down`),
      after: { problem_id: open.problemId },
    },
    apply: async () => {
      must(
        await ctx.sb.from("availability_events").insert(
          eventRow(ctx, base, {
            event: "confirmed",
            expected_back_at: i.expected_back_at ?? null,
          }),
        ),
        "confirm",
      );
    },
  };
};

/* ─── closures (CLN-4; the cancel flow runs per session afterwards) ─── */

const addClosure: OpHandler = async (ctx, i) => {
  if (i.ends_on < i.starts_on) throw new HubError("The closure ends before it starts.");
  const row: Record<string, unknown> = {
    hospital_id: ctx.hospitalId,
    scope: i.scope,
    starts_on: i.starts_on,
    ends_on: i.ends_on,
    reason: i.reason,
    created_by: ctx.callerId,
  };
  let label = "The whole hospital";
  if (i.scope !== "hospital") {
    if (!i.target_id) throw new HubError("Choose what is closing.");
    if (i.scope === "department") {
      const d = await loadDepartment(ctx, i.target_id);
      row.department_id = d.id;
      label = d.name;
    } else if (i.scope === "ward") {
      const w = must(
        await ctx.sb
          .from("hospital_wards")
          .select("id, name")
          .eq("id", i.target_id)
          .eq("hospital_id", ctx.hospitalId)
          .maybeSingle(),
        "ward",
      ) as { id: string; name: string } | null;
      if (!w) throw new HubError("Ward not found at this hospital.");
      row.ward_id = w.id;
      label = w.name;
    } else {
      const l = must(
        await ctx.sb
          .from("service_lines")
          .select("id, name")
          .eq("id", i.target_id)
          .eq("hospital_id", ctx.hospitalId)
          .maybeSingle(),
        "clinic",
      ) as { id: string; name: string } | null;
      if (!l) throw new HubError("Clinic not found at this hospital.");
      row.service_line_id = l.id;
      label = l.name;
    }
  }
  return {
    audit: { action: "add_closure", reason: i.reason, after: { ...row, label } },
    apply: async () => {
      const c = must(
        await ctx.sb.from("service_closures").insert(row).select("id").single(),
        "closure",
      ) as { id: string };
      return { closure_id: c.id };
    },
  };
};

const liftClosure: OpHandler = async (ctx, i) => {
  const c = must(
    await ctx.sb
      .from("service_closures")
      .select("id, lifted_at")
      .eq("id", i.closure_id)
      .eq("hospital_id", ctx.hospitalId)
      .maybeSingle(),
    "closure",
  ) as { id: string; lifted_at: string | null } | null;
  if (!c) throw new HubError("Closure not found at this hospital.");
  if (c.lifted_at) throw new HubError("Already lifted.", 409);
  return {
    audit: {
      action: "lift_closure",
      reason: reasonOr(i.reason, "Closure lifted"),
      before: { closure_id: c.id },
    },
    apply: async () => {
      must(
        await ctx.sb
          .from("service_closures")
          .update({ lifted_at: nowIso(), lifted_by: ctx.callerId })
          .eq("id", c.id),
        "lift",
      );
    },
  };
};

/* ─── presets (PS-1, PS-2) and the legacy import (Appendix B) ───────── */

async function currentSetup(ctx: Ctx) {
  const [depts, lines, offers] = await Promise.all([
    ctx.sb
      .from("hospital_departments")
      .select("id, parent_id, catalogue_code, slug, archived_at")
      .eq("hospital_id", ctx.hospitalId),
    ctx.sb.from("service_lines").select("catalogue_code").eq("hospital_id", ctx.hospitalId),
    ctx.sb
      .from("diagnostic_offerings")
      .select("code")
      .eq("hospital_id", ctx.hospitalId)
      .eq("kind", "imaging"),
  ]);
  const d = must(depts, "departments") as {
    id: string;
    parent_id: string | null;
    catalogue_code: string | null;
    slug: string;
    archived_at: string | null;
  }[];
  const lab = d.find((x) => x.parent_id === null && x.catalogue_code === "LABORATORY");
  return {
    rows: d,
    labId: lab?.id ?? null,
    have: {
      departmentCodes: new Set(
        d
          .filter((x) => x.parent_id === null && x.catalogue_code)
          .map((x) => x.catalogue_code as string),
      ),
      labSectionCodes: new Set(
        d
          .filter((x) => lab && x.parent_id === lab.id && x.catalogue_code)
          .map((x) => x.catalogue_code as string),
      ),
      clinicCodes: new Set(
        (must(lines, "lines") as { catalogue_code: string | null }[])
          .map((l) => l.catalogue_code)
          .filter((c): c is string => !!c),
      ),
      imagingCodes: new Set((must(offers, "offerings") as { code: string }[]).map((o) => o.code)),
    },
  };
}

/** Adds planned structure: departments (not live), lab sections, clinics (active=false), imaging (unconfirmed). */
async function addPlanned(
  ctx: Ctx,
  want: {
    departments: string[];
    labSections: string[];
    clinics: string[];
    customClinics: string[];
    imaging: string[];
  },
) {
  const setup = await currentSetup(ctx);
  const deptRows = want.departments
    .filter((c) => !setup.have.departmentCodes.has(c) && departmentByCode(c))
    .map((c) => {
      const d = departmentByCode(c)!;
      return {
        hospital_id: ctx.hospitalId,
        name: d.label,
        slug: departmentSlug(c),
        kind: d.kind,
        catalogue_code: c,
      };
    });
  if (deptRows.length)
    must(await ctx.sb.from("hospital_departments").insert(deptRows), "departments");
  const after = await currentSetup(ctx);
  if (after.labId) {
    const sections = want.labSections
      .filter((s) => !after.have.labSectionCodes.has(s))
      .map((s) => ({
        hospital_id: ctx.hospitalId,
        parent_id: after.labId,
        name: LAB_SECTIONS.find((x) => x.code === s)?.label ?? s,
        slug: s,
        kind: "diagnostic",
        catalogue_code: s,
      }));
    if (sections.length)
      must(await ctx.sb.from("hospital_departments").insert(sections), "sections");
  }
  const byCode = new Map(
    after.rows
      .filter((r) => r.parent_id === null && r.catalogue_code && !r.archived_at)
      .map((r) => [r.catalogue_code as string, r.id]),
  );
  const skipped: string[] = [];
  const lineRows: Record<string, unknown>[] = [];
  for (const code of want.clinics.filter((c) => !after.have.clinicCodes.has(c))) {
    const cat = clinicByCode(code)!;
    const deptId = byCode.get(cat.department);
    if (!deptId) {
      skipped.push(
        `${cat.label} (needs ${departmentByCode(cat.department)?.label ?? cat.department})`,
      );
      continue;
    }
    lineRows.push(
      newLine(
        ctx,
        deptId,
        `${cat.label} clinic`,
        await freeLineSlug(ctx, slugify(`${cat.label} clinic`)),
        code,
        cat.confidential,
      ),
    );
  }
  const fallbackDept = after.rows.find((r) => r.parent_id === null && !r.archived_at)?.id;
  for (const name of want.customClinics) {
    if (!fallbackDept) {
      skipped.push(`${name} (needs a department)`);
      continue;
    }
    lineRows.push(
      newLine(
        ctx,
        fallbackDept,
        name,
        await freeLineSlug(ctx, slugify(name) || "clinic"),
        null,
        false,
      ),
    );
  }
  if (lineRows.length) must(await ctx.sb.from("service_lines").insert(lineRows), "clinics");
  const imaging = want.imaging
    .filter((c) => !after.have.imagingCodes.has(c) && isImagingCode(c))
    .map((code) => ({
      hospital_id: ctx.hospitalId,
      kind: "imaging",
      code,
      provision: "in_house",
      confirmed_at: null,
      updated_by: ctx.callerId,
    }));
  if (imaging.length) must(await ctx.sb.from("diagnostic_offerings").insert(imaging), "imaging");
  return {
    departments: deptRows.length,
    clinics: lineRows.length,
    imaging: imaging.length,
    skipped,
  };
}

const applyPreset: OpHandler = async (ctx, i) => {
  const h = must(
    await ctx.sb.from("hospitals").select("level").eq("id", ctx.hospitalId).single(),
    "hospital",
  ) as { level: string };
  const preset = signedPresetFor(h.level);
  if (!preset)
    throw new HubError("There is no signed MoH standard for this facility level yet.", 409);
  const setup = await currentSetup(ctx);
  const plan = planPreset(preset, setup.have);
  if (!plan.add.length) throw new HubError("Everything in the standard is already set up.", 409);
  const pick = (k: string) => plan.add.filter((a) => a.kind === k).map((a) => a.code);
  return {
    audit: {
      action: "apply_service_preset",
      reason: reasonOr(
        i.reason,
        `Started from the MoH standard for a ${preset.levelLabel} (${preset.version})`,
      ),
      after: {
        preset: preset.version,
        level: preset.level,
        add: plan.add.map((a) => `${a.kind}:${a.code}`),
        skip: plan.skip.length,
      },
    },
    apply: async () => {
      const r = await addPlanned(ctx, {
        departments: pick("department"),
        labSections: pick("lab_section"),
        clinics: pick("clinic"),
        customClinics: [],
        imaging: pick("imaging"),
      });
      return { ...r, already: plan.skip.map((s) => s.label) };
    },
  };
};

const importLegacy: OpHandler = async (ctx, i) => {
  const state = must(
    await ctx.sb
      .from("hospital_services_state")
      .select("legacy_import")
      .eq("hospital_id", ctx.hospitalId)
      .maybeSingle(),
    "hub state",
  ) as { legacy_import: string | null } | null;
  if (state?.legacy_import === "accepted")
    throw new HubError("Your application's answers are already in.", 409);
  const app = must(
    await ctx.sb
      .from("hospital_applications")
      .select(
        "specialised_clinics, specialised_clinics_other, diagnostic_services, support_services, services_offered, has_onsite_pharmacy",
      )
      .eq("approved_hospital_id", ctx.hospitalId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "application",
  ) as Record<string, unknown> | null;
  if (!app) throw new HubError("No application on file for this hospital.", 409);
  const plan = planLegacyImport({
    specialisedClinics: (app.specialised_clinics as string[]) ?? [],
    specialisedClinicsOther: (app.specialised_clinics_other as string[]) ?? [],
    diagnosticServices: (app.diagnostic_services as string[]) ?? [],
    supportServices: (app.support_services as string[]) ?? [],
    servicesOffered: (app.services_offered as string[]) ?? [],
    hasOnsitePharmacy: (app.has_onsite_pharmacy as boolean | null) ?? null,
  });
  const decided = {
    hospital_id: ctx.hospitalId,
    legacy_decided_at: nowIso(),
    legacy_decided_by: ctx.callerId,
  };
  if (!i.accept) {
    return {
      audit: {
        action: "import_legacy_services",
        reason: reasonOr(i.reason, "Declined bringing in the application's answers"),
      },
      apply: async () => {
        must(
          await ctx.sb
            .from("hospital_services_state")
            .upsert({ ...decided, legacy_import: "declined" }),
          "state",
        );
      },
    };
  }
  return {
    audit: {
      action: "import_legacy_services",
      reason: reasonOr(i.reason, "Brought in what the hospital told us when it applied"),
      after: { ...plan },
    },
    apply: async () => {
      const r = await addPlanned(ctx, plan);
      // Routing values arrive PENDING (CAP-5): the importer can't verify them.
      for (const c of plan.capabilities) {
        const key = capabilityKey(c.key)!;
        const checked = checkCapabilityValue(c.key, c.value);
        if (!checked.ok) continue;
        const existing = await capabilityRow(ctx, c.key);
        if (existing?.value != null || existing?.pendingAt) continue; // never overwrite
        const patch = key.routing
          ? {
              hospital_id: ctx.hospitalId,
              key: c.key,
              pending_value: checked.value,
              pending_by: ctx.callerId,
              pending_at: nowIso(),
            }
          : {
              hospital_id: ctx.hospitalId,
              key: c.key,
              value: checked.value,
              authored_by: ctx.callerId,
              authored_at: nowIso(),
            };
        must(
          await ctx.sb.from("capability_values").upsert(patch, { onConflict: "hospital_id,key" }),
          "capability",
        );
      }
      must(
        await ctx.sb
          .from("hospital_services_state")
          .upsert({ ...decided, legacy_import: "accepted" }),
        "state",
      );
      return { ...r, notes: plan.notes };
    },
  };
};

export const SERVICE_OPS: Record<string, OpHandler> = {
  add_clinics: addClinics,
  update_clinic: updateClinic,
  upsert_offerings: upsertOfferings,
  set_capability: setCapability,
  verify_capability: verifyCapability,
  reject_capability: rejectCapability,
  report_problem: reportProblem,
  update_problem: updateProblem,
  resolve_problem: resolveProblem,
  confirm_still_down: confirmStillDown,
  add_closure: addClosure,
  lift_closure: liftClosure,
  apply_preset: applyPreset,
  import_legacy: importLegacy,
};
