import type { ConfigDraftRow } from "@/lib/lab/setup-hub";
import { describe, expect, it } from "vitest";

import {
  hubGroups,
  keyWords,
  manyStatus,
  signatureQueue,
  singleStatus,
  tally,
} from "@/lib/lab/setup-hub";

const ME = "u-me";
const OTHER = "u-other";
let n = 0;
const row = (p: Partial<ConfigDraftRow>): ConfigDraftRow => ({
  id: `c${++n}`,
  kind: "delta_rule",
  key: "DC-K-1",
  version: 1,
  status: "draft",
  authoredBy: OTHER,
  authorName: "Other",
  leadSignedBy: null,
  leadName: null,
  csoSignedBy: null,
  createdAt: new Date(2026, 9, n),
  leadSignedAt: null,
  ...p,
});

describe("Set-up hub signature queue (S32)", () => {
  it("lists only drafts whose lead slot (or lab_counter slot) the viewer may sign, never their own", () => {
    const leadSlot = row({});
    const own = row({ authoredBy: ME });
    const dpLead = row({ kind: "partner_legal" });
    const ipcLead = row({ kind: "referral_wording" });
    const counter = row({ kind: "ipc_alert_entry", leadSignedBy: OTHER });
    const counterOwnLead = row({ kind: "ipc_alert_entry", authoredBy: "u-3", leadSignedBy: ME });
    const counterOwnDraft = row({ kind: "ipc_alert_entry", authoredBy: ME, leadSignedBy: OTHER });
    const cso = row({ kind: "scheme", leadSignedBy: OTHER });
    const focal = row({ kind: "hmis_mapping", leadSignedBy: OTHER });
    const signed = row({ status: "signed" });
    const countersigned = row({ kind: "scheme", leadSignedBy: OTHER, csoSignedBy: "u-cso" });

    const q = signatureQueue(
      [
        leadSlot,
        own,
        dpLead,
        ipcLead,
        counter,
        counterOwnLead,
        counterOwnDraft,
        cso,
        focal,
        signed,
        countersigned,
      ],
      ME,
    );
    expect(q.mine.map((r) => r.id)).toEqual([leadSlot.id, counter.id]);
    expect(q.mine.some((r) => r.authoredBy === ME)).toBe(false);
    // Waiting for the CSO (or the focal person): information only.
    expect(q.cso.map((r) => r.id)).toEqual([cso.id, focal.id]);
  });
});

describe("Set-up hub status words", () => {
  it("says one versioned setting and many keyed settings in words", () => {
    expect(
      singleStatus(
        tally([
          { status: "draft", leadSigned: false, n: 1, v: 4 },
          { status: "signed", leadSigned: true, n: 1, v: 3 },
        ]),
      ).text,
    ).toBe("Draft v4");
    expect(singleStatus(tally([{ status: "signed", leadSigned: true, n: 1, v: 2 }])).text).toBe(
      "Signed v2",
    );
    expect(singleStatus(tally([])).tone).toBe("not_set");
    expect(
      manyStatus(
        tally(
          [
            { kind: "scheme", status: "signed", leadSigned: true, n: 38, v: 2 },
            { kind: "scheme", status: "draft", leadSigned: false, n: 6, v: 3 },
            { kind: "qc_plan", status: "draft", leadSigned: false, n: 9, v: 1 },
          ],
          ["scheme"],
        ),
      ).text,
    ).toBe("38 signed · 6 drafts");
  });

  it("never shows a result concept id", () => {
    expect(keyWords("obs.no_such_thing:en")).toBe("a result not in the catalogue, English");
    expect(keyWords("hospital")).toBeNull();
  });

  it("shows a link only when its nav item is visible", () => {
    const facts = {
      configs: [],
      ranges: [],
      limits: [],
      response: [],
      menu: { tests: 0 },
      noUnit: 0,
      profiles: { inUse: 0, drafts: 0 },
      analysers: 2,
      partners: 0,
      connections: { live: 0, retrying: 0 },
      demoLoads: 0,
    };
    const g = hubGroups(facts, new Set(["setup_delta", "analysers"]));
    expect(g.map((x) => x.id)).toEqual(["safety", "partners"]);
    expect(g[1]!.links).toEqual([
      {
        id: "analysers",
        label: "Analyser bridge and code maps",
        href: "/lab/setup/analysers",
        status: { text: "2 analysers", tone: "neutral" },
      },
    ]);
  });
});
