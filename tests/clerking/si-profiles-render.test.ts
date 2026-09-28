// @vitest-environment jsdom
import type { DeskDiagnosis, DeskPayload } from "@/components/emr/desk/model";
import type { NoteContent } from "@/lib/emr/note-rules";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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
import { cat } from "./fixtures";
import { siPatientPayload } from "./si-desk-fixtures";

/**
 * §14 "Profiles rendering (leading, differential, also, drawer)": every one of the 272 profiles
 * renders in each place on the board and in Details, on a real patient (patient 3), with no
 * console error and its name on screen. Synthetic patient only.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
const { ClerkingDesk } = await import("@/components/clerking/clerking-desk");

const dx = {
  cat: DX_CATALOGUE,
  termIds: DX_TERM_IDS,
  names: DX_NAMES,
  tests: TEST_NAMES,
  testIds: TEST_UUIDS,
};
const IDS = DX_CATALOGUE.profiles.map((p) => p.id);
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function payload(rows: DeskDiagnosis[]): DeskPayload {
  const p = siPatientPayload("f3");
  p.clerking!.dx = {
    catalogueUrl: "/api/clerking/dx-catalogue?v=test",
    catalogueVersion: DX_CATALOGUE.version,
    signoff: DX_SIGNOFF,
  };
  p.diagnoses = rows;
  return p;
}
const row = (id: string, n: number, rank: "primary" | "secondary", verification: string) => ({
  id: uuid(n),
  logicalId: uuid(10_000 + n),
  termId: dxTermUuid(id),
  display: DX_NAMES[id]!.display,
  code: null,
  verification,
  rank,
  restricted: DX_NAMES[id]!.restricted,
  onProblemList: false,
  cosignPending: false,
});

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const errors: unknown[] = [];

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // 1024 px: the matrix exists, Details is a dialog.
  window.matchMedia = ((q: string) => {
    const min = /min-width:\s*(\d+)px/.exec(q);
    return {
      matches: min ? 1024 >= +min[1]! : false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    };
  }) as unknown as typeof window.matchMedia;
  vi.spyOn(console, "error").mockImplementation((...a) => void errors.push(a));
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterAll(() => {
  act(() => root.unmount());
  host.remove();
});

const render = (p: DeskPayload) =>
  act(() =>
    root.render(
      h(ClerkingDesk, {
        p,
        cat,
        ecat,
        dx,
        content: p.draft!.content as NoteContent,
        current: "impression",
        save: { tone: "neutral", text: "Saved" },
        actor: "u-1",
        on: { onContent() {}, onSection() {} },
        loaders: { findings: async () => [], terms: async () => [] },
      }),
    ),
  );
const text = () => host.textContent ?? "";

describe("every profile renders (§14)", () => {
  it("has a name for each of the 272", () => {
    expect(IDS).toHaveLength(272);
    expect(IDS.filter((id) => !DX_NAMES[id])).toEqual([]);
  });

  it("as the differential and as also this visit, all at once", () => {
    render(payload(IDS.map((id, n) => row(id, n + 1, "secondary", "differential"))));
    for (const id of IDS) expect(text()).toContain(DX_NAMES[id]!.display);
    expect(text()).toContain(`Differential (${IDS.length})`);
    render(payload(IDS.map((id, n) => row(id, n + 1, "secondary", "provisional"))));
    for (const id of IDS) expect(text()).toContain(DX_NAMES[id]!.display);
    expect(errors).toEqual([]);
  });

  it("as the leading diagnosis, each with its Details", () => {
    for (const [n, id] of IDS.entries()) {
      render(payload([row(id, n + 1, "primary", "provisional")]));
      const card = host.querySelector("#impression-leading")?.closest("section");
      expect(card?.textContent).toContain(DX_NAMES[id]!.display);
      const details = [...(card?.querySelectorAll("button") ?? [])].find(
        (b) => b.textContent?.trim() === "Details",
      )!;
      act(() => details.click());
      const dialog = document.querySelector('[role="dialog"]');
      expect(dialog?.textContent, id).toContain("Evidence");
      act(() =>
        (
          [...(dialog?.querySelectorAll("button") ?? [])].find(
            (b) => b.textContent?.trim() === "Done",
          ) as HTMLButtonElement
        ).click(),
      );
    }
    expect(errors).toEqual([]);
  }, 120_000);
});
