/**
 * The shared medicines catalogue (catalogue slice Step 2; ADR 0456; migrations 0251, 0252) on the PGlite lane,
 * every migration replayed. The real EMHSLU 2023 file is loaded as an edition and seeded: proposals only (S1),
 * combinations split (S2), a re-run changes nothing (S3), no hospital writes the catalogue (S4), and the
 * two-person rule holds in the database. Step 3 (0253): the signed names load, and search finds a medicine by
 * any name, abbreviation, brand, maker, misspelling, registration number or barcode (S5–S7). Runs only with
 * EMR_PGLITE=1.
 */
import { readFileSync } from "node:fs";
import type { Lane, Pg } from "./_pglite";
import type { EmrTx } from "@/lib/emr/db";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { asClinicalReader } from "@/lib/emr/db";
import { readNationalList } from "@/lib/pharmacy/national-list";
import { catalogueMedicine } from "@/lib/pharmacy/shared-catalogue/medicine";
import { resolveScan } from "@/lib/pharmacy/shared-catalogue/scan";
import { catalogueSearch } from "@/lib/pharmacy/shared-catalogue/search";
import {
  linkBarcode,
  resolveCodeConflict,
  reviewProposals,
} from "@/lib/pharmacy/shared-catalogue/store";
import { loadCatalogueNames } from "@/scripts/pharmacy/load-catalogue-names";
import { seedCatalogue } from "@/scripts/pharmacy/seed-catalogue-from-emhslu";
import { bootLane, department, hospital, laneOn, probe, staff, superadmin } from "./_pglite";

vi.mock("server-only", () => ({}));

const CSV = readFileSync("data/pharmacy/national-list/emhslu-2023.csv", "utf8");
const EDITION = "EMHSLU 2023";

describe.skipIf(!laneOn)("the shared medicines catalogue (ADR 0456, 0251–0252)", () => {
  let lane: Lane;
  let pg: Pg;
  const f = {
    sa: "",
    curatorA: "",
    curatorB: "",
    outsider: "",
    h: "",
    pharmacist: "",
    brand: "",
    paracetamolMedicine: "",
  };
  const one = async <T = { id: string }>(sql: string, p?: unknown[]) =>
    (await pg.query<T>(sql, p)).rows[0]!;
  const count = async (table: string) =>
    Number((await one<{ n: string }>(`SELECT count(*) AS n FROM public.${table}`)).n);
  const write = <T>(fn: (tx: EmrTx) => Promise<T>) =>
    lane.db.transaction((tx) => fn(tx as unknown as EmrTx));
  const proposalFor = async (line: number) =>
    (
      await one(
        `SELECT p.id FROM public.cat_proposals p WHERE p.proposer_source = 'seed:emhslu'
           AND (p.payload->'lines') @> to_jsonb($1::int)`,
        [line],
      )
    ).id;
  /** Drizzle wraps a database error; its message is the cause's. */
  const fails = async (p: Promise<unknown>, re: RegExp) => {
    const e = (await p.then(
      () => null,
      (x: unknown) => x,
    )) as { message?: string; cause?: { message?: string } } | null;
    expect(e, "expected a refusal").not.toBeNull();
    expect(`${e!.message} ${e!.cause?.message ?? ""}`).toMatch(re);
  };
  const lineOf = (name: string, strength: string) =>
    readNationalList(CSV).rows.find((r) => r.genericName === name && r.strength === strength)!.line;

  beforeAll(async () => {
    lane = await bootLane();
    pg = lane.pg;
    f.sa = await superadmin(pg);
    f.curatorA = await superadmin(pg);
    f.curatorB = await superadmin(pg);
    f.outsider = await superadmin(pg);
    for (const u of [f.curatorA, f.curatorB])
      await pg.query(
        `INSERT INTO public.catalogue_curators (user_id, granted_by) VALUES ($1, $2)`,
        [u, f.sa],
      );
    const edition = await one(
      `INSERT INTO public.pharmacy_national_list_editions (name, source_ref, imported_by)
       VALUES ($1, 'Ministry of Health, EMHSLU 2023', $2) RETURNING id`,
      [EDITION, f.sa],
    );
    for (const r of readNationalList(CSV).rows)
      await pg.query(
        `INSERT INTO public.pharmacy_national_list_rows
           (edition_id, generic_name, form, strength, level_of_care, ven_class, therapeutic_class, source_line,
            kind, list_section, unit, specialist, source_page, check_note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          edition.id,
          r.genericName,
          r.form,
          r.strength,
          r.levelOfCare,
          r.venClass,
          r.therapeuticClass,
          r.line,
          r.kind,
          r.listSection,
          r.unit,
          r.specialist,
          r.sourcePage,
          r.checkNote,
        ],
      );
    f.h = await hospital(pg, "Catalogue hospital");
    f.pharmacist = (
      await staff(pg, {
        hospitalId: f.h,
        departmentId: await department(pg, f.h, "Pharmacy"),
        cadre: "PHARMACIST",
      })
    ).userId;
  }, 120_000);

  it("0252: the signed forms and routes are in place, with no EDQM claim", async () => {
    expect(await count("cat_dose_forms")).toBe(40);
    expect(await count("cat_routes")).toBe(15);
    expect(await count("cat_dose_forms WHERE edqm_code IS NOT NULL OR status <> 'signed'")).toBe(0);
  });

  it("S1: a dry run writes nothing; the seed writes proposals only, one per item", async () => {
    const dry = await seedCatalogue(lane.db, CSV, EDITION, false);
    expect(dry.proposed).toBe(dry.report.medicines.length);
    expect(await count("cat_proposals")).toBe(0);
    const r = await seedCatalogue(lane.db, CSV, EDITION, true);
    expect(r.proposed).toBe(r.report.medicines.length);
    expect(await count("cat_proposals WHERE kind = 'new_medicine' AND required_reviews = 2")).toBe(
      r.proposed,
    );
    expect(await count("cat_medicines")).toBe(0);
    expect(await count("cat_substances")).toBe(0);
  }, 120_000);

  it("S3: re-running the seed changes nothing", async () => {
    const before = await count("cat_proposals");
    const again = await seedCatalogue(lane.db, CSV, EDITION, true);
    expect(again).toMatchObject({ proposed: 0, already: again.report.medicines.length });
    expect(await count("cat_proposals")).toBe(before);
  }, 120_000);

  it("the two-person rule: one confirmation applies nothing; outsiders cannot review", async () => {
    const id = await proposalFor(lineOf("Rifampicin + Isoniazid", "150 mg + 75 mg"));
    await fails(
      write((tx) => reviewProposals(tx, { userId: f.outsider }, [id], "confirm")),
      /only a curator reviews/,
    );
    const first = await write((tx) => reviewProposals(tx, { userId: f.curatorA }, [id], "confirm"));
    expect(first.applied).toEqual([]);
    expect(await count("cat_medicines")).toBe(0);
    await expect(
      write((tx) => reviewProposals(tx, { userId: f.curatorA }, [id], "confirm")),
    ).rejects.toThrow();
    await expect(
      pg.query(
        `UPDATE public.cat_proposals SET state = 'applied', decided_at = now() WHERE id = $1`,
        [id],
      ),
    ).rejects.toThrow(/2 confirmation\(s\) needed, 1 given/);
  });

  it("S2: the second curator applies it: one medicine, two ingredients, strengths as printed, row linked", async () => {
    const line = lineOf("Rifampicin + Isoniazid", "150 mg + 75 mg");
    const id = await proposalFor(line);
    const second = await write((tx) =>
      reviewProposals(tx, { userId: f.curatorB }, [id], "confirm"),
    );
    expect(second.applied).toEqual([id]);
    const med = await one<{ id: string; strength_text: string; dose_form_code: string }>(
      `SELECT id, strength_text, dose_form_code FROM public.cat_medicines WHERE proposal_id = $1`,
      [id],
    );
    expect(med).toMatchObject({ strength_text: "150 mg + 75 mg", dose_form_code: "tablet" });
    const ings = await pg.query<{ preferred_name: string; strength_text: string }>(
      `SELECT s.preferred_name, i.strength_text FROM public.cat_medicine_ingredients i
         JOIN public.cat_substances s ON s.id = i.substance_id WHERE i.medicine_id = $1 ORDER BY i.position`,
      [med.id],
    );
    expect(ings.rows).toEqual([
      { preferred_name: "rifampicin", strength_text: "150 mg" },
      { preferred_name: "isoniazid", strength_text: "75 mg" },
    ]);
    expect(
      await count(
        `cat_medicine_links WHERE medicine_id = '${med.id}' AND link_kind = 'emhslu_row'`,
      ),
    ).toBe(1);
    expect(
      await count(`cat_medicine_routes WHERE medicine_id = '${med.id}' AND route_code = 'oral'`),
    ).toBe(1);
    expect(await count(`cat_changes WHERE proposal_id = '${id}'`)).toBeGreaterThanOrEqual(4);
  });

  it("a second medicine reuses the substance; a printed former name is kept beside the INN", async () => {
    const id = await proposalFor(lineOf("Rifampicin + Isoniazid", "300 mg + 150 mg"));
    const lig = await proposalFor(lineOf("Lignocaine", "2%"));
    await write((tx) => reviewProposals(tx, { userId: f.curatorA }, [id, lig], "confirm"));
    await write((tx) => reviewProposals(tx, { userId: f.curatorB }, [id, lig], "confirm"));
    expect(await count("cat_substances WHERE key = 'rifampicin'")).toBe(1);
    expect(
      await count(
        `cat_substance_names n JOIN public.cat_substances s ON s.id = n.substance_id
          WHERE s.key = 'lidocaine' AND n.name = 'Lignocaine' AND n.type = 'printed'`,
      ),
    ).toBe(1);
  });

  it("a rejection needs a reason and closes the proposal", async () => {
    const id = await proposalFor(lineOf("Paracetamol", "500 mg"));
    await expect(
      write((tx) => reviewProposals(tx, { userId: f.curatorA }, [id], "reject")),
    ).rejects.toThrow(/Say why/);
    await write((tx) =>
      reviewProposals(tx, { userId: f.curatorA }, [id], "reject", "Check the strength."),
    );
    expect(
      (await one<{ state: string }>(`SELECT state FROM public.cat_proposals WHERE id = $1`, [id]))
        .state,
    ).toBe("rejected");
  });

  it("nobody reviews their own proposal", async () => {
    const own = await one(
      `INSERT INTO public.cat_proposals (kind, payload, source, proposed_by, required_reviews)
       VALUES ('new_medicine', '{}', 'a test', $1, 2) RETURNING id`,
      [f.curatorA],
    );
    await fails(
      write((tx) => reviewProposals(tx, { userId: f.curatorA }, [own.id], "confirm")),
      /nobody reviews their own proposal/,
    );
    await expect(
      pg.query(
        `INSERT INTO public.cat_proposals (kind, payload, source, proposed_by, required_reviews)
         VALUES ('correction', '{}', 'a test', $1, 1)`,
        [f.curatorA],
      ),
    ).rejects.toThrow(/cp_two_person/);
  });

  it("a fact exists only from an applied proposal", async () => {
    const open = await proposalFor(lineOf("Paracetamol", "500 mg"));
    await expect(
      pg.query(
        `INSERT INTO public.cat_substances (key, preferred_name, kind, proposal_id) VALUES ('made up', 'made up', 'medicine', $1)`,
        [open],
      ),
    ).rejects.toThrow(/needs an applied proposal/);
  });

  it("S4: no hospital user or client role writes the catalogue; pharmacy viewers read it", async () => {
    const pharmacist = {
      userId: f.pharmacist,
      role: "medsync_clinical_reader" as const,
      hospitalId: f.h,
    };
    for (const t of [
      "cat_substances",
      "cat_medicines",
      "cat_proposals",
      "cat_pack_codes",
      "catalogue_curators",
    ]) {
      const w = await probe(pg, pharmacist, `DELETE FROM public.${t}`);
      expect(w.ok, t).toBe(false);
      for (const role of ["authenticated", "anon"] as const) {
        const r = await probe(
          pg,
          { userId: f.pharmacist, role },
          `SELECT 1 FROM public.${t} LIMIT 1`,
        );
        expect(r.ok, `${role} ${t}`).toBe(false);
      }
    }
    const ins = await probe(
      pg,
      pharmacist,
      `INSERT INTO public.cat_proposals (kind, payload, source, proposed_by, required_reviews)
       VALUES ('new_barcode', '{}', 'x', $1, 1)`,
      [f.pharmacist],
    );
    expect(ins.ok).toBe(false);
    const read = await probe(pg, pharmacist, `SELECT count(*)::int AS n FROM public.cat_medicines`);
    expect(read.ok && read.rows[0]!.n).toBeGreaterThanOrEqual(3);
  });

  /* ─── Step 3: names and search ─── */

  /** A GTIN-14 with its check digit (GS1 mod 10). */
  const gtin = (body13: string) => {
    const sum = [...body13].reduce((n, d, i) => n + Number(d) * (i % 2 === 0 ? 3 : 1), 0);
    return body13 + String((10 - (sum % 10)) % 10);
  };
  const GTIN = gtin("0614141000012");
  const search = (q: string, o: Partial<Parameters<typeof catalogueSearch>[2]> = {}) =>
    catalogueSearch(lane.db, q, { hospitalId: f.h, ...o });

  it("S6 setup: two curators confirm the whole seed in batches", async () => {
    const open = (
      await pg.query<{ id: string }>(
        `SELECT id FROM public.cat_proposals WHERE state = 'open' AND proposer_source = 'seed:emhslu'`,
      )
    ).rows.map((r) => r.id);
    for (let i = 0; i < open.length; i += 500) {
      const batch = open.slice(i, i + 500);
      await write((tx) => reviewProposals(tx, { userId: f.curatorA }, batch, "confirm"));
      await write((tx) => reviewProposals(tx, { userId: f.curatorB }, batch, "confirm"));
    }
    expect(
      await count("cat_proposals WHERE state = 'open' AND proposer_source = 'seed:emhslu'"),
    ).toBe(0);
    expect(await count("cat_medicines")).toBeGreaterThan(2500);
  }, 600_000);

  it("the signed names load as proposals one curator confirms; a re-run adds nothing", async () => {
    const r = await loadCatalogueNames(lane.db, true);
    expect(r.proposed).toBeGreaterThan(20);
    expect((await loadCatalogueNames(lane.db, true)).proposed).toBe(0);
    const ids = (
      await pg.query<{ id: string }>(
        `SELECT id FROM public.cat_proposals WHERE state = 'open' AND proposer_source = 'seed:names-v1'`,
      )
    ).rows.map((x) => x.id);
    await write((tx) => reviewProposals(tx, { userId: f.curatorA }, ids, "confirm"));
    expect(await count("cat_medicine_names WHERE name = 'AL'")).toBeGreaterThanOrEqual(1);
    expect(r.unmatched.map((u) => u.name)).not.toContain("PCM");

    // A brand and a pack with a barcode, as Step 4 and 5 will propose them.
    const para = await one(
      `SELECT m.id FROM public.cat_medicines m WHERE m.display_name ILIKE 'Paracetamol 500 mg%' LIMIT 1`,
    ).catch(() => null);
    const med =
      para ??
      (await one(
        `SELECT m.id FROM public.cat_medicines m JOIN public.cat_medicine_ingredients i ON i.medicine_id = m.id
           JOIN public.cat_substances s ON s.id = i.substance_id WHERE s.key = 'paracetamol' LIMIT 1`,
      ));
    const prop = await one(
      `INSERT INTO public.cat_proposals (kind, payload, source, proposer_source, required_reviews)
       VALUES ('new_product', '{}', 'test fixture', 'test', 1) RETURNING id`,
    );
    await pg.query(
      `INSERT INTO public.cat_proposal_reviews (proposal_id, reviewer, decision) VALUES ($1, $2, 'confirm')`,
      [prop.id, f.curatorA],
    );
    await pg.query(
      `UPDATE public.cat_proposals SET state = 'applied', decided_at = now() WHERE id = $1`,
      [prop.id],
    );
    const maker = await one(
      `INSERT INTO public.cat_manufacturers (name, country, proposal_id) VALUES ('Demo Labs (U) Ltd', 'Uganda', $1) RETURNING id`,
      [prop.id],
    );
    const brand = await one(
      `INSERT INTO public.cat_products (medicine_id, brand_name, manufacturer_id, nda_number, nda_state, proposal_id)
       VALUES ($1, 'Demo brand P', $2, 'NDA/MAL/HDP/0001', 'registered', $3) RETURNING id`,
      [med.id, maker.id, prop.id],
    );
    const pack = await one(
      `INSERT INTO public.cat_packs (product_id, description, contents, proposal_id) VALUES ($1, 'Tin of 1,000', 1000, $2) RETURNING id`,
      [brand.id, prop.id],
    );
    await pg.query(
      `INSERT INTO public.cat_pack_codes (pack_id, code_type, code, state, created_by, proposal_id)
       VALUES ($1, 'GTIN', $2, 'confirmed', $3, $4)`,
      [pack.id, GTIN, f.curatorA, prop.id],
    );
    f.brand = brand.id;
    f.paracetamolMedicine = med.id;
  }, 120_000);

  it("S5: any name, abbreviation, brand, maker, misspelling, registration or barcode finds it, saying why", async () => {
    const top = async (q: string) => (await search(q))[0];
    expect(await top("acetaminophen")).toMatchObject({
      group: "medicine",
      why: "Also called acetaminophen",
    });
    expect((await top("acetaminophen"))!.title).toMatch(/^Paracetamol/);
    expect((await top("PCM"))!.title).toMatch(/^Paracetamol/);
    expect((await top("PCM"))!.why).toBe("Also called PCM");
    expect((await top("paracetmol"))!.title).toMatch(/^Paracetamol/);
    expect((await top("lignocaine"))!.title).toMatch(/^Lidocaine/);
    expect((await search("AL")).some((h) => /^Artemether \+ Lumefantrine/.test(h.title))).toBe(
      true,
    );
    const brand = (await search("Demo brand P")).find((h) => h.group === "brand");
    expect(brand).toMatchObject({ id: f.brand, medicineId: f.paracetamolMedicine });
    const maker = (await search("Demo Labs")).find((h) => h.group === "brand");
    expect(maker).toMatchObject({ id: f.brand, why: "Made by Demo Labs (U) Ltd" });
    expect((await search("NDA/MAL/HDP/0001"))[0]).toMatchObject({
      id: f.brand,
      why: "Registration NDA/MAL/HDP/0001",
    });
    expect((await search(GTIN))[0]).toMatchObject({ id: f.brand, why: `Barcode ${GTIN}` });
    expect((await search(GTIN.slice(1)))[0]).toMatchObject({ id: f.brand });
  });

  it("three letters also match by prefix, the exact abbreviation still first; two stay whole-name", async () => {
    const cef = await search("cef");
    expect(cef.some((h) => h.group === "medicine" && /^Cef/i.test(h.title))).toBe(true);
    expect((await search("PCM"))[0]).toMatchObject({ why: "Also called PCM" });
    expect((await search("PCM"))[0]!.title).toMatch(/^Paracetamol/);
    expect((await search("ce")).some((h) => /^Cef/i.test(h.title))).toBe(false);
  });

  it("4.2: a medicine shows its names, then its packs: barcoded first, Unbranded · loose last", async () => {
    const m = (await catalogueMedicine(lane.db, f.paracetamolMedicine, f.h))!;
    expect(m.names[0]).toMatchObject({ name: "paracetamol", type: "preferred" });
    expect(m.names).toContainEqual({ name: "acetaminophen", type: "USAN" });
    expect(m.names).toContainEqual({ name: "PCM", type: "local" });
    expect(m.packs[0]).toMatchObject({
      productId: f.brand,
      gtin: GTIN,
      confirmedBy: 1,
      maker: "Demo Labs (U) Ltd",
    });
    expect(m.packs.at(-1)).toMatchObject({ packId: null, brand: null });
    expect(m.routes.length).toBeGreaterThan(0);
    // The search carries the form and routes the picker's chips filter on.
    const hit = (await search("acetaminophen"))[0]!;
    expect(hit.routes.length).toBeGreaterThan(0);
    expect(
      await catalogueMedicine(lane.db, "00000000-0000-0000-0000-000000000000", f.h),
    ).toBeNull();
  });

  it("S7: a health supply never appears in a prescribing search", async () => {
    const all = await search("gloves");
    expect(all.some((h) => h.kind === "health_supply")).toBe(true);
    expect((await search("gloves", { prescribing: true })).length).toBe(0);
    expect(
      (await search("gloves", { kind: "medicine" })).some((h) => h.kind === "health_supply"),
    ).toBe(false);
  });

  it("S6: p95 under 150 ms on the full catalogue, with the plan reported", async () => {
    const terms = [
      "paracetamol",
      "acetaminophen",
      "PCM",
      "amoxycilin",
      "ceftriaxone",
      "Demo brand P",
      GTIN,
      "NDA/MAL/HDP/0001",
      "metformin",
      "gloves",
      "ORS",
      "insulin",
      "artemether",
      "salbutamol",
      "cotrimoxazole",
      "lignocaine",
      "TLD",
      "oxytocin",
      "syringe",
      "diazepam",
    ];
    // As autovacuum does after a bulk load: without statistics the planner scans instead of using the indexes.
    await pg.exec("ANALYZE");
    await search("warm up");
    const times: number[] = [];
    for (let round = 0; round < 3; round++)
      for (const t of terms) {
        const t0 = performance.now();
        await search(t);
        times.push(performance.now() - t0);
      }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)]!;
    const plan = await pg.query<{ "QUERY PLAN": string }>(
      `EXPLAIN SELECT 1 FROM public.cat_substance_names n WHERE private.cat_fold(n.name) % private.cat_fold('acetaminophen')`,
    );
    process.stderr.write(
      `catalogue search: ${await count("cat_medicines")} medicines; p95 ${p95.toFixed(1)} ms over ${times.length} searches\n` +
        plan.rows.map((r) => r["QUERY PLAN"]).join("\n") +
        "\n",
    );
    expect(p95).toBeLessThan(150);
  }, 120_000);

  /* ─── Step 5: barcodes ─── */

  const b = { hB: "", pharmacistB: "", packX: "", packY: "" };
  const scanAt = (who: { userId: string; hospitalId: string }, raw: string) =>
    asClinicalReader(who, (tx) => resolveScan(tx, who.hospitalId, raw), lane.db);
  const A = () => ({ userId: f.pharmacist, hospitalId: f.h });
  const B = () => ({ userId: b.pharmacistB, hospitalId: b.hB });
  const proposalOf = async (codeId: string) =>
    (
      await one<{ p: string }>(
        `SELECT evidence->>'proposalId' AS p FROM public.cat_pack_codes WHERE id = $1`,
        [codeId],
      )
    ).p;

  it("Step 5 setup: a second hospital, and two packs of the demo brand", async () => {
    b.hB = await hospital(pg, "Second catalogue hospital");
    b.pharmacistB = (
      await staff(pg, {
        hospitalId: b.hB,
        departmentId: await department(pg, b.hB, "Pharmacy"),
        cadre: "PHARMACIST",
      })
    ).userId;
    const prop = await one(
      `INSERT INTO public.cat_proposals (kind, payload, source, proposer_source, required_reviews, state, decided_at)
       VALUES ('new_pack', '{}', 'test fixture', 'test-packs', 1, 'open', NULL) RETURNING id`,
    );
    await pg.query(
      `INSERT INTO public.cat_proposal_reviews (proposal_id, reviewer, decision) VALUES ($1, $2, 'confirm')`,
      [prop.id, f.curatorA],
    );
    await pg.query(
      `UPDATE public.cat_proposals SET state = 'applied', decided_at = now() WHERE id = $1`,
      [prop.id],
    );
    for (const [k, d] of [
      ["packX", "Blister 10 × 10"],
      ["packY", "Bottle of 100"],
    ] as const)
      b[k] = (
        await one(
          `INSERT INTO public.cat_packs (product_id, description, contents, proposal_id) VALUES ($1, $2, 100, $3) RETURNING id`,
          [f.brand, d, prop.id],
        )
      ).id;
  });

  it("the confirmed demo barcode resolves at both hospitals; a typed name is text; a wrong check digit is refused", async () => {
    expect(await scanAt(A(), `01${GTIN}17270600${"\u001d"}10LOT1`)).toMatchObject({
      kind: "pack",
      via: "shared",
    });
    expect(await scanAt(B(), GTIN.slice(1))).toMatchObject({ kind: "pack", via: "shared" });
    expect(await scanAt(A(), "paracetamol")).toEqual({ kind: "text", text: "paracetamol" });
    expect(await scanAt(A(), `01${GTIN.slice(0, 13)}${(Number(GTIN[13]) + 1) % 10}`)).toEqual({
      kind: "refused",
      reason: "check_digit",
    });
  });

  it("S14: a link made at A resolves at A at once, and at B only after confirmation", async () => {
    const code = gtin("0614141000099");
    expect(await scanAt(A(), code)).toMatchObject({ kind: "unknown" });
    const r = await write((tx) =>
      linkBarcode(tx, A(), { packId: b.packX, codeType: "GTIN", code }),
    );
    expect(r.state).toBe("local");
    expect(await scanAt(A(), code)).toMatchObject({ kind: "pack", packId: b.packX, via: "local" });
    expect(await scanAt(B(), code)).toMatchObject({ kind: "unknown" });
    // RLS (0254): B sees neither A's link nor A's proposal.
    const peek = await probe(
      pg,
      { userId: b.pharmacistB, role: "medsync_clinical_reader", hospitalId: b.hB },
      `SELECT (SELECT count(*)::int FROM public.cat_pack_codes WHERE hospital_id = $1) AS codes,
              (SELECT count(*)::int FROM public.cat_proposals WHERE hospital_id = $1) AS props`,
      [f.h],
    );
    expect(peek.ok && peek.rows[0]).toEqual({ codes: 0, props: 0 });
    // Linking the same pack again is a no-op; another pack here is refused.
    expect(
      (await write((tx) => linkBarcode(tx, A(), { packId: b.packX, codeType: "GTIN", code })))
        .proposalId,
    ).toBeNull();
    await fails(
      write((tx) => linkBarcode(tx, A(), { packId: b.packY, codeType: "GTIN", code })),
      /linked to another pack here/,
    );
    await write((tx) => reviewProposals(tx, { userId: f.curatorB }, [r.proposalId!], "confirm"));
    expect(await scanAt(B(), code)).toMatchObject({ kind: "pack", packId: b.packX, via: "shared" });
    expect(await scanAt(A(), code)).toMatchObject({ kind: "pack", packId: b.packX, via: "local" });
  });

  it("S15: one code linked to two packs is a conflict at both hospitals and in the queue, until the team settles it", async () => {
    const code = gtin("0614141000088");
    const a = await write((tx) =>
      linkBarcode(tx, A(), { packId: b.packX, codeType: "GTIN", code }),
    );
    const bb = await write((tx) =>
      linkBarcode(tx, B(), { packId: b.packY, codeType: "GTIN", code }),
    );
    expect(bb.state).toBe("conflict");
    expect(await scanAt(A(), code)).toMatchObject({ kind: "conflict", packIds: [b.packX] });
    expect(await scanAt(B(), code)).toMatchObject({ kind: "conflict", packIds: [b.packY] });
    const queue = await pg.query<{ state: string }>(
      `SELECT state FROM public.cat_pack_codes WHERE code = $1`,
      [code],
    );
    expect(queue.rows.map((r) => r.state)).toEqual(["conflict", "conflict"]);
    await fails(
      write((tx) => reviewProposals(tx, { userId: f.curatorA }, [a.proposalId!], "confirm")),
      /in conflict/,
    );
    await fails(
      write((tx) =>
        resolveCodeConflict(
          tx,
          { userId: f.pharmacist },
          { codeType: "GTIN", code, keepPackId: b.packX, note: "x" },
        ),
      ),
      /Only a curator/,
    );
    const done = await write((tx) =>
      resolveCodeConflict(
        tx,
        { userId: f.curatorA },
        { codeType: "GTIN", code, keepPackId: b.packX, note: "Checked against both packs" },
      ),
    );
    expect(done).toEqual({ kept: 1, withdrawn: 1 });
    expect(await scanAt(A(), code)).toMatchObject({ kind: "pack", packId: b.packX });
    expect(await scanAt(B(), code)).toMatchObject({ kind: "unknown" });
  });

  it("S16: nobody confirms their own proposal", async () => {
    const code = gtin("0614141000077");
    const r = await write((tx) =>
      linkBarcode(
        tx,
        { userId: f.curatorA, hospitalId: f.h },
        { packId: b.packY, codeType: "GTIN", code },
      ),
    );
    await fails(
      write((tx) => reviewProposals(tx, { userId: f.curatorA }, [r.proposalId!], "confirm")),
      /nobody reviews their own proposal/,
    );
    expect(await proposalOf(r.codeId)).toBe(r.proposalId);
  });
});
