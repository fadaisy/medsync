// @vitest-environment jsdom
import type { ImpressionHandlers } from "@/components/clerking/impression/impression-step";
import type { DeskDiagnosis, DeskPayload, DeskRelation } from "@/components/emr/desk/model";
import type { DxPick } from "@/components/emr/desk/pickers";
import type { DxTerm } from "@/components/emr/desk/search";
import type { DxOptions } from "@/components/emr/desk/sections";
import type { ImpressionDraft } from "@/lib/clerking/impression/board";
import type { NoteContent } from "@/lib/emr/note-rules";
import { act, createElement as h, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { syncRecorded } from "@/components/emr/desk/model";
import {
  DX_CATALOGUE,
  DX_NAMES,
  DX_SIGNOFF,
  DX_TERM_IDS,
  dxTermUuid,
  TEST_NAMES,
  TEST_UUIDS,
} from "@/lib/clerking/impression/load";
import { ecat } from "./exam-fixtures";
import { cat, v2Payload } from "./fixtures";

/**
 * Step 09 in the v2 desk (PROMPT-CLERKING-SUMMARY-IMPRESSION §5.3–5.4): the leading card's three
 * states, suggestions added as Possible and never twice, must-not-miss pinned until reasoned and
 * holding signing (SI5), removal with a reason (D-SI-13), a junior's Final sent for co-signature
 * (SI7), and the matrix's one-tap accept (SI3). Diagnoses live in the harness the way the server
 * returns them. Synthetic patient only.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
// The association typing as the CSO signs it (the shipped file stays a draft until then).
vi.mock("@/data/clerking/dx-associations.v1.json", async (orig) => {
  const real = (await orig()) as { default: Record<string, unknown> };
  return { default: { ...real.default, status: "signed — test" } };
});
const { ClerkingDesk } = await import("@/components/clerking/clerking-desk");

const dx = {
  cat: DX_CATALOGUE,
  termIds: DX_TERM_IDS,
  names: DX_NAMES,
  tests: TEST_NAMES,
  testIds: TEST_UUIDS,
};

let n = 100;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const dxRow = (
  dxId: string,
  display: string,
  rank: "primary" | "secondary",
  verification: string,
): DeskDiagnosis => ({
  id: uuid(),
  logicalId: uuid(),
  termId: dxTermUuid(dxId),
  display,
  code: null,
  verification,
  rank,
  restricted: false,
  onProblemList: false,
  cosignPending: false,
});
const DIABETES = () =>
  dxRow("dx.dm_type_unknown", "Diabetes, type not yet determined", "primary", "provisional");
const SEPSIS = () => dxRow("dx.sepsis", "Sepsis", "secondary", "differential");
const DM2 = () => dxRow("dx.dm_type2", "Type 2 diabetes", "primary", "provisional");

function payload(diagnoses: DeskDiagnosis[], senior = true): DeskPayload {
  const p = v2Payload();
  p.clerking!.dx = {
    catalogueUrl: "/api/clerking/dx-catalogue?v=test",
    catalogueVersion: DX_CATALOGUE.version,
    signoff: DX_SIGNOFF,
  };
  p.diagnoses = diagnoses;
  p.viewer = { ...p.viewer, canFinalDiagnosis: senior };
  return p;
}

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let width = 1440;
/** What the desk last wrote, and the chart actions it asked for. */
let latest: NoteContent;
let calls: { name: string; args: unknown[] }[] = [];
let taps = 0;

/** The term index as the server returns it, for "Show all" (one loader per test: it is cached). */
const TERMS: DxTerm[] = Object.entries(DX_NAMES).map(([id, n]) => ({
  id: dxTermUuid(id),
  display: n.display,
  synonyms: id === "dx.sepsis" ? ["septicaemia"] : [],
  icd11: id === "dx.sepsis" ? "1G40" : null,
  verified: id === "dx.sepsis",
  chronic: false,
  symptomLevel: false,
  restricted: n.restricted,
  notifiable: false,
}));
let termsLoader: () => Promise<DxTerm[]> = async () => [];

/** A relation as the server returns it (DeskRelation). */
const rel = (
  condition: { logicalId: string },
  related: { logicalId: string },
  relationType: DeskRelation["relationType"] = "due_to",
  label: DeskRelation["label"] = relationType === "due_to" ? "secondary" : null,
  position = 1,
): DeskRelation => ({
  id: uuid(),
  logicalId: uuid(),
  conditionId: condition.logicalId,
  relatedConditionId: related.logicalId,
  relationType,
  label,
  position,
  qualifiers: [],
  restricted: false,
  origin: "clinician",
  encounterId: "enc",
});

function Harness({ p, offer }: { p: DeskPayload; offer?: string }) {
  const [content, setContent] = useState(p.draft!.content);
  const [diagnoses, setDiagnoses] = useState(p.diagnoses);
  const [relations, setRelations] = useState(p.relations ?? []);
  const payloadNow = useMemo(() => ({ ...p, diagnoses, relations }), [p, diagnoses, relations]);
  const shown = useMemo(() => syncRecorded(content, payloadNow), [content, payloadNow]);
  const log = (name: string, ...args: unknown[]) => calls.push({ name, args });
  const on: ImpressionHandlers & Record<string, unknown> = {
    onContent: (c: NoteContent) => setContent(() => (latest = c)),
    onSection() {},
    onDiagnosis: (pick: DxPick, o: DxOptions) => {
      log("onDiagnosis", pick, o);
      setDiagnoses((ds) => [
        ...ds.map((d) =>
          o.primary && d.rank === "primary" ? { ...d, rank: "secondary" as const } : d,
        ),
        {
          id: uuid(),
          logicalId: uuid(),
          termId: "term" in pick ? pick.term.id : null,
          display: "term" in pick ? pick.term.display : pick.typed,
          code: null,
          verification: o.verification,
          rank: o.primary ? "primary" : "secondary",
          restricted: false,
          onProblemList: false,
          cosignPending: false,
        },
      ]);
    },
    onDxStatus: (row, to) => {
      log("onDxStatus", row.dx.display, to);
      setDiagnoses((ds) =>
        ds.map((d) =>
          d.logicalId !== row.dx.logicalId
            ? d
            : p.viewer.canFinalDiagnosis || to === "working"
              ? { ...d, id: uuid(), verification: to === "final" ? "confirmed" : "provisional" }
              : { ...d, cosignPending: true },
        ),
      );
    },
    onRemove: (row, why) => {
      log("onRemove", row.dx.display, why);
      setDiagnoses((ds) => ds.filter((d) => d.logicalId !== row.dx.logicalId));
    },
    onLeading: (row, o) => log("onLeading", row.dx.display, o),
    onToDifferential: (row, o) => log("onToDifferential", row.dx.display, o),
    // Relations as the record would hold them after the write.
    onRelate: (c) => {
      log("onRelate", c);
      setRelations((rs) => [
        ...rs,
        {
          ...rel(
            { logicalId: c.conditionId },
            { logicalId: c.relatedConditionId },
            c.relationType,
            c.label,
          ),
          qualifiers: c.qualifiers,
        },
      ]);
    },
    onUnlink: (e, why) => {
      log("onUnlink", e.id, why);
      setRelations((rs) => rs.filter((r) => r.id !== e.id));
    },
    onMoveRelation: (e, position) => {
      log("onMoveRelation", e.id, position);
      setRelations((rs) =>
        rs
          .map((r) => (r.id === e.id ? { ...r, position } : r))
          .sort((a, b) => a.position - b.position),
      );
    },
    onRelabel: (e, label, qualifiers) => {
      log("onRelabel", e.id, label, qualifiers);
      setRelations((rs) => rs.map((r) => (r.id === e.id ? { ...r, label, qualifiers } : r)));
    },
    onActiveThisVisit: (k, rank) => void log("onActiveThisVisit", k.display, rank),
    onAddLinked: (parent, a) => void log("onAddLinked", parent.dx.display, a.dxId, a.relationType),
    onRefine: (row, to, decidedBy) => void log("onRefine", row.dx.display, to, decidedBy),
    onReplace: (row, to, reason) => void log("onReplace", row.dx.display, to, reason),
  };
  return h(ClerkingDesk, {
    p: payloadNow,
    cat,
    ecat,
    dx,
    content: shown,
    current: "impression",
    save: { tone: "neutral", text: "Saved 08:19" },
    actor: "u-1",
    on,
    loaders: { findings: async () => [], terms: termsLoader },
    slots: offer ? { impression: h("p", null, offer) } : undefined,
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom has no matchMedia: answer min-width and max-width queries against `width`.
  window.matchMedia = ((q: string) => {
    const min = /min-width:\s*(\d+)px/.exec(q);
    const max = /max-width:\s*(\d+(?:\.\d+)?)px/.exec(q);
    return {
      matches: min ? width >= +min[1]! : max ? width <= +max[1]! : false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    };
  }) as unknown as typeof window.matchMedia;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  calls = [];
  taps = 0;
  latest = undefined as unknown as typeof latest; // no draft carries over between tests
  width = 1440;
  termsLoader = async () => [];
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const mount = (p: DeskPayload) => act(() => root.render(h(Harness, { p })));
const all = () => host.textContent ?? "";
const tap = (el: Element | null | undefined) => {
  if (!el) throw new Error("nothing to tap");
  taps += 1;
  act(() => (el as HTMLElement).click());
};
const button = (name: string | RegExp, within: ParentNode = host) =>
  [...within.querySelectorAll("button")].find((b) =>
    typeof name === "string" ? b.textContent?.trim() === name : name.test(b.textContent ?? ""),
  );
const option = (group: string, name: string) =>
  [
    ...(host
      .querySelector(`[role="radiogroup"][aria-label="${group}"]`)
      ?.querySelectorAll('[role="radio"]') ?? []),
  ].find((b) => b.textContent?.trim() === name) as HTMLButtonElement | undefined;
const type = (el: HTMLInputElement | HTMLTextAreaElement, value: string) =>
  act(() => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
const labelled = (name: string) =>
  host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
const removeButtons = () =>
  [...host.querySelectorAll("button")].filter((b) => b.textContent === "Remove");
const stepStatus = () => host.querySelector('[data-step="impression"]')?.textContent ?? "";
const signButton = () => button(/^Sign note/) as HTMLButtonElement;
const draft = () => (latest.impression ?? {}) as unknown as ImpressionDraft;
const suggestionChips = () =>
  [
    ...host.querySelectorAll('section[aria-labelledby="impression-suggestions"] li button'),
  ] as HTMLButtonElement[];

describe("step 09, Impression", () => {
  it("shows the diabetes module's offer above the step when the desk passes one", () => {
    act(() =>
      root.render(h(Harness, { p: payload([DIABETES()]), offer: "Open the diabetes module" })),
    );
    expect(all()).toContain("Open the diabetes module");
    expect(all().indexOf("Open the diabetes module")).toBeLessThan(all().indexOf("Diabetes, type"));
  });

  it("offers a deferral with its reason when there is no leading diagnosis, and undoes it", () => {
    mount(payload([]));
    expect(all()).toContain("No leading diagnosis yet");
    expect(stepStatus()).toContain("Required");
    const input = host.querySelector('input[placeholder^="e.g."]') as HTMLInputElement;
    type(input, "awaiting the blood film");
    tap(button("Defer"));
    const items = latest.sections.s13?.items ?? [];
    expect(items).toContainEqual({ kind: "diagnosis_deferred", reason: "awaiting the blood film" });
    expect(all()).toMatch(/Diagnosis deferred\s*awaiting the blood film/);
    expect(stepStatus()).not.toContain("Required");
    tap(button("Undo"));
    expect((latest.sections.s13?.items ?? []).some((i) => i.kind === "diagnosis_deferred")).toBe(
      false,
    );
  });

  it("adds a suggestion as Possible in one tap, and never twice (§5.3, S-3)", () => {
    mount(payload([DIABETES()]));
    const chip = suggestionChips()[0]!;
    const name = chip.textContent!.trim();
    tap(chip);
    expect(taps).toBe(1);
    const add = calls.find((c) => c.name === "onDiagnosis")!;
    expect(add.args[1]).toMatchObject({ verification: "differential", primary: false });
    // On the board as Possible; the chip is gone, typed or coded.
    expect(option(`Likelihood of ${name}`, "Possible")?.getAttribute("aria-checked")).toBe("true");
    expect(suggestionChips().some((b) => b.textContent?.trim() === name)).toBe(false);
    expect(
      host.querySelectorAll(`[role="radiogroup"][aria-label="Likelihood of ${name}"]`),
    ).toHaveLength(1);
  });

  it("adds three differentials with their likelihood within the budget (≤ 6 taps)", () => {
    mount(payload([DIABETES()]));
    for (let i = 0; i < 3; i++) tap(suggestionChips()[0]);
    expect(calls.filter((c) => c.name === "onDiagnosis")).toHaveLength(3);
    expect(all()).toMatch(/Differential \(3\)/);
    expect(taps).toBeLessThanOrEqual(6);
  });

  it("keeps a must-not-miss on top until Unlikely has a reason, and holds signing (SI5)", () => {
    mount(payload([DIABETES(), SEPSIS()]));
    expect(signButton().disabled).toBe(false);
    tap(option("Likelihood of Sepsis", "Unlikely"));
    expect(taps).toBe(1);
    expect(all()).toContain("Must not miss · marked unlikely");
    expect(stepStatus()).toContain("Reason needed");
    expect(signButton().disabled).toBe(true);
    expect(all()).toMatch(/Sepsis: a must-not-miss marked unlikely needs a reason/);
    const why = [...host.querySelectorAll("textarea")].find((t) =>
      /Why is it unlikely/.test(
        host.querySelector(`label[for="${CSS.escape(t.id)}"]`)?.textContent ?? "",
      ),
    ) as HTMLTextAreaElement;
    type(why, "no source found");
    expect(draft().reasons).toMatchObject({
      [Object.keys(draft().reasons)[0]!]: "no source found",
    });
    expect(stepStatus()).not.toContain("Reason needed");
    expect(signButton().disabled).toBe(false);
    expect(host.querySelector('[data-block="impression"]')?.textContent).toMatch(
      /Considered and unlikely: sepsis \(no source found\)/,
    );
  });

  it("removes a diagnosis only with a reason, as entered in error (D-SI-13)", () => {
    mount(payload([DIABETES(), SEPSIS()]));
    tap(removeButtons()[1]); // [0] is the leading diagnosis's
    const go = button("Remove, entered in error") as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    tap(option("Why remove Sepsis?", "Ruled out"));
    expect((button("Remove, entered in error") as HTMLButtonElement).disabled).toBe(true);
    const how = [...host.querySelectorAll("label")].find(
      (l) => l.textContent === "How was it ruled out?",
    )!;
    type(document.getElementById(how.htmlFor) as HTMLInputElement, "lactate normal, afebrile");
    tap(button("Remove, entered in error"));
    expect(calls.find((c) => c.name === "onRemove")?.args).toEqual([
      "Sepsis",
      { code: "ruled_out", text: "lactate normal, afebrile" },
    ]);
    expect(all()).toMatch(/Differential \(0\)/);
  });

  it("takes a diagnosis added here by mistake off in one tap, as entered in error (ADR 0217)", () => {
    mount(payload([DIABETES(), { ...SEPSIS(), addedHere: true }]));
    const remove = removeButtons()[1]!;
    expect(remove.title).toBe("Added by mistake: remove");
    tap(remove);
    expect(calls.find((c) => c.name === "onRemove")?.args).toEqual([
      "Sepsis",
      { code: "added_by_mistake" },
    ]);
    expect(all()).not.toContain("Remove, entered in error");
  });

  it("the leading diagnosis has Remove too; one from before still asks why", () => {
    mount(payload([DIABETES()]));
    const remove = removeButtons()[0]!;
    expect(remove.title).toBe("Remove with a reason");
    tap(remove);
    expect(all()).toContain("Remove, entered in error");
    expect(calls.some((c) => c.name === "onRemove")).toBe(false);
  });

  it("lists a diagnosis's complications and what goes with it; Add puts it on the visit, linked", () => {
    mount(payload([DM2()]));
    expect(host.querySelector("#impression-add-association")?.textContent).toBe(
      "Add a linked diagnosis to Type 2 diabetes",
    );
    expect(all()).toMatch(/Diabetic retinopathy[^]*complication/);
    expect(all()).toMatch(/Hypertension[^]*goes with it/);
    expect(all()).toContain("Check for:");
    const row = [...host.querySelectorAll("li")].find((l) =>
      l.textContent?.startsWith("Hypertension"),
    )!;
    tap(button("Add", row));
    // One write: on the visit and linked (the server does both in one transaction).
    expect(calls.find((c) => c.name === "onAddLinked")?.args).toEqual([
      "Type 2 diabetes",
      "dx.hypertension",
      "associated_with",
    ]);
    expect(calls.some((c) => c.name === "onDiagnosis")).toBe(false);
  });

  it("shows a linked diagnosis under its parent with its own supports from the bucket", () => {
    const dm = DM2();
    const htn = dxRow("dx.hypertension", "Hypertension", "secondary", "provisional");
    const p = payload([dm, htn]);
    p.relations = [rel(dm, htn, "associated_with")];
    mount(p);
    const box = host.querySelector('section[aria-label="Linked to Type 2 diabetes"]')!;
    expect(box.textContent).toContain("Linked to Type 2 diabetes (1)");
    expect(box.textContent).toMatch(/Hypertension· with Type 2 diabetes/);
    // Linked, so not co-existing.
    expect(
      host.querySelector('[aria-labelledby="impression-also"]')?.textContent ?? "",
    ).not.toMatch(/Hypertension.*Working/);
    tap(button("Add findings here, from the list on the right", box));
    expect(box.querySelector('li[data-active="true"]')?.textContent).toContain("Hypertension");
    const chip = [...host.querySelectorAll("button")].find((x) =>
      x.getAttribute("aria-label")?.endsWith("link it to Hypertension"),
    );
    expect(chip).toBeTruthy();
    tap(chip);
    const col = draft().evidence[htn.logicalId] ?? {};
    expect(Object.values(col).some((m) => m.w === "for")).toBe(true);
  });

  it("arranges linked diagnoses (the relation's position) and flags one (the diagnosis's own)", () => {
    const dm = DM2();
    const htn = dxRow("dx.hypertension", "Hypertension", "secondary", "provisional");
    const ob = dxRow("dx.obesity", "Obesity", "secondary", "provisional");
    const p = payload([dm, htn, ob]);
    const e1 = rel(htn, dm, "associated_with", null, 1);
    const e2 = rel(ob, dm, "associated_with", null, 2);
    p.relations = [e1, e2];
    mount(p);
    expect(labelled("Move Hypertension up")?.disabled).toBe(true);
    tap(labelled("Move Obesity up"));
    expect(calls.filter((c) => c.name === "onMoveRelation").map((c) => c.args)).toEqual([
      [e2.id, 1],
      [e1.id, 2],
    ]);
    expect(labelled("Move Obesity up")?.disabled).toBe(true);
    tap(labelled("Flag Hypertension"));
    expect(draft().meta[htn.logicalId]?.flag).toBe(true);
    expect(all()).toContain("Flagged");
    tap(labelled("Unflag Hypertension"));
    expect(draft().meta[htn.logicalId]?.flag).toBe(false);
  });

  it("type 2 diabetes offers DKA and hypoglycaemia among its complications (CSO addition)", () => {
    mount(payload([DM2()]));
    expect(all()).toMatch(/Diabetic ketoacidosis[^]*complication/);
  });

  it("sends a junior's Final for senior co-signature and says so (SI7, D-SI-09)", () => {
    mount(payload([DIABETES()], false));
    const final = option("Status of Diabetes, type not yet determined", "Final (senior)")!;
    expect(final).toBeTruthy();
    tap(final);
    expect(calls.find((c) => c.name === "onDxStatus")?.args).toEqual([
      "Diabetes, type not yet determined",
      "final",
    ]);
    expect(all()).toContain("Final · awaiting senior co-signature");
    expect(option("Status of Diabetes, type not yet determined", "Final (senior)")?.disabled).toBe(
      true,
    );
  });

  it("stores nothing suggested until accepted, then accepts a column in one tap (SI3)", () => {
    mount(payload([DIABETES(), SEPSIS()]));
    tap(option("Differential view", "Evidence matrix") ?? button("Evidence matrix"));
    expect(host.querySelector("table")).toBeTruthy();
    expect(all()).toContain("Suggested");
    expect(latest?.impression === undefined || Object.keys(draft().evidence).length === 0).toBe(
      true,
    );
    taps = 0;
    tap(button(/^Accept suggested \(\d+\)$/));
    expect(taps).toBe(1);
    const marks = Object.values(draft().evidence).flatMap((m) => Object.values(m));
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.every((m) => m.by === "u-1")).toBe(true);
  });

  it("has no matrix below 834 px, and Details opens in a dialog below 1280 px (D-SI-14, D-SI-16)", () => {
    width = 800;
    mount(payload([DIABETES(), SEPSIS()]));
    expect(option("Differential view", "Evidence matrix")?.disabled ?? true).toBe(true);
    expect(host.querySelector("table")).toBeNull();
    tap(button("Details"));
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Evidence");
  });

  it("links an unexplained finding to the leading diagnosis in one tap", () => {
    mount(payload([DIABETES()]));
    const chip = host.querySelector(
      'button[aria-label$=": link it to Diabetes, type not yet determined"]',
    );
    expect(chip).toBeTruthy();
    const text = chip!.getAttribute("aria-label")!.split(":")[0]!;
    tap(chip);
    const lead = Object.values(draft().evidence)[0]!;
    expect(Object.values(lead).every((m) => m.w === "for")).toBe(true);
    expect(
      host.querySelector(
        `button[aria-label="${text}: link it to Diabetes, type not yet determined"]`,
      ),
    ).toBeNull();
  });
});

describe('step 09, "Show all" diagnoses', () => {
  const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement;
  const row = (name: string) =>
    [...dialog().querySelectorAll("li button")].find((b) =>
      b.textContent?.startsWith(name),
    ) as HTMLButtonElement;
  const open = async (p: DeskPayload) => {
    termsLoader = async () => TERMS;
    mount(p);
    tap(button("Show all diagnoses"));
    await act(async () => {});
  };

  it("opens every diagnosis in a centred pop-up, grouped by the catalogue's categories", async () => {
    await open(payload([DIABETES()]));
    expect(dialog().textContent).toContain("All diagnoses");
    expect(dialog().querySelectorAll("li button")).toHaveLength(TERMS.length);
    const headings = [...dialog().querySelectorAll("h3")].map((h3) => h3.textContent ?? "");
    expect(headings[0]).toMatch(/^Symptom-level terms\d+ diagnoses$/);
    expect(headings).toContainEqual(expect.stringMatching(/^Heart and vessels\d+ diagnoses$/));
    expect(headings).toHaveLength(Object.keys(DX_CATALOGUE.data.categories).length);
    // Coded, not coded, restricted and already on this visit, each in words.
    expect(row("Sepsis").textContent).toContain("1G40");
    expect(row("Cholera").textContent).toContain("Not coded");
    expect(row("Advanced HIV disease").querySelector('[aria-label="Restricted"]')).toBeTruthy();
    const diabetes = row("Diabetes, type not yet determined");
    expect(diabetes.disabled).toBe(true);
    expect(diabetes.textContent).toContain("Already on this visit");
  });

  it("adds a tap as the Add as choice shows, and stays open for the next", async () => {
    await open(payload([DIABETES()]));
    tap(row("Sepsis"));
    expect(calls.filter((c) => c.name === "onDiagnosis").map((c) => c.args)).toEqual([
      [
        { term: expect.objectContaining({ display: "Sepsis" }) },
        { verification: "differential", primary: false, addToProblemList: null },
      ],
    ]);
    expect(dialog()).toBeTruthy();
    expect(row("Sepsis").disabled).toBe(true);
    const also = [...dialog().querySelectorAll('[role="radiogroup"][aria-label="Add as"] button')];
    tap(also.find((b) => b.textContent === "Also this visit"));
    tap(row("Cholera"));
    expect(calls.filter((c) => c.name === "onDiagnosis")[1]!.args[1]).toEqual({
      verification: "provisional",
      primary: false,
      addToProblemList: null,
    });
    expect(all()).toMatch(/Differential \(1\)/);
  });

  it("makes the first pick the leading diagnosis when there is none, then differentials", async () => {
    await open(payload([]));
    tap(row("Sepsis"));
    tap(row("Cholera"));
    const adds = calls.filter((c) => c.name === "onDiagnosis").map((c) => c.args[1]);
    expect(adds).toEqual([
      { verification: "provisional", primary: true, addToProblemList: null },
      { verification: "differential", primary: false, addToProblemList: null },
    ]);
  });

  it("filters by name, synonym or code, as the search does", async () => {
    await open(payload([]));
    const filter = dialog().querySelector('input[placeholder^="Filter"]') as HTMLInputElement;
    type(filter, "septic");
    expect(dialog().textContent).toContain("Septic arthritis");
    type(filter, "septicaemia");
    expect([...dialog().querySelectorAll("li button")].map((b) => b.textContent)).toEqual([
      expect.stringMatching(/^Sepsis/),
    ]);
    type(filter, "1G4");
    expect(dialog().querySelectorAll("li button")).toHaveLength(1);
    type(filter, "zzzz");
    expect(dialog().textContent).toContain("Nothing matches");
  });
});

describe("step 09, relations on the board (dx-relations Phase 3)", () => {
  const MAL = () => dxRow("dx.malaria_severe", "Malaria, severe", "primary", "confirmed");
  const ANA = () => dxRow("dx.anaemia", "Anaemia", "secondary", "provisional");
  const PNEU = () => dxRow("dx.pneumonia", "Pneumonia", "secondary", "provisional");
  const T1 = {
    id: uuid(),
    logicalId: uuid(),
    termId: dxTermUuid("dx.dm_type1"),
    display: "Type 1 diabetes",
    code: null,
    restricted: false,
    since: "2019-04-02T00:00:00.000Z",
  };
  const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement | null;
  const grip = (name: string) => labelled(`Move ${name}`)!;
  const key = (el: Element, k: string) =>
    act(() => {
      el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
    });
  /** Lift a card with Space, step with the arrows to the target named, drop with Enter. */
  const keyDrop = (name: string, words: RegExp) => {
    const g = grip(name);
    key(g, " ");
    for (let i = 0; i < 12 && !words.test(status()); i++) key(g, "ArrowDown");
    expect(status()).toMatch(words);
    key(g, "Enter");
  };
  const status = () => host.querySelector('p[role="status"]')?.textContent ?? "";
  const section = (id: string) => host.querySelector(`[aria-labelledby="${id}"]`) as HTMLElement;
  const radio = (text: RegExp) =>
    [...(dialog()?.querySelectorAll('[role="radio"]') ?? [])].find((r) =>
      text.test(r.textContent ?? ""),
    ) as HTMLButtonElement | undefined;

  it("places: leading, linked under it, co-existing and the background", () => {
    const mal = MAL();
    const ana = ANA();
    const p = payload([mal, ana, PNEU()]);
    p.relations = [rel(ana, mal)];
    p.background = [T1];
    mount(p);
    const box = host.querySelector('section[aria-label="Linked to Malaria, severe"]')!;
    expect(box.textContent).toMatch(/Anaemia(Anaemia severity.*)?· secondary to Malaria, severe/);
    const also = section("impression-also");
    expect(also.querySelector("h3")?.textContent).toBe("Also this visit: co-existing");
    expect(also.textContent).toContain("Pneumonia");
    expect(also.textContent).not.toContain("Anaemia");
    const bg = section("impression-background");
    expect(bg.textContent).toMatch(/Type 1 diabetes\s*On record since 2019\s*Active this visit/);
  });

  it("shows a relation once, from the higher side: a clause on the effect, a child under the cause", () => {
    const dka = dxRow("dx.dka", "Diabetic ketoacidosis", "primary", "provisional");
    const pneu = PNEU();
    const p = payload([dka, pneu]);
    p.background = [T1];
    p.relations = [
      rel(dka, T1, "due_to", "complication"),
      rel(dka, pneu, "due_to", "precipitated_by"),
    ];
    mount(p);
    const lead = section("impression-leading");
    expect(lead.textContent).toContain("Complication of known Type 1 diabetes");
    expect(lead.textContent).toContain("Precipitated by Pneumonia");
    // The cause stays co-existing and does not repeat the arrow.
    const also = section("impression-also");
    expect(also.textContent).toContain("Pneumonia");
    expect(also.textContent).not.toMatch(/precipitated/i);
    expect(all().match(/Precipitated by Pneumonia/g)).toHaveLength(1);
  });

  it("a catalogued drop applies at once, says so inline, and Undo retires it", async () => {
    const mal = MAL();
    const ana = ANA();
    mount(payload([mal, ana]));
    keyDrop("Anaemia", /link under Malaria, severe, as secondary to/);
    await act(async () => {});
    expect(calls.find((c) => c.name === "onRelate")?.args[0]).toMatchObject({
      conditionId: ana.logicalId,
      relatedConditionId: mal.logicalId,
      relationType: "due_to",
      label: "secondary",
      catalogueRef: expect.stringContaining("dx.anaemia<-dx.malaria_severe"),
    });
    expect(status()).toBe("Anaemia linked to Malaria, severe, as secondary to. Undo available.");
    expect(all()).toContain("Linked as: secondary to Malaria, severe");
    expect(
      host.querySelector('section[aria-label="Linked to Malaria, severe"]')?.textContent,
    ).toContain("Anaemia");
    tap(button("Undo"));
    expect(calls.find((c) => c.name === "onUnlink")?.args[1]).toBe("undone");
    expect(dialog()).toBeNull();
  });

  it("the reverse direction opens the chooser with 'Did you mean …?' first", () => {
    const mal = { ...MAL(), rank: "secondary" as const };
    const ana = ANA();
    mount(payload([DM2(), mal, ana]));
    keyDrop("Malaria, severe", /Drop to link to Anaemia: you choose how/);
    expect(dialog()?.textContent).toContain("How does Malaria, severe relate to Anaemia?");
    const first = dialog()!.querySelector('[role="radio"]')!;
    expect(first.textContent).toBe("Did you mean: Anaemia secondary to Malaria, severe?");
    expect(first.getAttribute("aria-checked")).toBe("false");
    tap(first);
    tap(button("Link", dialog()!));
    expect(calls.find((c) => c.name === "onRelate")?.args[0]).toMatchObject({
      conditionId: ana.logicalId,
      relatedConditionId: mal.logicalId,
      label: "secondary",
    });
  });

  it("a direction-ambiguous pair always asks, with nothing chosen", () => {
    const hf = dxRow("dx.heart_failure", "Heart failure", "secondary", "provisional");
    const af = dxRow("dx.af", "Atrial fibrillation", "secondary", "provisional");
    mount(payload([DM2(), hf, af]));
    keyDrop("Heart failure", /Drop to link to Atrial fibrillation: you choose how/);
    expect(dialog()?.textContent).toContain("both ways round");
    const radios = [...dialog()!.querySelectorAll('[role="radio"]')];
    expect(radios.every((r) => r.getAttribute("aria-checked") === "false")).toBe(true);
    expect((button("Link", dialog()!) as HTMLButtonElement).disabled).toBe(true);
  });

  it("an uncatalogued pair opens the chooser with no preselection; Leave unrelated changes nothing", () => {
    const a = { ...dxRow("dx.x", "Back pain", "secondary", "provisional"), termId: null };
    const b2 = { ...dxRow("dx.y", "Insomnia", "secondary", "provisional"), termId: null };
    mount(payload([DM2(), a, b2]));
    keyDrop("Back pain", /Drop to link to Insomnia: you choose how/);
    const texts = [...dialog()!.querySelectorAll('[role="radio"]')].map((r) => r.textContent);
    expect(texts).toEqual([
      "Back pain is secondary to Insomnia",
      "Back pain is a complication of Insomnia",
      "Back pain was precipitated by Insomnia",
      "Back pain is associated with (not a cause) Insomnia",
    ]);
    expect(texts.some((t) => /Did you mean/.test(t ?? ""))).toBe(false);
    tap(button("Leave unrelated (co-existing)", dialog()!));
    expect(calls.some((c) => c.name === "onRelate")).toBe(false);
  });

  it("'Relate to…' lists targets with the catalogue's suggestion and preselects it", () => {
    const mal = MAL();
    const ana = ANA();
    mount(payload([mal, ana]));
    const card = [...section("impression-also").querySelectorAll("li")].find((l) =>
      l.textContent?.includes("Anaemia"),
    )!;
    tap(button("Relate to…", card));
    const target = [...dialog()!.querySelectorAll("li button")].find((b) =>
      b.textContent?.startsWith("Malaria, severe"),
    )!;
    expect(target.textContent).toContain("Suggested: secondary to");
    tap(target);
    expect(radio(/is secondary to/)?.getAttribute("aria-checked")).toBe("true");
    tap(button("Link", dialog()!));
    expect(calls.find((c) => c.name === "onRelate")?.args[0]).toMatchObject({
      conditionId: ana.logicalId,
      label: "secondary",
    });
  });

  it("unlinks by its button and by a drop on the co-existing header", () => {
    const mal = MAL();
    const ana = ANA();
    const p = payload([mal, ana]);
    const e = rel(ana, mal);
    p.relations = [e];
    mount(p);
    tap(labelled("Unlink Anaemia"));
    expect(calls.find((c) => c.name === "onUnlink")?.args).toEqual([e.id, "unlinked"]);
    expect(section("impression-also").textContent).toContain("Anaemia");
    expect(all()).toContain("Unlinked from Malaria, severe");
    calls = [];
    act(() => root.unmount());
    root = createRoot(host);
    const p2 = payload([mal, ana]);
    p2.relations = [e];
    mount(p2);
    keyDrop("Anaemia", /Drop to unlink Anaemia: it becomes co-existing/);
    expect(calls.find((c) => c.name === "onUnlink")?.args).toEqual([e.id, "unlinked"]);
  });

  it("refuses a drop on a differential, in words", () => {
    const sep = SEPSIS();
    mount(payload([DIABETES(), PNEU(), sep]));
    const g = grip("Pneumonia");
    key(g, " ");
    // The keyboard offers no differential; a pointer drop on one says why.
    const row = host.querySelector(`[data-drop="dx:${sep.logicalId}"]`)!;
    document.elementFromPoint = () => row;
    key(g, "Escape");
    act(() => {
      g.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          clientX: 0,
          clientY: 0,
          pointerType: "mouse",
        }),
      );
    });
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 30, clientY: 30 }));
    });
    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { clientX: 30, clientY: 30 }));
    });
    expect(status()).toBe("Drop refused: Sepsis is a differential. Promote it first.");
    expect(calls.some((c) => c.name === "onRelate")).toBe(false);
  });

  it("a background chip: 'Active this visit' by its button, or dropped on the co-existing header", () => {
    const p = payload([MAL(), PNEU()]);
    p.background = [T1];
    mount(p);
    tap(button("Active this visit", section("impression-background")));
    expect(calls.find((c) => c.name === "onActiveThisVisit")?.args).toEqual([
      "Type 1 diabetes",
      "secondary",
    ]);
    calls = [];
    keyDrop("Type 1 diabetes", /Drop to make Type 1 diabetes active this visit/);
    expect(calls.find((c) => c.name === "onActiveThisVisit")).toBeTruthy();
  });

  it("demotion to the differential names the links, and retires them on confirm", () => {
    const mal = MAL();
    const ana = ANA();
    const p = payload([mal, ana]);
    p.relations = [rel(ana, mal)];
    mount(p);
    tap(button("Move to differential"));
    expect(dialog()?.textContent).toContain("Anaemia, secondary to Malaria, severe");
    expect(calls.some((c) => c.name === "onToDifferential")).toBe(false);
    tap(button("Retire the links and move", dialog()!));
    expect(calls.find((c) => c.name === "onToDifferential")?.args).toEqual([
      "Malaria, severe",
      { retireLinks: true },
    ]);
  });

  it("swaps a co-existing diagnosis with the leading one in one action, no confirm", () => {
    const mal = MAL();
    const ana = ANA();
    const p = payload([mal, ana, PNEU()]);
    p.relations = [rel(ana, mal)];
    mount(p);
    const card = [...section("impression-also").querySelectorAll("li")].find((l) =>
      l.textContent?.includes("Pneumonia"),
    )!;
    tap(button("Make leading", card));
    expect(calls.find((c) => c.name === "onLeading")?.args).toEqual(["Pneumonia", undefined]);
    expect(dialog()).toBeNull();
  });

  it("a restricted end the viewer cannot see drops out with its clause, and no placeholder", () => {
    const ana = { ...ANA(), rank: "primary" as const };
    const hiv = { ...dxRow("dx.hiv", "HIV infection", "secondary", "confirmed"), restricted: true };
    const p = payload([ana, hiv]);
    p.clerking!.canSeeRestricted = false;
    p.relations = [{ ...rel(ana, hiv), restricted: true }];
    mount(p);
    expect(all()).not.toMatch(/HIV/);
    expect(section("impression-leading").textContent).not.toMatch(/secondary to|cannot view/i);
    expect(host.querySelector('[data-block="impression"]')?.textContent).not.toMatch(
      /HIV|secondary to/,
    );
  });

  it("'Cause removed: review' holds signing until it is acknowledged", () => {
    const ana = { ...ANA(), rank: "primary" as const };
    const p = payload([ana]);
    p.causeRemoved = [
      {
        logicalId: "rel-1",
        conditionId: ana.logicalId,
        causeDisplay: "Malaria, severe",
        label: "secondary",
        reason: "refuted",
      },
    ];
    mount(p);
    expect(section("impression-leading").textContent).toContain("Cause removed: review");
    expect(all()).toContain("Its cause, Malaria, severe, was ruled out; the link was retired.");
    expect(signButton().disabled).toBe(true);
    expect(stepStatus()).toContain("Review needed");
    tap(button("Reviewed"));
    expect(draft().reviewed).toEqual(["rel-1"]);
    expect(all()).not.toContain("Cause removed: review");
    expect(signButton().disabled).toBe(false);
  });

  it("writes the note in the design's order: leading, its links, co-existing, known conditions", () => {
    const mal = MAL();
    const ana = ANA();
    const p = payload([mal, ana, PNEU()]);
    p.relations = [rel(ana, mal)];
    p.background = [T1];
    mount(p);
    const text = host.querySelector('[data-block="impression"]')?.textContent ?? "";
    const at = (s: string) => text.indexOf(s);
    expect(at("Malaria, severe (primary; final)")).toBeGreaterThan(-1);
    // A stage not yet computable stays on the desk, never in the note (CSO, 2026-10-09).
    expect(text).not.toContain("not yet known (needs");
    expect(at("(working), secondary to malaria, severe.")).toBeGreaterThan(
      at("Malaria, severe (primary"),
    );
    expect(at("Also this visit, co-existing: Pneumonia (")).toBeGreaterThan(at("Anaemia"));
    expect(at("Known conditions: type 1 diabetes (on record since 2019).")).toBeGreaterThan(
      at("Pneumonia"),
    );
  });

  it("offers the earlier format's links once: Confirm writes them as backfill_confirmed", () => {
    const dm = DM2();
    const ret = dxRow(
      "dx.diabetic_retinopathy",
      "Diabetic retinopathy",
      "secondary",
      "provisional",
    );
    const p = payload([dm, ret]);
    p.draft!.content = {
      ...p.draft!.content,
      impression: { meta: { [dm.logicalId]: { with: ["dx.diabetic_retinopathy"] } } },
    } as NoteContent;
    mount(p);
    const row = section("impression-backfill");
    expect(row.textContent).toContain("Diabetic retinopathy, complication of Type 2 diabetes");
    tap(button("Confirm", row));
    expect(calls.find((c) => c.name === "onRelate")?.args[0]).toMatchObject({
      conditionId: ret.logicalId,
      relatedConditionId: dm.logicalId,
      relationType: "due_to",
      label: "complication",
      origin: "backfill_confirmed",
    });
    expect(draft().backfill).toBe("done");
    expect(section("impression-backfill")).toBeNull();
  });

  /* ─── Refinement (dx-relations Phase 4, ADR 0220) ─────────────── */

  it("Refine or replace…: subtypes with their deciding tests; the clinician picks; Replace needs a reason", () => {
    const acs = dxRow("dx.acs", "Acute coronary syndrome", "primary", "provisional");
    mount(payload([acs]));
    const lead = section("impression-leading");
    expect(lead.textContent).toMatch(/Type to be decided by: .*\(not ordered\)/);
    tap(button("Refine or replace…", lead));
    const nste = DX_NAMES["dx.nste_acs"]!.display;
    tap(button(`Refine to ${nste}`, dialog()!));
    expect(calls.find((c) => c.name === "onRefine")?.args).toEqual([
      "Acute coronary syndrome",
      { dxId: "dx.nste_acs" },
      [],
    ]);
    expect(dialog()).toBeNull();
    tap(button("Refine or replace…", lead));
    tap(button(DX_NAMES["dx.pericarditis"]!.display, dialog()!));
    const go = button(/^Replace with /, dialog()!) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    type(dialog()!.querySelector("#replace-reason") as HTMLInputElement, "widespread ST elevation");
    tap(go);
    expect(calls.find((c) => c.name === "onReplace")?.args).toEqual([
      "Acute coronary syndrome",
      { dxId: "dx.pericarditis" },
      "widespread ST elevation",
    ]);
  });

  it("a refined diagnosis says what it was refined from, and the note writes it", () => {
    const n = {
      ...dxRow("dx.nstemi", "Non-ST-elevation myocardial infarction", "primary", "provisional"),
      refinedFrom: {
        display: "Acute coronary syndrome",
        termId: dxTermUuid("dx.acs"),
        decided: ["ECG", "Troponin"],
      },
    };
    mount(payload([n]));
    expect(section("impression-leading").textContent).toContain(
      "Refined from Acute coronary syndrome after ECG and Troponin",
    );
    expect(host.querySelector('[data-block="impression"]')?.textContent).toContain(
      "(refined from acute coronary syndrome after ECG and troponin)",
    );
  });

  it("a placeholder with its cause linked offers 'Refine … into Anaemia'; Keep it declines", () => {
    const mal = MAL();
    const ph = dxRow(
      "dx.anaemia_unexplained",
      "Anaemia, cause not yet known",
      "secondary",
      "provisional",
    );
    const p = payload([mal, ph]);
    p.relations = [rel(ph, mal)];
    mount(p);
    const offer = button("Refine 'Anaemia, cause not yet known' into Anaemia")!;
    tap(offer);
    expect(calls.find((c) => c.name === "onRefine")?.args).toEqual([
      "Anaemia, cause not yet known",
      { dxId: "dx.anaemia" },
      [],
    ]);
    tap(button("Keep it"));
    expect(draft().meta[ph.logicalId]?.keep).toBe(true);
    expect(button(/^Refine 'Anaemia/)).toBeUndefined();
  });

  it("the risk-factor line: Include in note links each condition and writes the line; off retires", () => {
    const acs = dxRow("dx.acs", "Acute coronary syndrome", "primary", "provisional");
    const p = payload([acs]);
    const dm = {
      ...T1,
      logicalId: uuid(),
      termId: dxTermUuid("dx.dm_type2"),
      display: "Type 2 diabetes",
    };
    p.background = [dm];
    mount(p);
    const lead = section("impression-leading");
    expect(lead.textContent).toContain("Risk factors on record: type 2 diabetes.");
    const box = lead.querySelector('input[type="checkbox"]') as HTMLInputElement;
    const note = () => host.querySelector('[data-block="impression"]')?.textContent ?? "";
    expect(note()).not.toContain("Risk factors on record");
    tap(box);
    expect(calls.find((c) => c.name === "onRelate")?.args[0]).toMatchObject({
      conditionId: dm.logicalId,
      relatedConditionId: acs.logicalId,
      relationType: "risk_factor_for",
      label: null,
    });
    expect(draft().meta[acs.logicalId]?.risk).toBe(true);
    expect(note()).toContain("Risk factors on record: type 2 diabetes.");
    tap(section("impression-leading").querySelector('input[type="checkbox"]'));
    expect(calls.find((c) => c.name === "onUnlink")).toBeTruthy();
    expect(note()).not.toContain("Risk factors on record");
  });

  it("linked lists collapse after three: 'Show 1 more'", () => {
    const mal = MAL();
    const kids = [
      ANA(),
      dxRow("dx.aki", "Acute kidney injury", "secondary", "provisional"),
      PNEU(),
      dxRow("dx.sepsis", "Sepsis", "secondary", "provisional"),
    ];
    const p = payload([mal, ...kids]);
    p.relations = kids.map((k, i) => rel(k, mal, "due_to", "secondary", i + 1));
    mount(p);
    const box = () => host.querySelector('section[aria-label="Linked to Malaria, severe"]')!;
    expect(box().textContent).not.toContain("Sepsis");
    tap(button("Show 1 more", box()));
    expect(box().textContent).toContain("Sepsis");
    expect(button("Show fewer", box())).toBeTruthy();
  });
});
