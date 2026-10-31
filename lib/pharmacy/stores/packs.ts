import type { Verifier } from "@/lib/auth/attest";
import type { EmrDb, EmrTx } from "@/lib/emr/db";
import type { PharmacyCtx } from "@/lib/pharmacy/write";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { ALL_PACK_TEXT as PACK_TEXT } from "@/content/pharmacy-network";
import { CSO_ALONE, PACKS } from "@/content/pharmacy-stores-supply";
import { staffAffiliations } from "@/db/schema/clinician-profiles";
import { hospitals } from "@/db/schema/hospitals";
import { pharmacyAttestations, pharmacySignedSets } from "@/db/schema/pharmacy-dispensing";
import { users } from "@/db/schema/users";
import { attestSecondPerson } from "@/lib/auth/attest";
import { PHARMACY_PERMISSIONS } from "@/lib/pharmacy/access";
import { bannedTermsScan } from "@/lib/pharmacy/messages";
import { NETWORK_PACK_SCHEMAS } from "@/lib/pharmacy/network-packs";
import { fail, storeNeed } from "./write";

/**
 * Signed packs (Pharmacy Phase 2, Appendix D; Section 8 `saveSignedPack`, `signPack`; D-PH2-22, Law 6). A pack is a
 * `pharmacy_signed_sets` row (0122, kinds from 0181): a draft is written and rewritten freely, then signed by two
 * different people, or by the CSO alone with the exception text (D-PH2-22), each with a fresh second factor
 * (a `signer` attestation, lib/auth/attest.ts). Signing retires the version in force (0122 `pss_one_signed`).
 *
 * Every kind has a Zod schema; nothing has a default (Law 6): a pack is what was signed. Write a draft opens with
 * MedSync's sourced starting draft (ADR 0469, `pack-templates.ts`), which acts only once signed like any other draft.
 * Phase 1's kinds are supported only where a reader
 * states the shape: `message_name` ({name}), `witness_list` ({permissions}) and the coded lists ({items}).
 */

const coded = z.object({
  items: z
    .array(
      z.object({
        code: z
          .string()
          .trim()
          .regex(/^[a-z0-9_]{2,60}$/, "Codes are lower case, 2 to 60 letters."),
        words: z.string().trim().min(1).max(200),
      }),
    )
    .min(1, "Add at least one item."),
});
const months = z.number().positive().max(24);

export const STORES_REASON_LISTS = [
  "receiving_decisions",
  "refused_lines",
  "returns",
  "receipt_differences",
  "quarantine",
  "write_off",
  "count_differences",
  "month_end_differences",
  "order_changes",
  "order_line_closes",
  "cart_explanations",
  "recall_contact_outcomes",
] as const;
export type StoresReasonList = (typeof STORES_REASON_LISTS)[number];

export const HMIS_FORMS = [
  "hmis_085",
  "hmis_084b",
  "hmis_087",
  "hmis_088",
  "hmis_105_s6",
  "voucher",
  "register",
] as const;
export type HmisForm = (typeof HMIS_FORMS)[number];

/** Appendix D's content, per kind. */
export const PACK_SCHEMAS = {
  order_parameters: z.object({
    cycleMonths: z.number().int().min(1).max(12),
    maxMonths: months,
    minMonths: months.nullable(),
    emergencyOrderPointMonths: z.union([months, z.literal("not_kept")]),
    reviewWindowMonths: z.number().int().min(1).max(24),
    minHistoryDays: z.number().int().min(0).max(3660),
    unclassedTrimAs: z.enum(["V", "E", "N"]),
    budgetSource: z.string().trim().max(200).nullable(),
  }),
  tracer_list: z.object({
    source: z.string().trim().min(3).max(300),
    medicineIds: z.array(z.string().regex(/^[a-z0-9_]{2,80}$/)).min(1),
  }),
  cart_lookahead: z.object({ days: z.number().int().min(1).max(730) }),
  month_end_rules: z.object({
    countWindow: z.object({
      daysBefore: z.number().int().min(0).max(31),
      daysAfter: z.number().int().min(0).max(31),
    }),
    outOfStockShare: z.number().min(0).max(1),
    largeDifferenceUnits: z.number().int().min(1),
    reportLocationKinds: z.array(z.enum(["store", "dispensing_point", "ward", "cart"])).min(1),
  }),
  ward_rules: z.object({
    confirmationWindowHours: z.number().int().min(1).max(720),
    allocationRule: z.literal("first_expiry"),
  }),
  stores_reason_lists: z.object({
    lists: z.partialRecord(z.enum(STORES_REASON_LISTS), coded.shape.items),
  }),
  hmis_column_maps: z.object({
    forms: z.partialRecord(
      z.enum(HMIS_FORMS),
      z.object({ columns: z.array(z.string().trim().min(1).max(80)).min(1) }),
    ),
  }),
  recall_template: z.object({
    body: z
      .string()
      .trim()
      .min(20)
      .max(300)
      .refine((b) => b.includes("{messageName}") && b.includes("{phone}"), {
        message: "The template carries {messageName} and {phone}.",
      }),
  }),
  stockout_day_rule: z.object({ rule: z.enum(["end_of_day", "any_part"]) }),
  message_name: z.object({ name: z.string().trim().min(2).max(40) }),
  witness_list: z.object({ permissions: z.array(z.enum(PHARMACY_PERMISSIONS)).min(1) }),
  keep_reasons: coded,
  query_codes: coded,
  outcome_reasons: coded,
  identity_routes: coded,
  counselling_points: coded,
  // Phase 4 (0232): signed here; read by `networkPack`.
  ...NETWORK_PACK_SCHEMAS,
} as const;

export type PackKind = keyof typeof PACK_SCHEMAS;
export type PackContent<K extends PackKind> = z.infer<(typeof PACK_SCHEMAS)[K]>;
export const PACK_KINDS = Object.keys(PACK_SCHEMAS) as PackKind[];
export const PHASE2_KINDS: readonly PackKind[] = [
  "order_parameters",
  "tracer_list",
  "cart_lookahead",
  "month_end_rules",
  "ward_rules",
  "stores_reason_lists",
  "hmis_column_maps",
  "recall_template",
  "stockout_day_rule",
];
export const isPhase2Kind = (k: PackKind) => PHASE2_KINDS.includes(k);

/** A pack's template placeholders are filled at send time and never scanned as words (Law 12). */
export const templateScan = (body: string) =>
  bannedTermsScan(body.replace(/\{messageName\}|\{phone\}/g, " "));

/** Parse a pack's content for its kind; the refusal names the first problem. */
export function parsePack<K extends PackKind>(
  kind: K,
  content: unknown,
): { ok: true; content: PackContent<K> } | { ok: false; error: string } {
  const r = PACK_SCHEMAS[kind].safeParse(content);
  if (!r.success) {
    const i = r.error.issues[0];
    return {
      ok: false,
      error: PACKS.refused.invalid(`${i?.path.join(".") || "content"}: ${i?.message}`),
    };
  }
  if (kind === "recall_template") {
    const banned = templateScan((r.data as PackContent<"recall_template">).body);
    if (banned.length) return { ok: false, error: PACKS.refused.banned(banned.join(", ")) };
  }
  return { ok: true, content: r.data as PackContent<K> };
}

/** SL-14: the look-back flag on a downtime back-entry of a recalled batch (its words: EXPIRY.backEntryFlag). */
export const BATCH_RECALLED_FLAG = "batch_recalled_or_quarantined";

/* ─── The reader every lane uses ─────────────────────────────────────── */

/**
 * The signed pack of a kind in force at a hospital, parsed: its content and version, or null while none is
 * signed (or the signed content no longer fits its schema, which is then treated as unsigned: Law 6).
 */
export async function signedPack<K extends PackKind>(
  tx: EmrTx | EmrDb,
  hospitalId: string,
  kind: K,
): Promise<{ id: string; version: number; content: PackContent<K> } | null> {
  const [row] = await tx
    .select({
      id: pharmacySignedSets.id,
      version: pharmacySignedSets.version,
      content: pharmacySignedSets.content,
    })
    .from(pharmacySignedSets)
    .where(
      and(
        eq(pharmacySignedSets.hospitalId, hospitalId),
        eq(pharmacySignedSets.kind, kind),
        eq(pharmacySignedSets.status, "signed"),
      ),
    )
    .orderBy(desc(pharmacySignedSets.version))
    .limit(1);
  if (!row) return null;
  const parsed = PACK_SCHEMAS[kind].safeParse(row.content);
  return parsed.success
    ? { id: row.id, version: row.version, content: parsed.data as PackContent<K> }
    : null;
}

/** One reason list from the signed `stores_reason_lists` pack, or null while it is not signed. */
export async function reasonList(
  tx: EmrTx | EmrDb,
  hospitalId: string,
  list: StoresReasonList,
): Promise<{ code: string; words: string }[] | null> {
  const pack = await signedPack(tx, hospitalId, "stores_reason_lists");
  return pack?.content.lists[list] ?? null;
}

/** A form's confirmed columns, or null ("Columns not yet confirmed"). */
export async function columnsFor(tx: EmrTx | EmrDb, hospitalId: string, form: HmisForm) {
  const pack = await signedPack(tx, hospitalId, "hmis_column_maps");
  return pack?.content.forms[form]?.columns ?? null;
}

/* ─── Writes ─────────────────────────────────────────────────────────── */

export const PACK_NEED = storeNeed("pharmacy.manage");

export const SavePackInput = z.object({
  clientKey: z.uuid(),
  kind: z.enum(PACK_KINDS as [PackKind, ...PackKind[]]),
  content: z.unknown(),
});

/** saveSignedPack: write (or rewrite) the kind's one draft. A new draft takes the next version. */
export async function saveSignedPack(ctx: PharmacyCtx, input: z.infer<typeof SavePackInput>) {
  const hospitalId = ctx.actor.hospitalId;
  const parsed = parsePack(input.kind, input.content);
  if (!parsed.ok) throw fail("invalid", parsed.error);
  await ctx.tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`pack:${hospitalId}:${input.kind}`}))`,
  );
  const rows = await ctx.tx
    .select({
      id: pharmacySignedSets.id,
      version: pharmacySignedSets.version,
      status: pharmacySignedSets.status,
    })
    .from(pharmacySignedSets)
    .where(
      and(eq(pharmacySignedSets.hospitalId, hospitalId), eq(pharmacySignedSets.kind, input.kind)),
    )
    .orderBy(desc(pharmacySignedSets.version));
  const draft = rows.find((r) => r.status === "draft");
  if (draft) {
    await ctx.tx
      .update(pharmacySignedSets)
      .set({ content: parsed.content, authoredBy: ctx.actor.userId })
      .where(eq(pharmacySignedSets.id, draft.id));
    return { id: draft.id, version: draft.version };
  }
  const version = (rows[0]?.version ?? 0) + 1;
  const [row] = await ctx.tx
    .insert(pharmacySignedSets)
    .values({
      id: input.clientKey,
      hospitalId,
      kind: input.kind,
      version,
      content: parsed.content,
      // 0135 recomputes it from the content.
      sha256: "0".repeat(64),
      authoredBy: ctx.actor.userId,
    })
    .returning({ id: pharmacySignedSets.id });
  return { id: row!.id, version };
}

export const ATTEST_PURPOSES = {
  sign_pack: "signer",
  write_off: "witness",
  quarantine: "witness",
  recall_quarantine: "witness",
  supplier_return: "witness",
  month_end_count: "witness",
  month_close: "witness",
} as const;
export type SupplyAttestAction = keyof typeof ATTEST_PURPOSES;

export const AttestPersonInput = z.object({
  clientKey: z.uuid(),
  userId: z.uuid({ message: "Choose the person." }),
  // Never logged, stored or returned (D-PH1-42).
  password: z.string().min(1, "They type their password.").max(200),
  code: z
    .string()
    .transform((s) => s.replace(/\s/g, ""))
    .pipe(z.string().regex(/^\d{6}$/, "They type the 6-digit code.")),
  action: z.enum(Object.keys(ATTEST_PURPOSES) as [SupplyAttestAction, ...SupplyAttestAction[]]),
});

/**
 * A signer (the actor or another person) or a witness or second approver (never the actor) proves who they are
 * with their own password and code (lib/auth/attest.ts). Only someone affiliated to this hospital may.
 */
export async function attestPerson(
  ctx: PharmacyCtx,
  input: z.infer<typeof AttestPersonInput>,
  verify?: Verifier,
) {
  if (input.userId !== ctx.actor.userId) {
    const [aff] = await ctx.tx
      .select({ id: staffAffiliations.id })
      .from(staffAffiliations)
      .where(
        and(
          eq(staffAffiliations.userId, input.userId),
          eq(staffAffiliations.hospitalId, ctx.actor.hospitalId),
          inArray(staffAffiliations.state, ["approved", "active"]),
        ),
      )
      .limit(1);
    if (!aff) throw fail("forbidden", "That person cannot confirm here.");
  }
  const r = await attestSecondPerson(
    {
      hospitalId: ctx.actor.hospitalId,
      actorUserId: ctx.actor.userId,
      witnessUserId: input.userId,
      password: input.password,
      code: input.code,
      purpose: ATTEST_PURPOSES[input.action],
      action: input.action,
    },
    { tx: ctx.tx, now: ctx.now, ...(verify ? { verify } : {}) },
  );
  return { id: r.attestationId, ok: r.ok, words: r.ok ? null : r.words };
}

/** The people at the hospital who may sign, witness or approve, by name. */
export async function peopleAt(database: EmrTx | EmrDb, hospitalId: string) {
  const rows = await database
    .selectDistinct({ userId: staffAffiliations.userId, name: users.fullName })
    .from(staffAffiliations)
    .innerJoin(users, eq(users.id, staffAffiliations.userId))
    .where(
      and(
        eq(staffAffiliations.hospitalId, hospitalId),
        inArray(staffAffiliations.state, ["approved", "active"]),
      ),
    );
  return rows
    .map((r) => ({ userId: r.userId, label: r.name ?? "Name not recorded" }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * One-click answers for the hospital's own fields in Write a draft (ADR 0469), by field: the message name may be the
 * hospital's recorded name when it fits the pack (2 to 40 letters).
 */
export async function packChoices(
  database: EmrTx | EmrDb,
  hospitalId: string,
): Promise<Record<string, string[]>> {
  const [h] = await database
    .select({ name: hospitals.name })
    .from(hospitals)
    .where(eq(hospitals.id, hospitalId));
  const name = h?.name.trim() ?? "";
  return name.length >= 2 && name.length <= 40 ? { name: [name] } : {};
}

const FRESH_MS = 15 * 60_000;

/** A passed `signer` attestation for this actor, fresh, naming who signed. */
async function signerOf(ctx: PharmacyCtx, attestationId: string): Promise<string> {
  const [a] = await ctx.tx
    .select({ who: pharmacyAttestations.attesterUserId })
    .from(pharmacyAttestations)
    .where(
      and(
        eq(pharmacyAttestations.id, attestationId),
        eq(pharmacyAttestations.hospitalId, ctx.actor.hospitalId),
        eq(pharmacyAttestations.actorUserId, ctx.actor.userId),
        eq(pharmacyAttestations.purpose, "signer"),
        eq(pharmacyAttestations.outcome, "passed"),
        gte(pharmacyAttestations.attestedAt, new Date(ctx.now.getTime() - FRESH_MS)),
      ),
    );
  if (!a?.who) throw fail("forbidden", PACKS.refused.attestation);
  return a.who;
}

export const SignPackInput = z.object({
  clientKey: z.uuid(),
  packId: z.uuid(),
  firstAttestationId: z.uuid(),
  second: z.union([
    z.object({ attestationId: z.uuid() }),
    z.object({ exception: z.literal(CSO_ALONE) }),
  ]),
});

/** The signer roles a kind names (Appendix D), or the CSO alone (D-PH2-22). */
export const signerRoles = (kind: PackKind, alone: boolean): [string, string | null] => {
  const [a, b] = PACK_TEXT[kind].signers as readonly [string, string];
  return alone ? ["CSO", null] : [a, b];
};

/**
 * signPack: the actor is the first signer (`pharmacy.manage`, their own fresh second factor); a different second
 * signer with theirs, or the exception text. The version in force retires in the same transaction.
 */
export async function signPack(ctx: PharmacyCtx, input: z.infer<typeof SignPackInput>) {
  const hospitalId = ctx.actor.hospitalId;
  const [draft] = await ctx.tx
    .select()
    .from(pharmacySignedSets)
    .where(
      and(eq(pharmacySignedSets.id, input.packId), eq(pharmacySignedSets.hospitalId, hospitalId)),
    )
    .for("update");
  if (!draft) throw fail("not_found", PACKS.refused.notDraft);
  if (draft.status !== "draft") {
    if (draft.status === "signed" && draft.firstSigner === ctx.actor.userId)
      return { id: draft.id };
    throw fail("conflict", PACKS.refused.notDraft);
  }
  const kind = draft.kind as PackKind;
  if (!(kind in PACK_SCHEMAS)) throw fail("invalid", PACKS.unsupported);
  const parsed = parsePack(kind, draft.content);
  if (!parsed.ok) throw fail("invalid", parsed.error);
  const first = await signerOf(ctx, input.firstAttestationId);
  if (first !== ctx.actor.userId) throw fail("forbidden", PACKS.refused.attestation);
  const alone = "exception" in input.second;
  const second =
    "attestationId" in input.second ? await signerOf(ctx, input.second.attestationId) : null;
  if (second === first) throw fail("forbidden", PACKS.refused.secondSame);
  const [firstRole, secondRole] = signerRoles(kind, alone);
  await ctx.tx
    .update(pharmacySignedSets)
    .set({ status: "retired", retiredAt: ctx.now })
    .where(
      and(
        eq(pharmacySignedSets.hospitalId, hospitalId),
        eq(pharmacySignedSets.kind, kind),
        eq(pharmacySignedSets.status, "signed"),
      ),
    );
  await ctx.tx
    .update(pharmacySignedSets)
    .set({
      status: "signed",
      firstSigner: first,
      firstSignerRole: firstRole,
      secondSigner: second,
      secondSignerRole: second ? secondRole : null,
      exceptionText: alone ? CSO_ALONE : null,
      signedAt: ctx.now,
    })
    .where(eq(pharmacySignedSets.id, draft.id));
  return { id: draft.id };
}

/* ─── The page's read ────────────────────────────────────────────────── */

export interface PackRow {
  kind: PackKind;
  signed: {
    id: string;
    version: number;
    signedAt: Date | null;
    exception: string | null;
    content: unknown;
  } | null;
  draft: { id: string; version: number; content: unknown } | null;
}

/** Every supported kind with its version in force and its draft. */
export async function packRows(tx: EmrTx | EmrDb, hospitalId: string): Promise<PackRow[]> {
  const rows = await tx
    .select({
      id: pharmacySignedSets.id,
      kind: pharmacySignedSets.kind,
      version: pharmacySignedSets.version,
      status: pharmacySignedSets.status,
      content: pharmacySignedSets.content,
      signedAt: pharmacySignedSets.signedAt,
      exception: pharmacySignedSets.exceptionText,
    })
    .from(pharmacySignedSets)
    .where(
      and(
        eq(pharmacySignedSets.hospitalId, hospitalId),
        inArray(pharmacySignedSets.kind, PACK_KINDS),
      ),
    )
    .orderBy(desc(pharmacySignedSets.version));
  return PACK_KINDS.map((kind) => {
    const s = rows.find((r) => r.kind === kind && r.status === "signed");
    const d = rows.find((r) => r.kind === kind && r.status === "draft");
    return {
      kind,
      signed: s
        ? {
            id: s.id,
            version: s.version,
            signedAt: s.signedAt,
            exception: s.exception,
            content: s.content,
          }
        : null,
      draft: d ? { id: d.id, version: d.version, content: d.content } : null,
    };
  });
}
