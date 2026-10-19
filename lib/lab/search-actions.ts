"use server";

import type { ActionResult } from "@/lib/emr/write/context";
import { and, eq, ilike } from "drizzle-orm";
import { z } from "zod";

import { labManifests, patientProfiles } from "@/db/schema";
import { requireEmrActor } from "@/lib/emr/actor";
import { asClinicalReader } from "@/lib/emr/db";
import { identitiesFor } from "@/lib/emr/read/results";
import { actionError, EmrWriteError } from "@/lib/emr/write/context";
import { findSpecimens } from "./bench-store";
import { labWorkspaceV2LiveFor } from "./feature";
import { labWorklistFor } from "./page-data";
import { classify, SEARCH_CAP } from "./search";

/**
 * Scan or search, the read (prompt 6.3, SR-1..SR-3; ADR 0347). Read only, under the clinical reader (RLS), for
 * lab staff at their hospital. The search term is never logged and never put in a URL (SR-2). Names are
 * encrypted at rest, so a name is matched only among the patients on this hospital's open worklist.
 * ponytail: name search covers open work only; widen to a hashed name index if the lab asks for closed work.
 */
export interface SearchHit {
  specimens: {
    labelNo: string;
    orderId: string;
    test: string;
    voided: boolean;
    name: string;
    mrn: string;
    restricted: boolean;
  }[];
  patients: { id: string; name: string; mrn: string }[];
  manifests: { id: string; number: string }[];
  kind: ReturnType<typeof classify>;
}

export async function labSearchAction(raw: unknown): Promise<ActionResult<SearchHit>> {
  const p = z.object({ q: z.string().trim().min(1).max(80) }).safeParse(raw);
  if (!p.success) return { ok: false, code: "invalid", error: "Type at least one character." };
  try {
    const actor = await requireEmrActor("lab");
    if (!actor.labPermissions?.includes("lab.view"))
      throw new EmrWriteError("forbidden", "Only laboratory staff can search the lab.");
    if (!labWorkspaceV2LiveFor(actor.hospitalId))
      throw new EmrWriteError("config", "Lab search is not switched on here.");
    const q = p.data.q;
    const kind = classify(q);
    const scope = { userId: actor.userId, hospitalId: actor.hospitalId };
    const worklist =
      kind === "name" || kind === "label" ? await labWorklistFor(actor.hospitalId) : null;
    const restricted = worklist?.restricted ?? new Set<string>();

    const found = await asClinicalReader(scope, async (tx) => {
      const specimens =
        kind === "label"
          ? await findSpecimens(tx, actor.hospitalId, q)
          : ([] as Awaited<ReturnType<typeof findSpecimens>>);
      const manifests =
        kind === "manifest"
          ? await tx
              .select({ id: labManifests.id, number: labManifests.number })
              .from(labManifests)
              .where(
                and(
                  eq(labManifests.hospitalId, actor.hospitalId),
                  ilike(labManifests.number, q.trim()),
                ),
              )
              .limit(SEARCH_CAP)
          : [];
      const byMrn =
        kind === "mrn"
          ? await tx
              .select({ id: patientProfiles.id })
              .from(patientProfiles)
              .where(eq(patientProfiles.patientCode, q.trim().toUpperCase()))
              .limit(1)
          : [];
      return { specimens, manifests, byMrn };
    });

    // Name: only among the open worklist's patients (encrypted names; see above).
    const worklistPatients =
      kind === "name" && worklist ? [...new Set(worklist.inputs.map((i) => i.patientUserId))] : [];
    const ids = await identitiesFor(
      scope,
      [
        ...found.specimens.map((s) => s.patientUserId),
        ...found.byMrn.map((b) => b.id),
        ...worklistPatients,
      ],
      "lab_search",
    );
    const needle = q.trim().toLowerCase();
    const namePatients =
      kind === "name"
        ? worklistPatients.filter((id) => {
            const n = ids.get(id)?.name?.toLowerCase() ?? "";
            return n.startsWith(needle) || n.split(/\s+/).some((w) => w.startsWith(needle));
          })
        : [];
    const patientIds = [...found.byMrn.map((b) => b.id), ...namePatients].slice(0, SEARCH_CAP);
    return {
      ok: true,
      id: "search",
      serverTime: new Date().toISOString(),
      data: {
        kind,
        manifests: found.manifests,
        patients: patientIds.map((id) => ({
          id,
          name: ids.get(id)?.name ?? "",
          mrn: ids.get(id)?.mrn ?? "",
        })),
        specimens: found.specimens.slice(0, SEARCH_CAP).map((s) => ({
          labelNo: s.labelNo,
          orderId: s.orderId,
          test: s.test,
          voided: s.voidedAt !== null,
          name: ids.get(s.patientUserId)?.name ?? "",
          mrn: ids.get(s.patientUserId)?.mrn ?? "",
          restricted: restricted.has(s.orderId),
        })),
      },
    };
  } catch (e) {
    return actionError(e);
  }
}
