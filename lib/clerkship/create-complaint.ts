import "server-only";

import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { symptomCatalog, symptomProperty, symptomPropertyMap } from "@/db/schema/symptom-catalog";
import { complaintSlug, templateStructure } from "@/lib/clerkship/complaint-template";
import { proposeCatalogItem } from "@/lib/clerkship/governance";
import { logger } from "@/lib/logger";

/**
 * Doctor-created complaints (migration 0044). A clerking doctor defines a symptom
 * that isn't seeded — name + system + synonyms + a mapping of EXISTING properties
 * — and saves it as a reusable, attributed TEMPLATE.
 *
 * THE rule: this saves the symptom + its property MAPPING (the structure) ONLY —
 * never the patient values tapped during a clerking (those persist to the
 * encounter as normal). Nothing here touches encounter_symptom_observations or
 * any patient record. The template is patient-agnostic (reusability + privacy).
 *
 * Two-tier governance: a created complaint is PERSONAL to its creator (usable
 * immediately, attributed, audited). `proposeComplaintToShared` routes it to CSO
 * review; approval promotes it to the shared catalog (see governance.ts). The
 * shared catalog is never directly mutated by a user. Server-only.
 */

export interface CreateComplaintInput {
  display: string;
  system: string;
  synonyms: string[];
  /** Codes of EXISTING properties to map (reuse-only in v1; unknown codes dropped). */
  propertyCodes: string[];
}

export async function createDoctorComplaint(
  args: CreateComplaintInput & { creatorUserId: string; creatorName: string | null },
): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  // Structure-only: strip to the template fields — patient values cannot pass.
  const tpl = templateStructure(args);
  if (!tpl.display) return { ok: false, error: "A name is required." };
  if (!tpl.system) return { ok: false, error: "A body system is required." };

  // Reuse-only: keep just the property codes that actually exist in the catalog.
  let valid: string[] = [];
  if (tpl.propertyCodes.length) {
    const rows = await db
      .select({ code: symptomProperty.code })
      .from(symptomProperty)
      .where(inArray(symptomProperty.code, tpl.propertyCodes));
    const exist = new Set(rows.map((r) => r.code));
    valid = tpl.propertyCodes.filter((c) => exist.has(c)); // preserve the doctor's order
  }

  const code = `dx_${complaintSlug(tpl.display)}_${crypto.randomUUID().slice(0, 6)}`;

  try {
    // Template = structure only. No patient values are accepted or written here.
    await db.insert(symptomCatalog).values({
      code,
      display: tpl.display,
      system: tpl.system,
      synonyms: tpl.synonyms,
      version: "personal",
      source: "doctor-created",
      scope: "personal",
      origin: "doctor",
      createdByUserId: args.creatorUserId,
      createdByName: args.creatorName ?? null,
    });
    if (valid.length) {
      await db
        .insert(symptomPropertyMap)
        .values(
          valid.map((pc, i) => ({
            symptomCode: code,
            propertyCode: pc,
            required: false,
            sortOrder: (i + 1) * 10,
          })),
        )
        .onConflictDoNothing();
    }
    return { ok: true, code };
  } catch (e) {
    logger.error("createDoctorComplaint failed", { error: String(e) });
    return { ok: false, error: "Failed to save the complaint." };
  }
}

/**
 * Propose a (personal) doctor-created complaint for the shared catalog. Builds a
 * self-contained payload (the symptom + its current property mapping — structure
 * only) and files a governed proposal; CSO review promotes it (governance.ts).
 */
export async function proposeComplaintToShared(args: {
  code: string;
  proposerUserId: string;
  hospitalId: string | null;
  note?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const [sym] = await db
    .select({
      code: symptomCatalog.code,
      display: symptomCatalog.display,
      system: symptomCatalog.system,
      synonyms: symptomCatalog.synonyms,
    })
    .from(symptomCatalog)
    .where(eq(symptomCatalog.code, args.code))
    .limit(1);
  if (!sym) return { ok: false, error: "Complaint not found." };

  const mapping = await db
    .select({
      propertyCode: symptomPropertyMap.propertyCode,
      required: symptomPropertyMap.required,
      sortOrder: symptomPropertyMap.sortOrder,
    })
    .from(symptomPropertyMap)
    .where(eq(symptomPropertyMap.symptomCode, args.code));

  return proposeCatalogItem({
    proposerUserId: args.proposerUserId,
    hospitalId: args.hospitalId,
    kind: "symptom",
    payload: {
      code: sym.code,
      display: sym.display,
      system: sym.system,
      synonyms: sym.synonyms ?? [],
      mapping,
    },
    note: args.note ?? null,
  });
}
