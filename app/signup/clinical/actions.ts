"use server";

import type { SignupResult } from "@/lib/onboarding/account";
import type { Profession } from "@/lib/onboarding/profession";
import type { Workplace } from "@/lib/onboarding/workplaces";
import { revalidatePath } from "next/cache";

import { encrypt } from "@/lib/encryption";
import { assertSignupsOpen } from "@/lib/legal";
import { logger } from "@/lib/logger";
import { createAccount, recordConsent, removeAccount } from "@/lib/onboarding/account";
import { normalizeUgPhone } from "@/lib/onboarding/fields";
import { professionById } from "@/lib/onboarding/profession";
import { clinicalSchema } from "@/lib/onboarding/schemas";
import { validateSignup } from "@/lib/onboarding/submit";
import { workplacesOf } from "@/lib/onboarding/workplaces";
import { createServiceClient } from "@/lib/supabase/service";

/** A profession's cadre, generic role and grade rows, as the columns a request stores; null if any is missing. */
async function postFor(service: ReturnType<typeof createServiceClient>, p: Profession) {
  const [{ data: cadre }, { data: role }] = await Promise.all([
    service.from("cadres").select("id").eq("code", p.cadre).maybeSingle(),
    service.from("roles").select("id, cadre_id").eq("code", p.role).maybeSingle(),
  ]);
  if (!cadre || !role || role.cadre_id !== cadre.id) return null;
  const { data: grade } = p.grade
    ? await service
        .from("cadre_grades")
        .select("id")
        .eq("cadre_id", cadre.id)
        .eq("code", p.grade)
        .maybeSingle()
    : { data: null };
  return {
    cadre_id: cadre.id as string,
    cadre_grade_id: (grade?.id as string | undefined) ?? null,
    role_id: role.id as string,
  };
}

/**
 * Clinical staff signup v2 (ADR 0123). One profession → council, cadre, grade and the cadre's
 * generic role (PRO-1/2); the department is the affiliation's. The licence is uploaded straight
 * to storage after this returns (DOC-4) — or later, from the pending page; approval waits (DOC-1).
 */
export async function submitClinicalSignup(input: unknown, key: unknown): Promise<SignupResult> {
  assertSignupsOpen(); // S8 D1: no personal data before the legal basics (also in validateSignup)
  const checked = await validateSignup(clinicalSchema, input, key);
  if ("result" in checked) return checked.result;
  const v = checked.data;
  const profession = professionById(v.profession)!;
  const service = createServiceClient();

  // One request per hospital (ADR 0530); a post that differs at another hospital resolves on its own.
  const places = workplacesOf(v);
  const postIds = [...new Set(places.map((p) => p.profession))];
  const [{ data: council }, { data: depts }, ...resolved] = await Promise.all([
    service.from("councils").select("id").eq("code", profession.council).maybeSingle(),
    service
      .from("hospital_departments")
      .select("id, hospital_id")
      .not("medsync_live_at", "is", null)
      .is("archived_at", null)
      .in(
        "id",
        places.map((p) => p.departmentId),
      ),
    ...postIds.map((id) => postFor(service, professionById(id)!)),
  ]);
  const posts = new Map(postIds.map((id, i) => [id, resolved[i]]));
  if (!council || resolved.some((p) => !p)) {
    logger.error("clinical-signup.reference_missing", { profession: profession.id });
    return {
      ok: false,
      formError: "We can't register this profession right now. Try again later.",
    };
  }
  const deptAt = (p: Workplace) =>
    (depts ?? []).some((d) => d.id === p.departmentId && d.hospital_id === p.hospitalId);
  if (!deptAt(places[0]!))
    return { ok: false, fieldErrors: { departmentId: "Choose a department at this hospital." } };
  if (!places.every(deptAt))
    return {
      ok: false,
      fieldErrors: { "moreWorkplaces.root": "Choose a department at each hospital you added." },
    };
  let specialtyId: string | null = null;
  if (profession.needsSpecialty && v.specialty && v.specialty !== "unlisted") {
    const { data: sp } = await service
      .from("specialties")
      .select("id")
      .eq("id", v.specialty)
      .maybeSingle();
    if (!sp)
      return { ok: false, fieldErrors: { specialty: "Choose your specialty from the list." } };
    specialtyId = sp.id;
  }

  const account = await createAccount({
    email: v.email,
    password: v.password,
    fullName: v.fullName.trim(),
    key: checked.key,
  });
  if ("error" in account) return { ok: false, formError: account.error };
  const uploads = v.licence === "file" ? ["licence"] : [];
  if (account.replay) return { ok: true, next: "/onboarding/clinical-pending", uploads };
  const userId = account.userId;

  const { error: profileError } = await service.from("clinician_profiles").insert({
    id: userId,
    council_id: council.id,
    registration_number: v.registrationNumber.trim(),
    registration_expiry: null, // the approving admin records it from the document
    licence_document_path: null, // attached after upload (DOC-4)
  });
  const { error: affError } = profileError
    ? { error: profileError }
    : await service.from("staff_affiliations").insert(
        // One statement: every hospital's request is saved, or none is.
        places.map((p) => ({
          user_id: userId,
          hospital_id: p.hospitalId,
          department_id: p.departmentId,
          ...posts.get(p.profession)!,
          specialty_id: professionById(p.profession)!.needsSpecialty ? specialtyId : null,
          employment_type: p.employmentType,
          state: "pending_approval",
        })),
      );
  if (profileError || affError) {
    logger.error("clinical-signup.insert_failed", {
      reason: (profileError ?? affError)!.message,
    });
    await removeAccount(userId); // v2 never strands a half-made account
    return { ok: false, formError: "We couldn't save your details. Nothing was kept — try again." };
  }

  await recordConsent(userId, v.consentVersion, v.consentSha).catch((e: unknown) =>
    logger.error("signup.consent.insert_failed", { reason: String(e) }),
  );
  await service
    .from("users")
    .update({ state: "pending_approval", phone: encrypt(normalizeUgPhone(v.phone)!) })
    .eq("id", userId);
  logger.info("clinical-signup.completed", {
    hospital_id: v.hospitalId,
    hospitals: places.length,
    licence_now: v.licence === "file",
  });
  revalidatePath("/onboarding/clinical-pending");
  return { ok: true, next: "/onboarding/clinical-pending", uploads };
}
