"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { LAB_ADMIN } from "@/content/hospital-admin/lab";
import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { callEdge } from "@/lib/supabase/edge";
import { IMAGING_ITEMS } from "@/supabase/functions/_shared/services-hub";

/*
 * Laboratory and imaging (phase 2 of ADR 0516): the writes the test menu's own actions do not cover, through the
 * same ha-services-hub ops the old Diagnostics tab ran. The scope ALWAYS comes from requireHospitalAdminScope(); the
 * Edge Function owns the role check, the audit row and the write. The test menu writes stay in
 * lib/lab/test-menu-actions.ts (surface "hub").
 */

type Result = { ok: true } | { ok: false; error: string };

const PATH = "/hospital-admin/lab";

const Imaging = z.object({
  code: z.enum(IMAGING_ITEMS.map((i) => i.code) as [string, ...string[]]),
  provision: z.enum(["in_house", "referred", "not_offered"]),
  hours: z.enum(["24h", "scheduled"]).nullable(),
  hours_note: z.string().trim().max(60).nullable(),
  stated_tat: z.string().trim().max(40).nullable(),
  referred_to: z.string().trim().max(120).nullable(),
  machines: z.number().int().min(0).max(500).nullable(),
});

/** One imaging service (`upsert_offerings`, kind imaging). Fields that do not apply to its "where" are cleared. */
export async function saveImagingAction(raw: unknown): Promise<Result> {
  const p = Imaging.safeParse(raw);
  if (!p.success) return { ok: false, error: LAB_ADMIN.errors.invalid };
  const i = p.data;
  const inHouse = i.provision === "in_house";
  const scope = await requireHospitalAdminScope();
  const r = await callEdge(
    "ha-services-hub",
    {
      op: "upsert_offerings",
      hospital_id: scope.hospitalId,
      items: [
        {
          kind: "imaging",
          code: i.code,
          provision: i.provision,
          section_id: null,
          hours: inHouse ? i.hours : null,
          hours_note: inHouse && i.hours === "scheduled" ? i.hours_note || null : null,
          stated_tat: i.provision === "not_offered" ? null : i.stated_tat || null,
          referred_to: i.provision === "referred" ? i.referred_to || null : null,
          machines: inHouse ? i.machines : null,
        },
      ],
    },
    "hospital-admin.lab",
  );
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath(PATH);
  return { ok: true };
}

/** The Laboratory department the menu hangs off (`add_departments`, LABORATORY only). */
export async function addLaboratoryAction(): Promise<Result> {
  const scope = await requireHospitalAdminScope();
  const r = await callEdge(
    "ha-services-hub",
    { op: "add_departments", hospital_id: scope.hospitalId, codes: ["LABORATORY"] },
    "hospital-admin.lab",
  );
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath(PATH);
  revalidatePath("/hospital-admin/departments", "layout");
  return { ok: true };
}
