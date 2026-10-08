// @vitest-environment jsdom
import type { ImpressionHandlers } from "@/components/clerking/impression/impression-step";
import type { DeskDiagnosis, DeskPayload } from "@/components/emr/desk/model";
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

function Harness({ p, offer }: { p: DeskPayload; offer?: string }) {
  const [content, setContent] = useState(p.draft!.content);
  const [diagnoses, setDiagnoses] = useState(p.diagnoses);
  const payloadNow = useMemo(() => ({ ...p, diagnoses }), [p, diagnoses]);
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
    onLeading: (row) => log("onLeading", row.dx.display),
    onToDifferential: (row) => log("onToDifferential", row.dx.display),
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
      /Sepsis \(must not miss\), unlikely \(no source found\)/,
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

  it("lists a diagnosis's complications and what goes with it, and adds one linked (associations)", () => {
    mount(payload([DM2()]));
    expect(all()).toContain("Associated with Type 2 diabetes");
    expect(all()).toMatch(/Diabetic retinopathy[^]*complication/);
    expect(all()).toMatch(/Hypertension[^]*goes with it/);
    expect(all()).toContain("Check for:");
    const row = [...host.querySelectorAll("li")].find((l) =>
      l.textContent?.startsWith("Hypertension"),
    )!;
    tap(button("Add", row));
    expect(calls.find((c) => c.name === "onDiagnosis")?.args[1]).toMatchObject({
      verification: "provisional",
      primary: false,
    });
    const lead = Object.entries(draft().meta ?? {}).find(([, m]) => m.with?.length);
    expect(lead?.[1].with).toEqual(["dx.hypertension"]);
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
