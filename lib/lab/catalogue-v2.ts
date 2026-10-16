import "server-only";

import type { PregnancyContext } from "./interpretation";
import type { Profile } from "./profiles";
import type { ConfigKind, SignedConfig } from "./signed-config";
import type { EmrTx } from "@/lib/emr/db";
import type { PregnancyFact } from "@/lib/facts/types";
import { and, desc, eq, inArray, isNull, max, ne, or, sql } from "drizzle-orm";

import V16 from "@/data/emr/clinical-fact-concepts.v1.6.json";
import { analyserProfiles, labSignedConfigs, testCatalogue } from "@/db/schema";
import { readAsClinician } from "@/lib/emr/db";
import { EmrWriteError } from "@/lib/emr/write/context";
import { loadFactSnapshot } from "@/lib/facts/loader";
import { labCatalogueV2LiveFor } from "./feature";
import { rowsFor } from "./profiles";
import { configSignErrors, LEAD_ONLY_KINDS, PAYLOADS } from "./signed-config";

/**
 * Catalogue v2 on the database (Lab Phase 2 Step 4; ADRs 0251–0253). The signed configuration store, the
 * gate that switches a hospital's tests to the v2 component lists, the analyser profile a specimen is pinned
 * to, and the pregnancy context read from the record. With labCatalogueV2 off, or the addendum unsigned,
 * every test keeps Phase 1's components (S18).
 */

export const ADDENDUM_KEY = "cfc-1.6.0";
const TESTS_V2 = V16.testsV2 as Record<string, string[]>;
const NEW_TESTS = new Set(V16.testsAdd.map((t) => t.id));
export const ABNORMAL_ANSWERS = V16.abnormalAnswers as Record<string, string[]>;
export const OTHER_UNITS = V16.otherUnits as Record<string, { unit: string; multiplyBy: number }[]>;

const invalid = (m: string) => new EmrWriteError("invalid", m);
const scopeOf = (hospitalId: string | null) =>
  hospitalId === null
    ? isNull(labSignedConfigs.hospitalId)
    : eq(labSignedConfigs.hospitalId, hospitalId);

/** The hospital's and the global configuration, every status (RR-2: drafts are filtered by `inForce`). */
export async function loadConfigs(tx: EmrTx, hospitalId: string): Promise<SignedConfig[]> {
  const rows = await tx
    .select()
    .from(labSignedConfigs)
    .where(or(isNull(labSignedConfigs.hospitalId), eq(labSignedConfigs.hospitalId, hospitalId)));
  return rows.flatMap((r) => {
    const p = PAYLOADS[r.kind as ConfigKind]?.safeParse(r.payload);
    return p?.success
      ? [
          {
            id: r.id,
            hospitalId: r.hospitalId,
            kind: r.kind as ConfigKind,
            key: r.key,
            version: r.version,
            status: r.status as SignedConfig["status"],
            payload: p.data,
            inForceFrom: r.inForceFrom,
            supersededAt: r.supersededAt,
          } as SignedConfig,
        ]
      : [];
  });
}

/** CC-1: the addendum is in force once both signatures land. */
export async function addendumSigned(tx: EmrTx): Promise<boolean> {
  const [r] = await tx
    .select({ id: labSignedConfigs.id })
    .from(labSignedConfigs)
    .where(
      and(
        isNull(labSignedConfigs.hospitalId),
        eq(labSignedConfigs.kind, "addendum"),
        eq(labSignedConfigs.key, ADDENDUM_KEY),
        eq(labSignedConfigs.status, "signed"),
      ),
    )
    .limit(1);
  return !!r;
}

/** The v2 catalogue is on here: the flag, and the signed addendum. */
export async function catalogueV2Active(tx: EmrTx, hospitalId: string) {
  return labCatalogueV2LiveFor(hospitalId) && (await addendumSigned(tx));
}

/** AP-5: the profile pinned at receipt for this order's newest specimen, if any. */
export async function pinnedProfile(tx: EmrTx, orderId: string): Promise<Profile | null> {
  const rows = (await tx.execute(sql`
    SELECT p.* FROM specimen_events e
      JOIN specimens s ON s.id = e.specimen_id
      JOIN analyser_profiles p ON p.id = e.profile_id
     WHERE s.order_id = ${orderId} AND e.kind = 'received'
     ORDER BY e.recorded_at DESC LIMIT 1`)) as unknown as
    | { rows?: Record<string, unknown>[] }
    | Record<string, unknown>[];
  const r = (Array.isArray(rows) ? rows : (rows.rows ?? []))[0];
  return r
    ? {
        id: String(r.id),
        model: String(r.model),
        kind: r.kind as Profile["kind"],
        state: r.state as Profile["state"],
        mappings: r.mappings as Profile["mappings"],
        openChecks: r.open_checks as Profile["openChecks"],
        verifiedConcepts: (r.verified_concepts as string[]) ?? [],
        deviceId: (r.device_id as string | null) ?? null,
      }
    : null;
}

/** AP-5: the profile in use for a test at this hospital, to pin at receipt. */
export async function profileInUse(tx: EmrTx, hospitalId: string, testId: string) {
  const [p] = await tx
    .select({ id: analyserProfiles.id })
    .from(analyserProfiles)
    .where(
      and(
        eq(analyserProfiles.hospitalId, hospitalId),
        eq(analyserProfiles.testId, testId),
        eq(analyserProfiles.state, "in_use"),
      ),
    )
    .limit(1);
  return p?.id ?? null;
}

/**
 * The components a test takes here: Phase 1's list, or with the v2 catalogue active the v2 list, narrowed
 * to the pinned profile's rows when a specimen was received on one (AP-5). `lab` sees lab-only rows.
 */
export async function componentsFor(
  tx: EmrTx,
  hospitalId: string,
  test: { code: string; components: readonly string[] },
  orderId: string | null,
  viewer: "lab" | "clinician" = "lab",
): Promise<{
  active: boolean;
  components: string[];
  profile: Profile | null;
  labOnly: Set<string>;
}> {
  const base = {
    active: false,
    components: [...test.components],
    profile: null,
    labOnly: new Set<string>(),
  };
  if (!(await catalogueV2Active(tx, hospitalId))) return base;
  const v2 = TESTS_V2[test.code] ?? [...test.components];
  const profile = orderId ? await pinnedProfile(tx, orderId) : null;
  if (!profile) return { ...base, active: true, components: v2 };
  const rows = rowsFor(profile, viewer);
  return {
    active: true,
    components: rows.map((m) => m.concept).filter((c) => v2.includes(c)),
    profile,
    labOnly: new Set(
      profile.mappings.filter((m) => m.visibility === "lab_only").map((m) => m.concept),
    ),
  };
}

/** DS-5, D-LAB2-22: pregnancy from the record at collection, read under RLS; never inferred. */
export async function pregnancyAt(
  tx: EmrTx,
  patientUserId: string,
  at: Date,
): Promise<PregnancyContext> {
  const snap = await readAsClinician(tx, () =>
    loadFactSnapshot(tx, patientUserId, {
      manifest: ["preg.status"],
      asOf: at,
      purpose: "interactive",
    }),
  );
  const p = snap.facts.find((f): f is PregnancyFact => f.kind === "pregnancy");
  if (!p || p.state === "unknown") return { state: "not_recorded" };
  if (p.state !== "pregnant") return { state: "not_pregnant" };
  const g = p.gestation
    ? p.gestation.days + Math.floor((at.getTime() - Date.parse(p.gestation.asOf)) / 86_400_000)
    : null;
  return { state: "pregnant", gestationDays: g };
}

/* ─── The signed configuration store (P1) ─────────────────────────────── */

type Actor = { userId: string; hospitalId: string };

/** A new draft, or the open draft (no signature yet) replaced. The payload must parse for its kind. */
export async function saveConfigDraft(
  tx: EmrTx,
  actor: Actor,
  input: {
    kind: ConfigKind;
    key: string;
    payload: unknown;
    global?: boolean;
    newVersion?: boolean;
  },
  now: Date,
): Promise<string> {
  const parsed = PAYLOADS[input.kind].safeParse(input.payload);
  if (!parsed.success) throw invalid("Check the draft: a value is missing or not a number.");
  const hospitalId = input.global ? null : actor.hospitalId;
  const key = and(
    scopeOf(hospitalId),
    eq(labSignedConfigs.kind, input.kind),
    eq(labSignedConfigs.key, input.key),
  );
  const [open] = input.newVersion
    ? []
    : await tx
        .select({ id: labSignedConfigs.id })
        .from(labSignedConfigs)
        .where(
          and(key, eq(labSignedConfigs.status, "draft"), isNull(labSignedConfigs.leadSignedBy)),
        )
        .orderBy(desc(labSignedConfigs.version))
        .limit(1);
  if (open) {
    await tx
      .update(labSignedConfigs)
      .set({ payload: parsed.data, authoredBy: actor.userId })
      .where(eq(labSignedConfigs.id, open.id));
    return open.id;
  }
  const [{ v }] = (await tx
    .select({ v: max(labSignedConfigs.version) })
    .from(labSignedConfigs)
    .where(key)) as [{ v: number | null }];
  const [row] = await tx
    .insert(labSignedConfigs)
    .values({
      hospitalId,
      kind: input.kind,
      key: input.key,
      version: (v ?? 0) + 1,
      payload: parsed.data,
      authoredBy: actor.userId,
      createdAt: now,
    })
    .returning({ id: labSignedConfigs.id });
  return row!.id;
}

/**
 * D-LAB1-12, S53: someone other than the signer who could take the same slot here — another open head of the
 * Laboratory or a section (lead), another superadmin (CSO), another HMIS focal person designated today (focal). A
 * written exception covers only a hospital where no such person exists.
 */
async function anotherSigner(
  tx: EmrTx,
  s: { userId: string; hospitalId: string; as: "lead" | "cso" | "focal" },
  now: Date,
): Promise<boolean> {
  const day = now.toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" });
  const q =
    s.as === "lead"
      ? sql`SELECT 1 FROM department_heads h JOIN hospital_departments d ON d.id = h.department_id
              LEFT JOIN hospital_departments p ON p.id = d.parent_id
             WHERE h.hospital_id = ${s.hospitalId} AND h.user_id <> ${s.userId} AND h.ends_at IS NULL
               AND 'LABORATORY' IN (d.catalogue_code, p.catalogue_code)`
      : s.as === "cso"
        ? sql`SELECT 1 FROM user_roles WHERE role = 'superadmin' AND user_id <> ${s.userId}`
        : sql`SELECT 1 FROM hmis_designations WHERE hospital_id = ${s.hospitalId} AND role = 'focal'
                AND user_id <> ${s.userId} AND starts_on <= ${day} AND (ends_on IS NULL OR ends_on >= ${day})`;
  const r = (await tx.execute(sql`${q} LIMIT 1`)) as unknown as unknown[] | { rows: unknown[] };
  return (Array.isArray(r) ? r : r.rows).length > 0;
}

/**
 * D-LAB1-11, -12 carried over: the lead signs (not the author, unless an exception is recorded), then the CSO
 * (a different person). The CSO's signature checks the payload once more and supersedes the version in
 * force; released results keep the one they were read against (DS-9).
 */
export async function signConfig(
  tx: EmrTx,
  /** The second slot is the CSO's, or the HMIS focal person's for `hmis_mapping` (E-LAB3-12). */
  signer: { userId: string; hospitalId: string; as: "lead" | "cso" | "focal" },
  input: { configId: string; exceptionNote: string | null },
  now: Date,
): Promise<{ kind: ConfigKind; key: string }> {
  const [c] = await tx
    .select()
    .from(labSignedConfigs)
    .where(
      and(
        eq(labSignedConfigs.id, input.configId),
        or(isNull(labSignedConfigs.hospitalId), eq(labSignedConfigs.hospitalId, signer.hospitalId)),
      ),
    )
    .for("update");
  if (!c) throw new EmrWriteError("not_found", "That draft was not found.");
  if (c.status !== "draft") throw new EmrWriteError("conflict", "This is already signed.");
  const note = input.exceptionNote?.trim() || null;
  if (note && note.length < 10) throw invalid("Say in a sentence why no second person can sign.");
  const leadOnly = LEAD_ONLY_KINDS.includes(c.kind);
  // Who may sign is decided before what is signed (S53).
  if (signer.as === "lead") {
    if (c.leadSignedBy)
      throw new EmrWriteError("conflict", "The laboratory lead has already signed.");
    if (c.authoredBy === signer.userId) {
      if (!note)
        throw new EmrWriteError(
          "forbidden",
          "You wrote this draft: another lead signs it, or record why no one else can.",
        );
      if (await anotherSigner(tx, signer, now))
        throw new EmrWriteError(
          "forbidden",
          "You wrote this draft and another lead can sign it: they sign it.",
        );
    }
  } else {
    if (leadOnly) throw new EmrWriteError("conflict", "The laboratory lead signs this alone.");
    if ((c.kind === "hmis_mapping") !== (signer.as === "focal"))
      throw new EmrWriteError(
        "forbidden",
        c.kind === "hmis_mapping"
          ? "The HMIS focal person co-signs the HMIS mapping."
          : "The CSO countersigns this.",
      );
    if (!c.leadSignedBy) throw new EmrWriteError("conflict", "The laboratory lead signs first.");
    const second = signer.as === "focal" ? "the HMIS focal person" : "CSO";
    if (c.leadSignedBy === signer.userId) {
      if (!note && !c.exceptionNote)
        throw new EmrWriteError(
          "forbidden",
          `You signed as the lead: a different person signs as ${second}, or record why no one else can.`,
        );
      if (await anotherSigner(tx, signer, now))
        throw new EmrWriteError(
          "forbidden",
          `You signed as the lead and another ${signer.as === "focal" ? "HMIS focal person" : "CSO"} can sign: they sign it.`,
        );
    }
  }
  const errors = configSignErrors(c.kind as ConfigKind, c.payload);
  if (errors.length)
    throw invalid(
      errors.some((e) => e.includes("gap_or_overlap"))
        ? "Set every boundary first: each category must start exactly where the one below ends, with one side included."
        : "This draft is incomplete; open it and finish it before signing.",
    );
  if (signer.as === "lead" && !leadOnly) {
    await tx
      .update(labSignedConfigs)
      .set({
        leadSignedBy: signer.userId,
        leadSignedAt: now,
        ...(note ? { exceptionNote: note } : {}),
      })
      .where(eq(labSignedConfigs.id, c.id));
    return { kind: c.kind as ConfigKind, key: c.key };
  }
  await tx
    .update(labSignedConfigs)
    .set({ status: "superseded", supersededAt: now })
    .where(
      and(
        scopeOf(c.hospitalId),
        eq(labSignedConfigs.kind, c.kind),
        eq(labSignedConfigs.key, c.key),
        eq(labSignedConfigs.status, "signed"),
        ne(labSignedConfigs.id, c.id),
      ),
    );
  await tx
    .update(labSignedConfigs)
    .set({
      status: "signed",
      ...(signer.as === "lead"
        ? { leadSignedBy: signer.userId, leadSignedAt: now }
        : { csoSignedBy: signer.userId, csoSignedAt: now }),
      inForceFrom: now,
      ...(note ? { exceptionNote: note } : {}),
    })
    .where(eq(labSignedConfigs.id, c.id));
  // CC-1: the addendum's new tests become orderable when it is signed.
  if (c.kind === "addendum")
    await tx
      .update(testCatalogue)
      .set({ active: true })
      .where(and(isNull(testCatalogue.hospitalId), inArray(testCatalogue.code, [...NEW_TESTS])));
  return { kind: c.kind as ConfigKind, key: c.key };
}
