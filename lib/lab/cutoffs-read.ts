import "server-only";

import type { ConfigKind, Payload, SchemePayload, SignedConfig } from "./signed-config";
import type { EmrTx } from "@/lib/emr/db";
import { and, desc, eq, inArray } from "drizzle-orm";

import V16 from "@/data/emr/clinical-fact-concepts.v1.6.json";
import { labSignedConfigs } from "@/db/schema";
import { conceptDef } from "@/lib/facts/project/shared";
import { inForce, PAYLOADS } from "./signed-config";

/**
 * Decision cut-offs for the Ranges and cut-offs page (Lab Phase 2 §5.12, artboard 12). Per concept that has
 * any scheme at this hospital: the scheme in force, the open drafts, and the flag basis (in force and
 * drafts). Read only; writes go through lib/lab/catalogue-v2-actions.ts.
 */

export interface ConfigDraft<P> {
  id: string;
  version: number;
  payload: P;
  leadSigned: boolean;
  authoredBy: string;
}
export interface CutoffConcept {
  conceptId: string;
  display: string;
  signed: { id: string; version: number; payload: SchemePayload; inForceFrom: Date } | null;
  /** Newest first. */
  drafts: ConfigDraft<SchemePayload>[];
  basis: {
    signed: { basis: Payload<"flag_basis">["basis"]; version: number; inForceFrom: Date } | null;
    drafts: ConfigDraft<Payload<"flag_basis">>[];
  };
}

const V16_DISPLAY = new Map(V16.concepts.map((c) => [c.id, c.display]));

export async function loadCutoffs(
  tx: EmrTx,
  hospitalId: string,
  now: Date,
): Promise<{ concepts: CutoffConcept[]; elevation: { metres: number; inForceFrom: Date } | null }> {
  const rows = await tx
    .select()
    .from(labSignedConfigs)
    .where(
      and(
        eq(labSignedConfigs.hospitalId, hospitalId),
        inArray(labSignedConfigs.kind, ["scheme", "flag_basis", "elevation"]),
      ),
    )
    .orderBy(desc(labSignedConfigs.version));
  const parsed = rows.flatMap((r) => {
    const p = PAYLOADS[r.kind as ConfigKind].safeParse(r.payload);
    return p.success ? [{ ...r, payload: p.data }] : [];
  });
  const configs = parsed as unknown as SignedConfig[];
  const draftsOf = <K extends "scheme" | "flag_basis">(kind: K, key: string) =>
    parsed
      .filter((r) => r.kind === kind && r.key === key && r.status === "draft")
      .map((r) => ({
        id: r.id,
        version: r.version,
        payload: r.payload as unknown as Payload<K>,
        leadSigned: !!r.leadSignedBy,
        authoredBy: r.authoredBy,
      }));

  const keys = [...new Set(parsed.filter((r) => r.kind === "scheme").map((r) => r.key))];
  const concepts = keys
    .map((key): CutoffConcept => {
      const scheme = inForce(configs, "scheme", key, now);
      const basis = inForce(configs, "flag_basis", key, now);
      return {
        conceptId: key,
        display: conceptDef(key)?.display ?? V16_DISPLAY.get(key) ?? key,
        signed: scheme && {
          id: scheme.id,
          version: scheme.version,
          payload: scheme.payload,
          inForceFrom: scheme.inForceFrom!,
        },
        drafts: draftsOf("scheme", key),
        basis: {
          signed: basis && {
            basis: basis.payload.basis,
            version: basis.version,
            inForceFrom: basis.inForceFrom!,
          },
          drafts: draftsOf("flag_basis", key),
        },
      };
    })
    .sort((a, b) => a.display.localeCompare(b.display));
  const elev = inForce(configs, "elevation", "hospital", now);
  return {
    concepts,
    elevation: elev && { metres: elev.payload.metres, inForceFrom: elev.inForceFrom! },
  };
}
