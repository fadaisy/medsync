import "server-only";

import { createHash } from "node:crypto";
import type { PlannedName } from "./names";
import type { SeedMedicine } from "./seed";
import type { EmrTx } from "@/lib/emr/db";
import { and, eq, inArray, sql } from "drizzle-orm";

import {
  catChanges,
  catManufacturers,
  catMedicineIngredients,
  catMedicineLinks,
  catMedicineNames,
  catMedicineRoutes,
  catMedicines,
  catPackCodes,
  catPacks,
  catProducts,
  catProposalReviews,
  catProposals,
  catSubstanceNames,
  catSubstances,
} from "@/db/schema/pharmacy-catalogue";
import { pharmacyProducts } from "@/db/schema/pharmacy-dispensing";
import { EmrWriteError } from "@/lib/emr/write/context";
import { rowsOf } from "@/lib/exchange/store";

/**
 * The shared catalogue's writes (ADR 0456). Run as the clinical writer by a curator (or the owner's seed
 * script), so the database guards in 0251 are what hold: a review is by a curator who is not the proposer,
 * a proposal applies only with its confirmations (two for a medicine), and a fact exists only from an applied
 * proposal. Every fact written is logged in cat_changes.
 */

export const SEED_PROPOSER = "seed:emhslu";
export const NAMES_PROPOSER = "seed:names-v1";

/** A seeded medicine as proposed: the engine's medicine plus the edition rows it links to. */
export type SeedPayload = SeedMedicine & { editionName: string; rowIds: string[] };

const seedKey = (key: string) => createHash("sha256").update(key).digest("hex").slice(0, 48);

/** Propose every seeded medicine not yet proposed. Re-running proposes nothing twice (S3). */
export async function proposeSeed(
  tx: EmrTx,
  editionName: string,
  medicines: readonly SeedMedicine[],
  rowIdForLine: ReadonlyMap<number, string>,
): Promise<{ proposed: number; already: number }> {
  let proposed = 0;
  for (let i = 0; i < medicines.length; i += 200) {
    const batch = medicines.slice(i, i + 200).map((m) => {
      const rowIds = m.lines.map((l) => rowIdForLine.get(l));
      if (rowIds.some((r) => !r))
        throw new EmrWriteError(
          "invalid",
          `Line ${m.lines.join(", ")} is not in edition "${editionName}".`,
        );
      const payload: SeedPayload = { ...m, editionName, rowIds: rowIds as string[] };
      return {
        kind: "new_medicine",
        payload,
        source: `${editionName}, line ${m.lines.join(", ")}${m.pages.length ? `, p. ${m.pages.join(", ")}` : ""}`,
        proposerSource: SEED_PROPOSER,
        seedKey: seedKey(m.key),
        requiredReviews: 2,
      };
    });
    const out = await tx
      .insert(catProposals)
      .values(batch)
      .onConflictDoNothing()
      .returning({ id: catProposals.id });
    proposed += out.length;
  }
  return { proposed, already: medicines.length - proposed };
}

/**
 * A curator reviews proposals in a batch. A confirmation that completes a proposal's reviews applies it in
 * the same transaction; a rejection closes it. Returns what was applied.
 */
export async function reviewProposals(
  tx: EmrTx,
  reviewer: { userId: string },
  ids: readonly string[],
  decision: "confirm" | "reject",
  note?: string,
): Promise<{ reviewed: number; applied: string[] }> {
  if (!ids.length) throw new EmrWriteError("invalid", "Choose at least one proposal.");
  if (decision === "reject" && !note?.trim())
    throw new EmrWriteError("invalid", "Say why the proposal is rejected.");
  const open = await tx
    .select({
      id: catProposals.id,
      required: catProposals.requiredReviews,
      kind: catProposals.kind,
    })
    .from(catProposals)
    .where(and(inArray(catProposals.id, [...ids]), eq(catProposals.state, "open")))
    .for("update");
  if (open.length !== new Set(ids).size)
    throw new EmrWriteError(
      "conflict",
      "A proposal in this batch is already decided. Reload the page.",
    );
  await tx.insert(catProposalReviews).values(
    open.map((p) => ({
      proposalId: p.id,
      reviewer: reviewer.userId,
      decision,
      note: note ?? null,
    })),
  );
  if (decision === "reject") {
    await tx
      .update(catProposals)
      .set({ state: "rejected", decidedAt: sql`now()` })
      .where(inArray(catProposals.id, [...ids]));
    return { reviewed: open.length, applied: [] };
  }
  const counts = await tx
    .select({ id: catProposalReviews.proposalId, n: sql<number>`count(*)::int` })
    .from(catProposalReviews)
    .where(
      and(
        inArray(catProposalReviews.proposalId, [...ids]),
        eq(catProposalReviews.decision, "confirm"),
      ),
    )
    .groupBy(catProposalReviews.proposalId);
  const ready = open.filter((p) => (counts.find((c) => c.id === p.id)?.n ?? 0) >= p.required);
  for (const p of ready) {
    if (p.kind === "new_medicine") await applyNewMedicine(tx, reviewer.userId, p.id);
    else if (p.kind === "new_name") await applyNewName(tx, reviewer.userId, p.id);
    else if (p.kind === "new_barcode") await applyNewBarcode(tx, reviewer.userId, p.id);
    else if (p.kind === "new_product") await applyNewProduct(tx, reviewer.userId, p.id);
    else
      throw new EmrWriteError(
        "invalid",
        `A ${p.kind.replace("_", " ")} proposal is applied in a later step.`,
      );
  }
  return { reviewed: open.length, applied: ready.map((p) => p.id) };
}

async function applyNewMedicine(tx: EmrTx, by: string, proposalId: string) {
  const [p] = await tx
    .update(catProposals)
    .set({ state: "applied", decidedAt: sql`now()` })
    .where(eq(catProposals.id, proposalId))
    .returning({ payload: catProposals.payload, source: catProposals.source });
  const m = p!.payload as SeedPayload;
  const log = (table: string, rowId: string, after: unknown) =>
    tx
      .insert(catChanges)
      .values({ tableName: table, rowId, after, source: p!.source, proposalId, changedBy: by });

  const [clash] = await tx
    .select({ id: catMedicines.id })
    .from(catMedicines)
    .where(eq(catMedicines.key, m.key));
  if (clash) throw new EmrWriteError("conflict", `"${m.displayName}" is already in the catalogue.`);

  const substanceIds: string[] = [];
  for (const ing of m.ingredients) {
    const [made] = await tx
      .insert(catSubstances)
      .values({
        key: ing.substanceKey,
        preferredName: ing.preferredName,
        kind: m.kind,
        emhsluClass: m.therapeuticClass,
        proposalId,
      })
      .onConflictDoNothing({ target: catSubstances.key })
      .returning();
    if (made) await log("cat_substances", made.id, made);
    const [s] = await tx
      .select({ id: catSubstances.id })
      .from(catSubstances)
      .where(eq(catSubstances.key, ing.substanceKey));
    substanceIds.push(s!.id);
    if (ing.printedName) {
      const [name] = await tx
        .insert(catSubstanceNames)
        .values({
          substanceId: s!.id,
          name: ing.printedName,
          type: "printed",
          source: p!.source,
          proposalId,
        })
        .onConflictDoNothing()
        .returning();
      if (name) await log("cat_substance_names", name.id, name);
    }
  }

  const [med] = await tx
    .insert(catMedicines)
    .values({
      key: m.key,
      displayName: m.displayName,
      kind: m.kind,
      doseFormCode: m.formCode,
      issueUnitKind: m.issueUnitKind,
      strengthText: m.strengthText,
      spec: m.spec,
      emhsluLevel: m.level,
      emhsluVen: m.ven,
      flagged: m.flagged,
      checkNote: m.checkNote,
      proposalId,
    })
    .returning();
  await log("cat_medicines", med!.id, { ...med, ingredients: m.ingredients, routes: m.routes });
  await tx.insert(catMedicineIngredients).values(
    m.ingredients.map((ing, i) => ({
      medicineId: med!.id,
      position: i + 1,
      substanceId: substanceIds[i]!,
      strengthText: ing.strengthText,
      amount: ing.parsed ? String(ing.parsed.amount) : null,
      unit: ing.parsed?.unit ?? null,
      perAmount: ing.parsed?.perAmount == null ? null : String(ing.parsed.perAmount),
      perUnit: ing.parsed?.perUnit ?? null,
      basis: null,
    })),
  );
  if (m.routes.length)
    await tx
      .insert(catMedicineRoutes)
      .values(m.routes.map((routeCode) => ({ medicineId: med!.id, routeCode })));
  const links = await tx
    .insert(catMedicineLinks)
    .values(
      m.rowIds.map((rowId) => ({ medicineId: med!.id, linkKind: "emhslu_row", rowId, proposalId })),
    )
    .returning();
  for (const l of links) await log("cat_medicine_links", l.id, l);
}

/** Propose the signed names (GATE A §5) planned onto the catalogue. One curator confirms each; re-runs add nothing. */
export async function proposeNames(
  tx: EmrTx,
  planned: readonly PlannedName[],
): Promise<{ proposed: number; already: number }> {
  if (!planned.length) return { proposed: 0, already: 0 };
  const out = await tx
    .insert(catProposals)
    .values(
      planned.map((n) => ({
        kind: "new_name",
        payload: n,
        source: "GATE A §5 names list, signed by Fadhul (CSO) 27 Oct 2026",
        proposerSource: NAMES_PROPOSER,
        seedKey: seedKey(
          `${n.target}|${[...n.ids].sort().join(",")}|${n.name.toLowerCase()}|${n.type}`,
        ),
        requiredReviews: 1,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: catProposals.id });
  return { proposed: out.length, already: planned.length - out.length };
}

async function applyNewName(tx: EmrTx, by: string, proposalId: string) {
  const [p] = await tx
    .update(catProposals)
    .set({ state: "applied", decidedAt: sql`now()` })
    .where(eq(catProposals.id, proposalId))
    .returning({ payload: catProposals.payload, source: catProposals.source });
  const n = p!.payload as PlannedName;
  const base = { name: n.name, type: n.type, source: p!.source, proposalId };
  const rows =
    n.target === "substance"
      ? await tx
          .insert(catSubstanceNames)
          .values(n.ids.map((substanceId) => ({ ...base, substanceId })))
          .onConflictDoNothing()
          .returning({ id: catSubstanceNames.id })
      : await tx
          .insert(catMedicineNames)
          .values(n.ids.map((medicineId) => ({ ...base, medicineId })))
          .onConflictDoNothing()
          .returning({ id: catMedicineNames.id });
  for (const row of rows)
    await tx.insert(catChanges).values({
      tableName: n.target === "substance" ? "cat_substance_names" : "cat_medicine_names",
      rowId: row.id,
      after: { ...base, target: n.target },
      source: p!.source,
      proposalId,
      changedBy: by,
    });
}

export interface BarcodePayload {
  packId: string;
  codeType: "GTIN" | "NMS" | "JMS" | "supplier" | "other";
  code: string;
}

/**
 * 4.3 "Link and fill the line" (D-CAT-07, S14): the hospital's link, used there at once, and a `new_barcode`
 * proposal for the catalogue team. A code already linked to another pack here is refused (it opens the conflict); a
 * code linked to another pack elsewhere becomes a conflict everywhere (0254), which the caller reads back.
 */
export async function linkBarcode(
  tx: EmrTx,
  actor: { userId: string; hospitalId: string },
  input: BarcodePayload & { evidence?: Record<string, unknown> },
): Promise<{ codeId: string; proposalId: string | null; state: string }> {
  const [pack] = await tx
    .select({ id: catPacks.id })
    .from(catPacks)
    .where(and(eq(catPacks.id, input.packId), eq(catPacks.status, "active")));
  if (!pack) throw new EmrWriteError("not_found", "That pack is not in the catalogue.");
  const [here] = await tx
    .select({ id: catPackCodes.id, packId: catPackCodes.packId, state: catPackCodes.state })
    .from(catPackCodes)
    .where(
      and(
        eq(catPackCodes.hospitalId, actor.hospitalId),
        eq(catPackCodes.codeType, input.codeType),
        eq(catPackCodes.code, input.code),
        inArray(catPackCodes.state, ["local", "conflict"]),
      ),
    );
  if (here && here.packId === input.packId && here.state === "local")
    return { codeId: here.id, proposalId: null, state: here.state };
  if (here)
    throw new EmrWriteError(
      "conflict",
      "This barcode is linked to another pack here. Pick the pack that came.",
    );
  const payload: BarcodePayload = {
    packId: input.packId,
    codeType: input.codeType,
    code: input.code,
  };
  const [prop] = await tx
    .insert(catProposals)
    .values({
      kind: "new_barcode",
      payload,
      source: "Linked at the hospital from the pack",
      hospitalId: actor.hospitalId,
      proposedBy: actor.userId,
      requiredReviews: 1,
    })
    .returning({ id: catProposals.id });
  const [row] = await tx
    .insert(catPackCodes)
    .values({
      ...payload,
      hospitalId: actor.hospitalId,
      state: "local",
      createdBy: actor.userId,
      evidence: { ...input.evidence, proposalId: prop!.id },
    })
    .returning({ id: catPackCodes.id });
  // The conflict trigger may have marked it; say what it is now.
  const [now] = await tx
    .select({ state: catPackCodes.state })
    .from(catPackCodes)
    .where(eq(catPackCodes.id, row!.id));
  return { codeId: row!.id, proposalId: prop!.id, state: now!.state };
}

async function applyNewBarcode(tx: EmrTx, by: string, proposalId: string) {
  const [p] = await tx
    .update(catProposals)
    .set({ state: "applied", decidedAt: sql`now()` })
    .where(eq(catProposals.id, proposalId))
    .returning({ payload: catProposals.payload, source: catProposals.source });
  const b = p!.payload as BarcodePayload;
  const [conflict] = await tx
    .select({ id: catPackCodes.id })
    .from(catPackCodes)
    .where(
      and(
        eq(catPackCodes.codeType, b.codeType),
        eq(catPackCodes.code, b.code),
        eq(catPackCodes.state, "conflict"),
      ),
    )
    .limit(1);
  if (conflict)
    throw new EmrWriteError("conflict", "This barcode is in conflict. Resolve the conflict first.");
  const rows = await tx
    .insert(catPackCodes)
    .values({ ...b, hospitalId: null, state: "confirmed", createdBy: by, proposalId })
    .onConflictDoNothing()
    .returning({ id: catPackCodes.id });
  for (const row of rows)
    await tx.insert(catChanges).values({
      tableName: "cat_pack_codes",
      rowId: row.id,
      after: { ...b, state: "confirmed" },
      source: p!.source,
      proposalId,
      changedBy: by,
    });
}

/**
 * The catalogue team settles a conflict (4.8): links to the pack that is right go back to local (a hospital's) or
 * confirmed (shared); every other link of that code is withdrawn. MedSync never chooses (GATE A §3). Curators only.
 */
export async function resolveCodeConflict(
  tx: EmrTx,
  curator: { userId: string },
  input: { codeType: BarcodePayload["codeType"]; code: string; keepPackId: string; note: string },
): Promise<{ kept: number; withdrawn: number }> {
  if (!input.note.trim()) throw new EmrWriteError("invalid", "Say how the pack was checked.");
  const [ok] = rowsOf<{ ok: boolean }>(
    await tx.execute(sql`SELECT private.catalogue_is_curator(${curator.userId}) AS ok`),
  );
  if (!ok?.ok) throw new EmrWriteError("forbidden", "Only a curator settles a conflict.");
  const rows = await tx
    .select()
    .from(catPackCodes)
    .where(
      and(
        eq(catPackCodes.codeType, input.codeType),
        eq(catPackCodes.code, input.code),
        eq(catPackCodes.state, "conflict"),
      ),
    )
    .for("update");
  if (!rows.some((r) => r.packId === input.keepPackId))
    throw new EmrWriteError("invalid", "Keep one of the packs this code is linked to.");
  let kept = 0;
  let withdrawn = 0;
  // Withdraw first, so the kept links meet no other pack when they return.
  const keep = rows.filter((r) => r.packId === input.keepPackId);
  for (const r of [...rows.filter((r) => r.packId !== input.keepPackId), ...keep]) {
    const state =
      r.packId !== input.keepPackId ? "withdrawn" : r.hospitalId ? "local" : "confirmed";
    await tx.update(catPackCodes).set({ state }).where(eq(catPackCodes.id, r.id));
    await tx.insert(catChanges).values({
      tableName: "cat_pack_codes",
      rowId: r.id,
      before: { state: r.state },
      after: { state, note: input.note },
      source: "Conflict settled by the catalogue team",
      changedBy: curator.userId,
    });
    if (state === "withdrawn") withdrawn++;
    else kept++;
  }
  return { kept, withdrawn };
}

/** A product not on the prescribing list carries this key in `medicine_id` (0255; A-1 as amended). */
export const catalogueKey = (id: string) => `cat_${id.replace(/-/g, "")}`;

export interface NewProductPayload {
  kind: "health_supply" | "local_medicine";
  hospitalProductId: string;
  catalogueMedicineId: string | null;
  name: string;
  strength: string | null;
  issueUnit: string;
  pack: { description: string; contents: number | null };
  brand: string | null;
  maker: string | null;
  /** Law 9: "No registration number on the pack" is a recorded answer, not a blank. */
  registration: { answer: "number"; number: string } | { answer: "none_on_pack" };
  gtin: string | null;
}

/**
 * 4.4 "Type a product that is not in the catalogue": the `new_product` proposal behind the hospital's own product
 * (the stock store adds the product, `addHealthSupply`). Health supplies only (D-CAT-18): a local medicine has no
 * signed controlled class, so it is refused until the CSO decides how that is set (0255 holds the same line).
 */
export async function proposeLocalProduct(
  tx: EmrTx,
  actor: { userId: string; hospitalId: string },
  input: NewProductPayload,
): Promise<string> {
  if (input.kind !== "health_supply")
    throw new EmrWriteError(
      "forbidden",
      "A medicine that is not on the prescribing list cannot be added yet: its controlled status needs the clinical safety officer's decision.",
    );
  if (input.catalogueMedicineId) {
    const [m] = await tx
      .select({ kind: catMedicines.kind })
      .from(catMedicines)
      .where(eq(catMedicines.id, input.catalogueMedicineId));
    if (m?.kind !== "health_supply")
      throw new EmrWriteError("invalid", "Pick a health supply from the catalogue, or none.");
  }
  const [prop] = await tx
    .insert(catProposals)
    .values({
      kind: "new_product",
      payload: input,
      source: "Typed at the hospital from the pack",
      hospitalId: actor.hospitalId,
      proposedBy: actor.userId,
      requiredReviews: 1,
    })
    .returning({ id: catProposals.id });
  return prop!.id;
}

/**
 * S17: a product linked to its catalogue medicine and, when known, its pack. Only the catalogue columns change:
 * its batches, movements, issue unit and prescribing medicine stay as they are. 0255 keeps a medicine's product on a
 * catalogue medicine and a supply's on a supply.
 */
export async function linkProducts(
  tx: EmrTx,
  actor: { hospitalId: string },
  links: readonly {
    productId: string;
    catalogueMedicineId: string;
    cataloguePackId?: string | null;
  }[],
): Promise<number> {
  let n = 0;
  for (const l of links) {
    const out = await tx
      .update(pharmacyProducts)
      .set({
        catalogueMedicineId: l.catalogueMedicineId,
        cataloguePackId: l.cataloguePackId ?? null,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(pharmacyProducts.id, l.productId),
          eq(pharmacyProducts.hospitalId, actor.hospitalId),
        ),
      )
      .returning({ id: pharmacyProducts.id });
    if (!out.length) throw new EmrWriteError("not_found", "That product is not at your hospital.");
    n += out.length;
  }
  return n;
}

async function applyNewProduct(tx: EmrTx, by: string, proposalId: string) {
  const [p] = await tx
    .update(catProposals)
    .set({ state: "applied", decidedAt: sql`now()` })
    .where(eq(catProposals.id, proposalId))
    .returning({ payload: catProposals.payload, source: catProposals.source });
  const n = p!.payload as NewProductPayload;
  if (!n.catalogueMedicineId)
    throw new EmrWriteError(
      "invalid",
      "This product names no catalogue item. Add the item first, then confirm the product.",
    );
  const log = (tableName: string, rowId: string, after: unknown) =>
    tx
      .insert(catChanges)
      .values({ tableName, rowId, after, source: p!.source, proposalId, changedBy: by });
  let makerId: string | null = null;
  if (n.maker) {
    const [known] = await tx
      .select({ id: catManufacturers.id })
      .from(catManufacturers)
      .where(sql`lower(${catManufacturers.name}) = lower(${n.maker})`)
      .limit(1);
    makerId = known?.id ?? null;
    if (!makerId) {
      const [m] = await tx
        .insert(catManufacturers)
        .values({ name: n.maker, proposalId })
        .returning({ id: catManufacturers.id });
      makerId = m!.id;
      await log("cat_manufacturers", makerId, { name: n.maker });
    }
  }
  const [product] = await tx
    .insert(catProducts)
    .values({
      medicineId: n.catalogueMedicineId,
      brandName: n.brand,
      manufacturerId: makerId,
      ndaNumber: n.registration.answer === "number" ? n.registration.number : null,
      ndaState: "unknown",
      proposalId,
    })
    .returning({ id: catProducts.id });
  await log("cat_products", product!.id, { brand: n.brand, registration: n.registration });
  const [pack] = await tx
    .insert(catPacks)
    .values({
      productId: product!.id,
      description: n.pack.description,
      contents: n.pack.contents,
      proposalId,
    })
    .returning({ id: catPacks.id });
  await log("cat_packs", pack!.id, n.pack);
  if (n.gtin) {
    const codes = await tx
      .insert(catPackCodes)
      .values({
        packId: pack!.id,
        codeType: "GTIN",
        code: n.gtin,
        state: "confirmed",
        createdBy: by,
        proposalId,
      })
      .onConflictDoNothing()
      .returning({ id: catPackCodes.id });
    for (const c of codes) await log("cat_pack_codes", c.id, { code: n.gtin, state: "confirmed" });
  }
  await tx
    .update(pharmacyProducts)
    .set({ cataloguePackId: pack!.id, updatedAt: sql`now()` })
    .where(eq(pharmacyProducts.id, n.hospitalProductId));
}
