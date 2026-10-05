/**
 * The diabetes pack's go-live on the NCD clerkship (NCD_DM_PACK_LIVE): the form it adds, the translation from the
 * live answers, the lean data the browser runs, and the decision panel's model. Flag off, nothing changes.
 */
import { readFileSync } from "node:fs";
import type { CaptureMap } from "@/lib/ncd/engine/evaluate";
import type { PackInput, PackValues } from "@/lib/ncd/pack/types";
import { describe, expect, it } from "vitest";

import { DIABETES_CATALOG } from "@/lib/ncd/catalog/diabetes";
import { recorded } from "@/lib/ncd/catalog/schema";
import { validateCatalog } from "@/lib/ncd/catalog/validate";
import { diabetesPack } from "@/lib/ncd/pack";
import {
  leanDiabetesPack,
  ncdCatalog,
  packCaptureCatalog,
  packFieldCodes,
  PLATFORM_FIELDS,
} from "@/lib/ncd/pack/capture";
import { runProtocol } from "@/lib/ncd/pack/engine";
import {
  MAPPED_FROM_LIVE,
  PACK_ONLY_CODE,
  RENAMED,
  SAME,
  toPackInput,
  toPackValues,
} from "@/lib/ncd/pack/live";
import { buildPackView } from "@/lib/ncd/pack/view";
import { generatePackCapture, PACK_CAPTURE_OUTPUT } from "@/scripts/ncd/gen-pack-capture";

const pack = diabetesPack();
const V = JSON.parse(readFileSync("tests/ncd/fixtures/diabetes-pack-vignettes.json", "utf8"))
  .vignettes as {
  id: string;
  site: string;
  established: boolean;
  ageBand: PackInput["ageBand"];
  values: PackValues;
}[];
const siteOf = (s: string) => (s === "district" ? "district" : "referral") as PackInput["site"];

describe("the form the pack adds", () => {
  it("is the generator's output (regenerate with npx tsx scripts/ncd/gen-pack-capture.ts)", () => {
    expect(JSON.parse(readFileSync(PACK_CAPTURE_OUTPUT, "utf8"))).toEqual(
      generatePackCapture(process.cwd()),
    );
  });
  it("passes the live catalog validator", () => {
    const errors = validateCatalog(packCaptureCatalog()).filter((i) => i.severity === "error");
    expect(errors).toEqual([]);
  });
  it("lets every pack feature be answered: a live question, a mapped one, an added one, or the encounter", () => {
    const live = new Set(DIABETES_CATALOG.features.map((f) => f.code));
    const added = new Set(packFieldCodes());
    const reached = (code: string) =>
      (SAME as readonly string[]).includes(code) ||
      code in RENAMED ||
      MAPPED_FROM_LIVE.has(code) ||
      added.has(PACK_ONLY_CODE[code] ?? code) ||
      PLATFORM_FIELDS.has(code) ||
      ["dm_status", "glucose_lowering_therapy", "insulin_omitted"].includes(code) ||
      (live.has(code) && !(code in PACK_ONLY_CODE));
    expect(Object.keys(pack.features).filter((c) => !reached(c))).toEqual([]);
  });
  it("keeps the live form's id, so a draft carries across the switch", () => {
    expect(packCaptureCatalog().id).toBe(DIABETES_CATALOG.id);
    expect(packCaptureCatalog().features.slice(0, DIABETES_CATALOG.features.length)).toEqual(
      DIABETES_CATALOG.features,
    );
  });
  it("flag off: the deployment's form is the v0.1.0 form", () => {
    expect(process.env.NCD_DM_PACK_LIVE).not.toBe("1");
    expect(ncdCatalog()).toBe(DIABETES_CATALOG);
  });
});

describe("the lean pack the browser runs", () => {
  it("gives exactly the full pack's result on every synthetic patient", () => {
    const lean = leanDiabetesPack();
    expect(JSON.stringify(lean).length).toBeLessThan(JSON.stringify(pack).length / 2);
    for (const v of V) {
      const input = {
        values: v.values,
        site: siteOf(v.site),
        established: v.established,
        ageBand: v.ageBand,
      };
      expect(runProtocol(lean, input), v.id).toEqual(runProtocol(pack, input));
    }
  });
});

describe("live answers in the pack's shape", () => {
  const cap = (o: Record<string, unknown>): CaptureMap =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, recorded(v as never)]));
  it("maps renamed and reshaped fields, and leaves what cannot be mapped unassessed", () => {
    const v = toPackValues(
      cap({
        fpg: 7.4,
        glucose_lowering_therapy: ["metformin", "sulfonylurea"],
        sulfonylurea_agent: "gliclazide",
        dm_duration: { value: 6, unit: "years" },
        small_fibre_sensation: "both_feet",
        fundus_view_obscured: true,
        haemoglobin_variant: "unknown",
        last_retinal_exam: "over_2_years",
      }),
    );
    expect(v).toMatchObject({
      fasting_pg: 7.4,
      glucose_lowering_therapy: ["metformin", "gliclazide"],
      years_since_diagnosis: 6,
      pinprick_feet: "reduced",
      retina_view: "inadequate",
      months_since_eye_screen: 24,
    });
    expect(v).not.toHaveProperty("sickle_cell_disease");
  });
  it("P0-03: a medicine list holding only 'unknown' stays not assessed", () => {
    expect(toPackValues(cap({ glucose_lowering_therapy: ["unknown"] }))).not.toHaveProperty(
      "glucose_lowering_therapy",
    );
  });
  it("passes the pack's own fields through, and the encounter supplies age, care setting and 'could be pregnant'", () => {
    const i = toPackInput(cap({ sex: "female", c_peptide_pmol: 150, hba1c_point_of_care: true }), {
      ageYears: 34,
      careSetting: "inpatient",
      site: "referral",
      established: false,
      packFields: packFieldCodes(),
    });
    expect(i.values).toMatchObject({
      c_peptide: 150,
      hba1c_point_of_care: true,
      age_years: 34,
      care_setting: "inpatient",
      pregnancy_possible: true,
    });
    expect(i.ageBand).toBe("adult");
    expect(toPackInput({}, { ageYears: 14, site: "district", established: false }).ageBand).toBe(
      "adolescent",
    );
  });
});

describe("the decision panel's model", () => {
  const lean = leanDiabetesPack();
  const view = (id: string) => {
    const v = V.find((x) => x.id === id)!;
    return buildPackView(lean, {
      values: v.values,
      site: siteOf(v.site),
      established: v.established,
      ageBand: v.ageBand,
    });
  };
  it("an emergency is one interrupt carrying every folded action; never a 'Now' item in the lists", () => {
    for (const v of V) {
      const r = runProtocol(lean, {
        values: v.values,
        site: siteOf(v.site),
        established: v.established,
        ageBand: v.ageBand,
      });
      const m = view(v.id);
      expect(m.interrupt?.id ?? null, v.id).toBe(r.interrupt);
      if (m.interrupt) expect(m.interrupt.actions.length, v.id).toBe(r.interruptActions.length - 1);
      expect(
        [...m.today, ...m.care].some((i) => i.urgency === "now"),
        v.id,
      ).toBe(false);
    }
  });
  it("under 16 the interrupt routes only (no fluids), and a medicine flag shows its 'refer' wording", () => {
    const child = view("DMV-203");
    expect(child.interrupt?.title).not.toMatch(/intravenous fluids/);
    for (const v of V.filter((x) => x.ageBand === "child" || x.ageBand === "adolescent"))
      for (const f of view(v.id).flags)
        expect(f.action, `${v.id} ${f.id}`).toMatch(/^Under 16: refer/);
  });
  it("shows the default diagnostic set first", () => {
    const m = view("DMV-170");
    expect(m.diagnosis[0]).toMatchObject({
      id: "ug_integrated_dm_2026",
      isDefault: true,
      state: "met",
    });
  });
});

describe("the decision panel renders", () => {
  it("shows the interrupt, today's items, the plan and the four-eyes notice; red only in the interrupt", async () => {
    const { createElement: h } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { NcdPackView } =
      await import("@/app/doctor/encounters/[encounterId]/_components/ncd-pack-view");
    const { buildProfile } = await import("@/lib/ncd/profile");
    const { REFERRAL_SITE } = await import("@/lib/ncd/catalog/diabetes");
    const profile = buildProfile({ catalog: DIABETES_CATALOG, values: {}, site: REFERRAL_SITE });
    const lean = leanDiabetesPack();
    const render = (id: string) => {
      const v = V.find((x) => x.id === id)!;
      const view = buildPackView(lean, {
        values: v.values,
        site: siteOf(v.site),
        established: v.established,
        ageBand: v.ageBand,
      });
      return { view, html: renderToStaticMarkup(h(NcdPackView, { view, profile })) };
    };
    const dka = render("DMV-203");
    expect(dka.view.interrupt).not.toBeNull();
    expect(dka.html).toContain('role="alert"');
    expect(dka.html).toContain(dka.view.interrupt!.title.replace(/&/g, "&amp;").slice(0, 30));
    expect(dka.html).not.toMatch(/intravenous fluids/);
    expect(dka.html).toContain("the second clinical reviewer has not signed yet");
    const routine = render("DMV-80");
    expect(routine.view.interrupt).toBeNull();
    expect(routine.html).not.toContain('role="alert"');
    expect(routine.html).toContain("Care plan");
  });
});
