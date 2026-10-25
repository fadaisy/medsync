import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { patientFromBearer } from "@/app/api/mobile/visit-summaries/_lib/caller";
import { db } from "@/db";
import { patientProfiles } from "@/db/schema/patient-profiles";
import { encrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import { allow } from "@/lib/onboarding/rate-limit";
import { ID_LOCKED, parseDetails } from "./_lib/rules";

export const dynamic = "force-dynamic";

const BUSY = "Too many tries. Wait a minute and try again.";

/**
 * The phone's "A few more details" (Tide v1, after sign-up). The encrypted fields need the
 * server's key, so the phone sends plaintext here over TLS and the route encrypts, as the web's
 * profile actions do (Drizzle, filtered by the caller's own id; RLS is defence in depth).
 *
 * GET  → what is on file, never decrypted: { idOnFile, idType, nokOnFile, relationship,
 *        titleCode, preferredLanguage }.
 * POST { title?, language?, id?: {type, number}, nok?: {name, relationship, phone} | null }
 *      → { ok, saved: Section[], errors: { [section]: words } }. Only the sections given are
 *      written (never phone or village); an ID is added only while none is on file.
 */
export async function GET(request: Request) {
  if (!(await allow("mobile-profile", 30)))
    return NextResponse.json({ error: BUSY }, { status: 429 });
  const caller = await patientFromBearer(request);
  if (!caller.ok) return caller.response;

  const [row] = await db
    .select({
      idType: patientProfiles.idType,
      nokName: patientProfiles.nokNameEncrypted,
      relationship: patientProfiles.nokRelationship,
      titleCode: patientProfiles.titleCode,
      preferredLanguage: patientProfiles.preferredLanguage,
    })
    .from(patientProfiles)
    .where(eq(patientProfiles.id, caller.userId))
    .limit(1);
  if (!row) return NextResponse.json({ error: "No patient profile on this account." }, { status: 404 });

  return NextResponse.json({
    idOnFile: row.idType !== "none",
    idType: row.idType === "none" ? null : row.idType,
    nokOnFile: row.nokName !== null,
    relationship: row.relationship,
    titleCode: row.titleCode,
    preferredLanguage: row.preferredLanguage,
  });
}

export async function POST(request: Request) {
  if (!(await allow("mobile-profile-save", 10)))
    return NextResponse.json({ error: BUSY }, { status: 429 });
  const caller = await patientFromBearer(request);
  if (!caller.ok) return caller.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Try again." }, { status: 400 });
  }
  const { data, errors } = parseDetails(body);
  const saved: string[] = [];

  const set: Partial<typeof patientProfiles.$inferInsert> = {};
  if (data.title !== undefined) set.titleCode = data.title;
  if (data.language !== undefined) set.preferredLanguage = data.language;
  if (data.nok !== undefined) {
    set.nokNameEncrypted = data.nok ? encrypt(data.nok.name) : null;
    set.nokRelationship = data.nok?.relationship ?? null;
    set.nokPhoneEncrypted = data.nok?.phone ? encrypt(data.nok.phone) : null;
  }

  try {
    if (Object.keys(set).length > 0) {
      await db
        .update(patientProfiles)
        .set({ ...set, updatedAt: new Date() })
        .where(eq(patientProfiles.id, caller.userId));
      if (data.title !== undefined) saved.push("title");
      if (data.language !== undefined) saved.push("language");
      if (data.nok !== undefined) saved.push("nok");
    }
    if (data.id) {
      // As addPatientIdAction: the WHERE makes "only while none is on file" race-safe.
      const added = await db
        .update(patientProfiles)
        .set({ idType: data.id.type, idNumberEncrypted: encrypt(data.id.number), updatedAt: new Date() })
        .where(and(eq(patientProfiles.id, caller.userId), eq(patientProfiles.idType, "none")))
        .returning({ id: patientProfiles.id });
      if (added.length === 0) errors.id = ID_LOCKED;
      else saved.push("id");
    }
  } catch (err) {
    // The error's code only: a failed query's text can carry the values it was given.
    logger.error("mobile.profile.save_failed", {
      sections: Object.keys(data),
      code: (err as { code?: unknown }).code ?? null,
    });
    return NextResponse.json(
      { ok: false, saved, errors: { ...errors, form: "We couldn't save those details. Try again in a moment." } },
      { status: 500 },
    );
  }

  logger.info("mobile.profile.saved", { sections: saved, refused: Object.keys(errors) });
  return NextResponse.json({ ok: Object.keys(errors).length === 0, saved, errors });
}
