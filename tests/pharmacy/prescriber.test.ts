/**
 * The prescriber's side (Pharmacy Phase 1 Step 5): the view built from the record (pure), that no
 * prescriber read or write touches stock (AV-6, PA2-5), and that the doctor's printed prescription is
 * unchanged except the print-event hook (D-PH1-49).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PatientPharmacy, QueryRow } from "@/lib/pharmacy/review/prescriber-read";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PrintRecord } from "@/app/doctor/encounters/[encounterId]/print/prescription/_components/print-record";
import {
  DRAFT_KEEP_REASONS,
  DRAFT_NOT_SUPPLIED_REASONS,
  DRAFT_QUERY_TYPES,
} from "@/content/pharmacy-prescriber";
import { buildView } from "@/lib/pharmacy/review/prescriber-read";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));

const root = resolve(__dirname, "../..");
const src = (p: string) => readFileSync(resolve(root, p), "utf8");

describe("the prescriber never reads stock (AV-6, PA2-5)", () => {
  const files = [
    "lib/pharmacy/review/prescriber-read.ts",
    "lib/emr/write/pharmacy-answers.ts",
    "lib/emr/actions/pharmacy-queries.ts",
    "components/clerking/plan/pharmacy.tsx",
  ];
  it.each(files)("%s names no batch, movement, product or count table", (f) => {
    expect(src(f)).not.toMatch(
      /pharmacyBatches|pharmacyStockMovements|pharmacyProducts|pharmacyProductPoints|pharmacyCounts|pharmacyStockouts|pharmacy_batches|pharmacy_stock_movements|pharmacy_products|pharmacy_counts|pharmacy_stockouts|pharmacy\/stock/,
    );
  });
});

describe("D-PH1-49: the printed prescription does not change", () => {
  const PAGE = "app/doctor/encounters/[encounterId]/print/prescription/page.tsx";
  /** The page as it was before the hook (HEAD at Step 5), by its hash. */
  const BEFORE = "954412be7b5b12002d611c4ad8d8e03ceb2b6015d5b1f6bb36979c21af9d822d";

  it("is the same page once the print-event hook is taken out", () => {
    const stripped = src(PAGE)
      .replace('import { pharmacyDispensingLiveFor } from "@/lib/pharmacy/feature";\n', "")
      .replace('import { PrintRecord } from "./_components/print-record";\n', "")
      // Pharmacy Phase 4: the repeats line renders nothing unless PHARMACY_REPEATS is on and the line has repeats.
      .replace('import { RepeatsPrint } from "./_components/repeats-print";\n', "")
      .replace(/\n {16}<RepeatsPrint[\s\S]*?\/>/, "")
      .replace(
        /\n {6}\{kept\.length && pharmacyDispensingLiveFor\(actor\.hospitalId\) \? \([\s\S]*?\n {6}\) : null\}/,
        "",
      );
    expect(createHash("sha256").update(stripped).digest("hex")).toBe(BEFORE);
  });

  it("the hook renders nothing on the page", () => {
    expect(
      renderToStaticMarkup(
        createElement(PrintRecord, {
          patientUserId: "p",
          encounterId: "e",
          prescriptionIds: ["a", "b"],
        }),
      ),
    ).toBe("");
  });
});

describe("buildView (5.4)", () => {
  const t = (min: number) => new Date(Date.UTC(2026, 9, 12, 7, min));
  const line = (id: string, encounterId: string, placementId = `pl-${id}`) => ({
    id,
    encounterId,
    placementId,
    drugId: "fixture_tablet",
    drugName: `Fixture tablet ${id}`,
    dose: "[fixture dose]",
    route: "oral",
    frequency: "[fixture frequency]",
    duration: null,
    conditionId: null,
    state: "active" as const,
    createdAt: t(0),
    updatedAt: t(0),
  });
  const query = (id: string, rx: string, o: Partial<QueryRow> = {}): QueryRow => ({
    id,
    scope: "line",
    prescriptionId: rx,
    placementId: null,
    typeCode: "dose",
    proposal: "Fixture proposal",
    patientWaiting: false,
    dispensingPointId: "point",
    senderCadre: "PHARMACIST",
    createdAt: t(1),
    events: [],
    ...o,
  });
  const ev = (
    kind: QueryRow["events"][number]["kind"],
    o: Partial<QueryRow["events"][number]> = {},
  ) => ({
    id: `${kind}-${Math.random()}`,
    kind,
    at: t(5),
    answer: null,
    via: null,
    answerReasonCode: null,
    answeredByUserId: null,
    recipientUserId: null,
    recipientRole: null,
    replacedBy: null,
    actorUserId: "pharm",
    clientKey: null,
    ...o,
  });
  const data = (queries: QueryRow[], lines: ReturnType<typeof line>[]): PatientPharmacy => ({
    queries,
    lines: new Map(lines.map((l) => [l.id, l])),
    lineEvents: new Map(),
    cancellations: new Map(),
    cosign: new Map(),
    acknowledged: new Set(),
  });
  const view = (d: PatientPharmacy) =>
    buildView(d, {
      surface: "doctor",
      viewerUserId: "me",
      patientUserId: "pt",
      encounterId: "this",
      now: t(7),
      keep: { items: DRAFT_KEEP_REASONS, signed: false },
      words: {
        cadreName: () => "Pharmacist",
        answererCadre: () => "Medical officer",
        phone: () => null,
        queryTypes: DRAFT_QUERY_TYPES,
        outcomeReasons: DRAFT_NOT_SUPPLIED_REASONS,
      },
    });

  it("an open query: B-26 verbatim, minutes waiting by the server clock, counted, announced", () => {
    const v = view(data([query("q1", "a", { events: [ev("notified")] })], [line("a", "this")]));
    expect(v.items).toHaveLength(1);
    const i = v.items[0]!;
    expect(i.kind === "query" && i.words).toBe(
      'From the pharmacy (Pharmacist), 10:01 · Dose unclear or unusual. "Fixture proposal"',
    );
    expect(i.kind === "query" && i.waitingMin).toBe(6);
    expect(i.kind === "query" && i.state).toBe("open");
    expect(v.count).toBe(1);
    expect(v.announce?.id).toBe("q1");
    expect(v.lineStatus.a).toEqual({ kind: "stage", stage: "queried" });
  });

  it("an answered query shows at its own visit only; an open one at any visit", () => {
    const answered = query("q1", "a", {
      events: [
        ev("notified"),
        ev("answered", { answer: "keep", via: "app", answeredByUserId: "x" }),
      ],
    });
    const earlier = view(
      data([answered, query("q2", "b")], [line("a", "earlier"), line("b", "earlier")]),
    );
    expect(earlier.items.map((i) => i.id)).toEqual(["q2"]);
    const own = view(data([answered], [line("a", "this")]));
    expect(own.items[0]!.kind === "query" && own.items[0]!.outcome).toBe(
      "Answered by Medical officer at 10:05: Keep it as written.",
    );
    expect(own.count).toBe(0);
  });

  it("a phone keep logged in my name can be disputed from any visit (B-25)", () => {
    const phone = query("q1", "a", {
      events: [ev("answered", { answer: "keep", via: "phone", answeredByUserId: "me" })],
    });
    const v = view(data([phone], [line("a", "earlier")]));
    expect(v.items[0]!.kind === "query" && v.items[0]!.phoneAnswerAt).toBe("10:05");
  });

  it("a not-supplied outcome is a notice; it needs no answer and goes once acknowledged", () => {
    const owed = {
      id: "e1",
      kind: "owed" as const,
      occurredAt: t(1),
      effectiveAt: t(1),
      lane: "standard" as const,
      quantitySupplied: null,
      quantityNotSupplied: null,
      reasonCode: "out_point",
      handoverId: null,
      actorCadre: "PHARMACIST",
      patientTold: "Told to come back",
      pointId: "point",
    };
    const d = data([], [line("a", "this")]);
    d.lineEvents.set("a", [owed]);
    const v = view(d);
    const n = v.items[0]!;
    expect(n.kind).toBe("not_supplied");
    expect(n.words).toBe(
      "From the pharmacy, 10:01. Fixture tablet a was not supplied: Out of stock at this dispensing point. Told to come back.",
    );
    expect(n.kind === "not_supplied" && n.canAcknowledge).toBe(true);
    expect(v.count).toBe(1);
    expect(v.lineStatus.a).toEqual({
      kind: "open",
      outcome: "owed",
      supplied: 0,
      notSupplied: null,
    });
    // Acknowledged (0132), with no query anywhere, it goes.
    const gone = data([], [line("a", "this")]);
    gone.lineEvents.set("a", [owed]);
    gone.acknowledged.add(owed.id);
    expect(view(gone).items.filter((i) => i.kind === "not_supplied")).toEqual([]);
  });
});
