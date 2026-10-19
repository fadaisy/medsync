"use server";

import type { Surface } from "./test-menu-read";
import type { ActionResult } from "@/lib/emr/write/context";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { LAB_TEST_MENU } from "@/content/lab-test-menu";
import { labCatalogueRequests, labOrderProfiles, labSettings, testCatalogue } from "@/db/schema";
import { getAuthState } from "@/lib/auth";
import { requireEmrActor } from "@/lib/emr/actor";
import { asClinicalWriter } from "@/lib/emr/db";
import { actionError, EmrWriteError } from "@/lib/emr/write/context";
import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { LEVELS, looksLikeIdentifier, namesRestricted, notOffered, SECTIONS } from "./test-menu";
import { loadCatalogueTests, loadMenuOfferings } from "./test-menu-read";
import { addFromTemplate, saveOfferings } from "./test-menu-write";

/**
 * Lab test menu v2 writes (TM-3, TM-7, TM-10, TM-11, TM-13; TM-D09). The house contract: zod with clientKey →
 * the scope (getUser, AAL2) → permission → one transaction → `{ok, id, serverTime}`. The hospital admin and the
 * laboratory lead edit the same store; nothing is signed. The audit trigger writes one row per test changed.
 */

const surface = z.enum(["lab", "hub"]);
const clientKey = z.string().min(8).max(80);
const code = z.string().regex(/^test\.[a-z0-9_]{2,60}$/);
const sectionKey = z.enum(SECTIONS.map((s) => s.key) as [string, ...string[]]);

const invalid = (m: string) => new EmrWriteError("invalid", m);
const ok = (id: string) => ({ ok: true as const, id, serverTime: new Date().toISOString() });

/** TM-D09: the hospital admin (hub) or the laboratory lead (lab.manage). */
async function editor(s: Surface) {
  if (s === "hub") {
    const a = await requireHospitalAdminScope();
    return { userId: a.userId, hospitalId: a.hospitalId };
  }
  const a = await requireEmrActor("lab");
  if (!a.labPermissions?.includes("lab.manage"))
    throw new EmrWriteError("forbidden", "Only the laboratory lead sets up the test menu.");
  return { userId: a.userId, hospitalId: a.hospitalId };
}

/* ─── TM-3: offerings (one test, a bulk selection, a section's hours) ─── */

const Item = z
  .object({
    code,
    where: z.enum(["in_house", "referred", "not_offered"]),
    sectionOverride: sectionKey.nullable(),
    hours: z.enum(["24h", "scheduled"]).nullable(),
    hoursNote: z.string().trim().max(60).nullable(),
    statedTurnaroundMinutes: z.number().int().min(1).max(129600).nullable(),
    referredTo: z.string().trim().max(120).nullable(),
  })
  .strict();
const Save = z.object({ surface, clientKey, items: z.array(Item).min(1).max(300) });

export async function saveOfferingsAction(raw: unknown): Promise<ActionResult> {
  const p = Save.safeParse(raw);
  if (!p.success) return { ok: false, code: "invalid", error: "Check the test settings." };
  try {
    const me = await editor(p.data.surface);
    await saveOfferings(me, p.data.items, new Date());
    return ok(p.data.clientKey);
  } catch (e) {
    return actionError(e);
  }
}

/* ─── TM-6, TM-7: start from your level ──────────────────────────────── */

const Template = z.object({
  surface,
  clientKey,
  level: z.enum(LEVELS),
  sections: z.array(sectionKey).min(1).max(8),
  hours: z.enum(["24h", "scheduled"]).nullable(),
});

export async function applyTemplateAction(
  raw: unknown,
): Promise<ActionResult<{ added: number; kept: number; outside: number }>> {
  const p = Template.safeParse(raw);
  if (!p.success) return { ok: false, code: "invalid", error: "Choose a level and a section." };
  try {
    const me = await editor(p.data.surface);
    const counts = await addFromTemplate(me, p.data, new Date());
    return { ...ok(p.data.clientKey), data: counts };
  } catch (e) {
    return actionError(e);
  }
}

/* ─── TM-5: a section the lab does not run ───────────────────────────── */

export async function setSectionHiddenAction(raw: unknown): Promise<ActionResult> {
  const p = z.object({ surface, section: sectionKey, hidden: z.boolean() }).safeParse(raw);
  if (!p.success) return { ok: false, code: "invalid", error: "Choose a section." };
  try {
    const me = await editor(p.data.surface);
    const s = p.data.section;
    await asClinicalWriter(me, (tx) =>
      tx
        .insert(labSettings)
        .values({
          hospitalId: me.hospitalId,
          hiddenSections: p.data.hidden ? [s] : [],
          updatedBy: me.userId,
        })
        .onConflictDoUpdate({
          target: labSettings.hospitalId,
          set: {
            hiddenSections: p.data.hidden
              ? sql`array_append(array_remove(${labSettings.hiddenSections}, ${s}), ${s})`
              : sql`array_remove(${labSettings.hiddenSections}, ${s})`,
            updatedBy: me.userId,
            updatedAt: new Date(),
          },
        }),
    );
    return ok(s);
  } catch (e) {
    return actionError(e);
  }
}

/* ─── TM-10: hospital profiles ───────────────────────────────────────── */

const Profile = z.object({
  surface,
  clientKey,
  id: z.uuid().nullable(),
  name: z.string().trim().min(2).max(80),
  note: z.string().trim().max(300).nullable(),
  testCodes: z.array(code).min(1).max(30),
});

export async function saveProfileAction(raw: unknown): Promise<ActionResult> {
  const p = Profile.safeParse(raw);
  if (!p.success)
    return { ok: false, code: "invalid", error: "Give the profile a name and its tests." };
  try {
    if (namesRestricted(p.data.name, LAB_TEST_MENU.restrictedNames))
      throw invalid(LAB_TEST_MENU.profileRefused);
    const me = await editor(p.data.surface);
    const tests = await loadCatalogueTests(me.hospitalId, true);
    const menu = await loadMenuOfferings(me.hospitalId, new Set(tests.map((t) => t.code)));
    const codes = [...new Set(p.data.testCodes)];
    if (notOffered(codes, menu).length) throw invalid(LAB_TEST_MENU.profileNeedsOffered);
    const values = {
      name: p.data.name,
      note: p.data.note || null,
      testCodes: codes,
      updatedBy: me.userId,
    };
    const id = await asClinicalWriter(me, async (tx) => {
      if (p.data.id) {
        const [r] = await tx
          .update(labOrderProfiles)
          .set({ ...values, updatedAt: new Date() })
          .where(
            and(eq(labOrderProfiles.id, p.data.id), eq(labOrderProfiles.hospitalId, me.hospitalId)),
          )
          .returning({ id: labOrderProfiles.id });
        if (!r) throw new EmrWriteError("not_found", "That profile was not found.");
        return r.id;
      }
      const [r] = await tx
        .insert(labOrderProfiles)
        .values({
          ...values,
          hospitalId: me.hospitalId,
          createdBy: me.userId,
          clientKey: p.data.clientKey,
        })
        .onConflictDoNothing({ target: labOrderProfiles.clientKey })
        .returning({ id: labOrderProfiles.id });
      return r?.id ?? p.data.clientKey;
    });
    return ok(id);
  } catch (e) {
    if (e instanceof Error && /lab_order_profiles_name_uidx/.test(e.message))
      return { ok: false, code: "conflict", error: "A profile with that name already exists." };
    return actionError(e);
  }
}

export async function retireProfileAction(raw: unknown): Promise<ActionResult> {
  const p = z.object({ surface, id: z.uuid() }).safeParse(raw);
  if (!p.success) return { ok: false, code: "invalid", error: "Choose a profile." };
  try {
    const me = await editor(p.data.surface);
    await asClinicalWriter(me, (tx) =>
      tx
        .update(labOrderProfiles)
        .set({ active: false, updatedBy: me.userId, updatedAt: new Date() })
        .where(
          and(eq(labOrderProfiles.id, p.data.id), eq(labOrderProfiles.hospitalId, me.hospitalId)),
        ),
    );
    return ok(p.data.id);
  } catch (e) {
    return actionError(e);
  }
}

/* ─── TM-11: catalogue requests ──────────────────────────────────────── */

const Request = z.object({
  surface,
  clientKey,
  name: z.string().trim().min(2).max(120),
  purpose: z.string().trim().min(3).max(500),
  specimen: z.string().trim().min(2).max(120),
  route: z.enum(["in_house", "referred"]),
  reference: z.string().trim().max(300).nullable(),
});

export async function createRequestAction(raw: unknown): Promise<ActionResult> {
  const p = Request.safeParse(raw);
  if (!p.success)
    return { ok: false, code: "invalid", error: "Fill in the name, purpose and specimen." };
  try {
    const d = p.data;
    for (const f of [d.name, d.purpose, d.specimen, d.reference ?? ""])
      if (looksLikeIdentifier(f)) throw invalid(LAB_TEST_MENU.identifierRefused);
    const me = await editor(d.surface);
    const id = await asClinicalWriter(me, async (tx) => {
      const [r] = await tx
        .insert(labCatalogueRequests)
        .values({
          hospitalId: me.hospitalId,
          requestedBy: me.userId,
          name: d.name,
          purpose: d.purpose,
          specimen: d.specimen,
          route: d.route,
          reference: d.reference || null,
          clientKey: d.clientKey,
        })
        .onConflictDoNothing({ target: labCatalogueRequests.clientKey })
        .returning({ id: labCatalogueRequests.id });
      return r?.id ?? d.clientKey;
    });
    return ok(id);
  } catch (e) {
    return actionError(e);
  }
}

const Decide = z.discriminatedUnion("state", [
  z.object({ id: z.uuid(), state: z.literal("in_review") }),
  z.object({ id: z.uuid(), state: z.literal("added"), testCode: code }),
  z.object({
    id: z.uuid(),
    state: z.literal("declined"),
    reason: z.string().trim().min(3).max(500),
  }),
]);

/** TM-11: the MedSync catalogue team (superadmin). "Added" names a test a signed addendum made active. */
export async function decideRequestAction(raw: unknown): Promise<ActionResult> {
  const p = Decide.safeParse(raw);
  if (!p.success)
    return { ok: false, code: "invalid", error: "A decline needs a reason; added needs a test." };
  try {
    const state = await getAuthState();
    if (!state.user || state.aal !== "aal2" || !state.roles.includes("superadmin"))
      throw new EmrWriteError("forbidden", "Only the MedSync catalogue team decides requests.");
    const d = p.data;
    const [req] = await (await import("@/db")).db
      .select({ hospitalId: labCatalogueRequests.hospitalId, state: labCatalogueRequests.state })
      .from(labCatalogueRequests)
      .where(eq(labCatalogueRequests.id, d.id));
    if (!req) throw new EmrWriteError("not_found", "That request was not found.");
    if (req.state === "added" || req.state === "declined")
      throw new EmrWriteError("conflict", "This request is already decided.");
    await asClinicalWriter({ userId: state.user.id, hospitalId: req.hospitalId }, async (tx) => {
      if (d.state === "added") {
        const [t] = await tx
          .select({ active: testCatalogue.active })
          .from(testCatalogue)
          .where(and(isNull(testCatalogue.hospitalId), eq(testCatalogue.code, d.testCode)));
        if (!t?.active) throw invalid(LAB_TEST_MENU.notInCatalogue);
      }
      await tx
        .update(labCatalogueRequests)
        .set({
          state: d.state,
          reason: d.state === "declined" ? d.reason : null,
          testCode: d.state === "added" ? d.testCode : null,
          decidedBy: d.state === "in_review" ? null : state.user!.id,
          decidedAt: d.state === "in_review" ? null : new Date(),
          updatedAt: new Date(),
        })
        .where(eq(labCatalogueRequests.id, d.id));
    });
    return ok(d.id);
  } catch (e) {
    return actionError(e);
  }
}
