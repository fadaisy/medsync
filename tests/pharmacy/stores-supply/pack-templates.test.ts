/**
 * Owner item 12, ADR 0469: signed packs start from MedSync's sourced drafts. Every pack kind has a starting draft that
 * fits its schema once the hospital's own fields are answered; every national value names its source; the recall
 * template passes the banned-term scan; the tracer ids are MedSync medicines; Write a draft opens with the template only
 * when the hospital has neither a draft nor a version in force.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DRAFT_KEEP_REASONS,
  DRAFT_NOT_SUPPLIED_REASONS,
  DRAFT_QUERY_TYPES,
} from "@/content/pharmacy-prescriber";
import { STORES_B } from "@/content/pharmacy-stores";
import { COUNSELLING_POINTS, IDENTITY_ROUTES } from "@/content/pharmacy-supply";
import { PROPOSED_WITNESS_LIST } from "@/lib/pharmacy/controlled";
import {
  PACK_TEMPLATES,
  PACK_TEMPLATES_COPY,
  startingDraft,
  templateContent,
} from "@/lib/pharmacy/stores/pack-templates";
import { PACK_KINDS, parsePack, templateScan } from "@/lib/pharmacy/stores/packs";
import { drugById } from "@/lib/prescribing/formulary";

/** The fields only the hospital can answer, and a fixture answer for each, so the rest can be checked. */
const HOSPITAL: Record<string, unknown> = {
  "order_parameters.budgetSource": null,
  "message_name.name": "Test hospital",
  "repeat_rules.repeatList": ["metformin"],
};

const fields = () =>
  PACK_KINDS.flatMap((kind) =>
    Object.entries(PACK_TEMPLATES.packs[kind] ?? {}).map(([path, f]) => ({ kind, path, f })),
  );

describe("signed packs' starting drafts (ADR 0469)", () => {
  it("covers all 21 kinds, and stays draft until the CSO signs it", () => {
    expect(PACK_KINDS).toHaveLength(21);
    expect(Object.keys(PACK_TEMPLATES.packs).sort()).toEqual([...PACK_KINDS].sort());
    expect(PACK_TEMPLATES_COPY).toEqual({ status: "draft", signedBy: null, signedOn: null });
  });

  it("every template parses for its kind once the hospital's own fields are answered", () => {
    for (const kind of PACK_KINDS) {
      const content = templateContent(kind);
      for (const [key, v] of Object.entries(HOSPITAL)) {
        const [k, ...path] = key.split(".");
        if (k === kind) (content as Record<string, unknown>)[path.join(".")] = v;
      }
      const r = parsePack(kind, content);
      expect(r, kind).toEqual({ ok: true, content: expect.anything() });
    }
  });

  it("leaves only the hospital's fields to the hospital, each empty and with a reason", () => {
    const hospital = fields().filter((x) => x.f.basis === "hospital");
    expect(hospital.map((x) => `${x.kind}.${x.path}`).sort()).toEqual(Object.keys(HOSPITAL).sort());
    for (const { f } of hospital) {
      expect(f.value === null || (Array.isArray(f.value) && f.value.length === 0)).toBe(true);
      expect(f.basis === "hospital" && f.reason.length).toBeGreaterThan(10);
    }
  });

  it("every national value names its source, and every proposal its reason", () => {
    for (const { kind, path, f } of fields()) {
      if (f.basis === "national")
        expect(f.source, `${kind}.${path}`).toMatch(
          /(EMHS Manual 2018|SOP 2019|HMIS Manual 2010).*p+\. ?\d/,
        );
      else expect(f.reason.length, `${kind}.${path}`).toBeGreaterThan(10);
    }
  });

  it("the national figures are the research's, as cited", () => {
    const o = PACK_TEMPLATES.packs.order_parameters;
    expect([o.cycleMonths!.value, o.maxMonths!.value, o.minMonths!.value]).toEqual([2, 4, 2]);
    expect(o.cycleMonths!.basis).toBe("national");
    // No national emergency order point: MedSync's proposal, never presented as national.
    expect(o.emergencyOrderPointMonths).toMatchObject({ value: "not_kept", basis: "medsync" });
    expect(PACK_TEMPLATES.packs.cart_lookahead.days).toMatchObject({ value: 90, basis: "medsync" });
  });

  it("the recall template carries both places and passes the banned-term scan", () => {
    const body = PACK_TEMPLATES.packs.recall_template.body!.value as string;
    expect(body).toContain("{messageName}");
    expect(body).toContain("{phone}");
    expect(templateScan(body)).toEqual([]);
    // The CSO-signed Phase 2 wording, with its two places.
    expect(body).toBe(STORES_B.recallPatientMessage("{messageName}", "{phone}"));
  });

  it("the tracer list is HMIS 105 section 6: every id a MedSync medicine, every item mapped or listed", () => {
    const t = PACK_TEMPLATES.packs.tracer_list.medicineIds! as unknown as {
      value: string[];
      mapped: Record<string, string>;
      unmapped: string[];
    };
    for (const id of t.value) expect(drugById(id), id).toBeDefined();
    expect(new Set(t.value).size).toBe(t.value.length);
    expect(new Set(Object.values(t.mapped))).toEqual(new Set(t.value));
    const items = [...Object.keys(t.mapped), ...t.unmapped.map((u) => u.split(" ")[0]!)];
    expect(new Set(items).size).toBe(41);
    expect(items.every((s) => /^S([1-9]|[1-3]\d|4[01])$/.test(s))).toBe(true);
  });

  it("the Phase 1 lists are the drafts the screens already show while unsigned", () => {
    const items = (kind: (typeof PACK_KINDS)[number]) => PACK_TEMPLATES.packs[kind].items!.value;
    const coded = (o: Record<string, string>) =>
      Object.entries(o).map(([code, words]) => ({ code, words }));
    expect(items("keep_reasons")).toEqual(DRAFT_KEEP_REASONS);
    expect(items("query_codes")).toEqual(DRAFT_QUERY_TYPES);
    expect(items("outcome_reasons")).toEqual(DRAFT_NOT_SUPPLIED_REASONS);
    expect(items("identity_routes")).toEqual(coded(IDENTITY_ROUTES));
    expect(items("counselling_points")).toEqual(coded(COUNSELLING_POINTS));
    expect(templateContent("witness_list")).toEqual(PROPOSED_WITNESS_LIST);
  });

  it("Write a draft opens with the template only when there is no draft and no version in force", () => {
    const own = { cycleMonths: 3 };
    expect(startingDraft("order_parameters", { draft: { content: own }, signed: null })).toEqual({
      content: own,
      from: "draft",
    });
    expect(
      startingDraft("order_parameters", { draft: { content: own }, signed: { content: {} } }).from,
    ).toBe("draft");
    expect(startingDraft("order_parameters", { draft: null, signed: { content: own } })).toEqual({
      content: own,
      from: "signed",
    });
    const t = startingDraft("order_parameters", { draft: null, signed: null });
    expect(t.from).toBe("template");
    expect(t.content).toMatchObject({ cycleMonths: 2, maxMonths: 4, minMonths: 2 });
    // Both pages hand the dialog the draft and the version in force.
    for (const page of [
      "app/pharmacy/store/packs/body.tsx",
      "app/pharmacy/setup/_components/packs-view.tsx",
    ]) {
      const src = readFileSync(resolve(page), "utf8");
      expect(src).toContain("draft={r.draft?.content ?? null}");
      expect(src).toContain("signed={r.signed?.content ?? null}");
    }
  });
});
