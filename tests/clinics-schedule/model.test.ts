import type { Change, Session } from "@/lib/clinics-schedule/model";
import { describe, expect, it } from "vitest";

import { CLINIC_PALETTE } from "@/content/clinics-schedule/palette";
import { fixtureData } from "@/lib/clinics-schedule/fixture";
import {
  applyChanges,
  bulkEdits,
  cardIdentity,
  clashes,
  clashPairs,
  clinicFee,
  colourCheck,
  edit,
  feeFor,
  impactOf,
  nearestFree,
  peopleFilter,
  personWeek,
  publishBlockers,
  readiness,
  restoreEdits,
  templateEdits,
  undoFrom,
} from "@/lib/clinics-schedule/model";
import { opsForChanges } from "@/lib/clinics-schedule/ops";

const D = fixtureData("ready");
const S = D.published;
const HOURS = D.hours!;
let n = 0;
const ch = (summary: string, edits: Change["edits"]): Change => ({
  id: `ch-${++n}`,
  summary,
  author: "u-admin",
  at: "2026-11-12T08:00:00Z",
  edits,
});

describe("drafts (S3, CS3)", () => {
  it("the draft view never touches the published records", () => {
    const x = Object.values(S.sessions)[0]!;
    const c = ch("move", [
      edit(S, "sessions", x.id, { ...x, start: x.start + 60, end: x.end + 60 }),
    ]);
    const view = applyChanges(S, [c]);
    expect(view.sessions[x.id]!.start).toBe(x.start + 60);
    expect(S.sessions[x.id]!.start).toBe(x.start);
  });

  it("undo takes the change and every later one, leaving the earlier list exactly", () => {
    const list = [ch("a", []), ch("b", []), ch("c", [])];
    const { kept, removed } = undoFrom(list, list[1]!.id);
    expect(kept.map((c) => c.summary)).toEqual(["a"]);
    expect(removed.map((c) => c.summary)).toEqual(["b", "c"]);
  });
});

describe("restore (S25)", () => {
  it("puts every record back to its first before", () => {
    const x = Object.values(S.sessions)[0]!;
    const a = ch("a", [edit(S, "sessions", x.id, { ...x, places: 5 })]);
    const v1 = applyChanges(S, [a]);
    const b = ch("b", [edit(v1, "sessions", x.id, { ...v1.sessions[x.id]!, places: 9 })]);
    const v2 = applyChanges(v1, [b]);
    const back = applyChanges(v2, [ch("r", restoreEdits(v2, [a, b]))]);
    expect(back.sessions[x.id]).toEqual(x);
  });
});

describe("clashes (S10, S14)", () => {
  const list = clashes(S);
  it("finds the seeded Room 7 clash on Tuesday and Friday, as one pair", () => {
    expect(list.map((c) => c.weekday).sort()).toEqual([2, 5]);
    const pairs = clashPairs(list);
    expect(pairs).toHaveLength(1);
    expect([pairs[0]!.a, pairs[0]!.b].sort()).toEqual(["c-dm", "c-htn"]);
  });
  it("blocks publish until fixed, and the nearest free time fixes it", () => {
    expect(publishBlockers(S, S).some((b) => b.kind === "clash")).toBe(true);
    const k = list[0]!;
    const t = nearestFree(S, k.b, HOURS);
    expect(t).not.toBeNull();
    const moved: Session = { ...k.b, start: t!, end: t! + (k.b.end - k.b.start) };
    const view = applyChanges(S, [ch("fix", [edit(S, "sessions", moved.id, moved)])]);
    expect(clashes(view).some((c) => c.weekday === k.weekday)).toBe(false);
  });
});

describe("readiness (S7, X1)", () => {
  it("a clinic with no sessions needs setup", () => {
    expect(readiness(S, "c-kid").status).toBe("setup");
  });
  it("a department that is not live blocks the clinic", () => {
    const r = readiness(S, "c-opd", () => false);
    expect(r.blockers.map((b) => b.k)).toContain("dept");
  });
});

describe("fees (S11, CS9)", () => {
  const c = Object.values(S.clinics).find((x) => x.feeMode === "band")!;
  it("a clinic override beats the hospital band", () => {
    const own = { ...c, feeOverrides: { mo: { gen: 1234 } } };
    expect(feeFor(own, "mo", false, S.bands)).toBe(1234);
    expect(feeFor(c, "mo", false, S.bands)).toBe(S.bands.mo!.general);
  });
  it("free is zero, unset is null", () => {
    expect(clinicFee({ ...c, feeMode: "free" }, S)).toEqual({ min: 0, max: 0 });
    expect(feeFor({ ...c, feeMode: null }, "mo", false, S.bands)).toBeNull();
  });
});

describe("colour (S9, CS5)", () => {
  it("every palette colour passes the check", () => {
    for (const hex of CLINIC_PALETTE) expect(colourCheck(hex).ok, hex).toBe(true);
  });
  it("refuses red and colours too light to read", () => {
    expect(colourCheck("#E00000").why).toBe("red");
    expect(colourCheck("#F5F5F5").ok).toBe(false);
  });
});

describe("consent (S13, CS8)", () => {
  const p = Object.values(S.people)[0]!;
  it("no name or photo on cards without written consent", () => {
    expect(
      cardIdentity({ ...p, showName: true, showPhoto: true, consentOn: null, consentBy: null }),
    ).toMatchObject({ name: null, photo: false });
  });
  it("the name shows once consent is on file and the switch is on", () => {
    expect(
      cardIdentity({ ...p, showName: true, consentOn: "2026-11-12", consentBy: "u-admin" }).name,
    ).toBe(p.name);
  });
});

describe("bulk change (S15)", () => {
  it("keeps every moved session inside opening hours", () => {
    const ids = Object.keys(S.clinics);
    const out = bulkEdits(
      S,
      { clinicIds: ids, days: [1, 2, 3, 4, 5], act: "time", amt: 600 },
      HOURS,
    );
    for (const e of out) expect((e.after as Session).end).toBeLessThanOrEqual(HOURS.close);
  });
});

describe("templates (S8)", () => {
  it("only fills clinics that have no sessions", () => {
    const busy = new Set(Object.values(S.sessions).map((x) => x.clinicId));
    const codes = Object.values(S.clinics)
      .map((c) => c.code)
      .filter((x): x is string => !!x);
    const out = templateEdits(
      S,
      codes.map((code) => ({ code, days: [1], start: 540, end: 660 })),
      () => `t-${++n}`,
    );
    for (const e of out) expect(busy.has((e.after as Session).clinicId)).toBe(false);
  });
});

describe("people (S20)", () => {
  it("needs attention lists double-booked people", () => {
    const attn = peopleFilter(S, "attn", new Set()).map((p) => p.id);
    expect(attn).toContain("p-okello");
    expect(personWeek(S, "p-okello").double.length).toBeGreaterThan(0);
  });
});

describe("impact (S24, P5)", () => {
  it("removing a booked session counts everyone booked on it", () => {
    const [id, booked] = Object.entries(D.booked).find(([, b]) => b > 0)!;
    const r = impactOf(S, ch("rm", [edit(S, "sessions", id, null)]), D.booked, 0);
    expect(r.booked).toBe(booked);
    expect(r.texts).toBe(booked);
  });
});

describe("ops (P4)", () => {
  const ctx = { actor: "u-admin", today: D.today, view: S, newId: () => `id-${++n}` };
  it("a removed session is stopped, never deleted", () => {
    const x = Object.values(S.sessions)[0]!;
    const ops = opsForChanges([edit(S, "sessions", x.id, null)], ctx);
    expect(ops).toEqual([
      {
        t: "session_templates",
        op: "update",
        id: x.id,
        v: { active: false, valid_until: D.today },
      },
    ]);
  });
  it("people are never created here (D-CS-09)", () => {
    const p = Object.values(S.people)[0]!;
    expect(
      opsForChanges(
        [{ entity: "people", key: "new", before: null, after: { ...p, id: "new" } }],
        ctx,
      ),
    ).toEqual([]);
  });
});
