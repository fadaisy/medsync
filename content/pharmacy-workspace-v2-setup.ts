/**
 * Pharmacy Workspace v2, Set-up (board Setup). Shares `PHWS2_COPY_STATUS` (draft) in content/pharmacy-workspace-v2.ts;
 * the CSO signs. Law 4: no role words. The board's "sign clinical content" permission does not exist; who signs is
 * the coded rule (lib/pharmacy/stores/packs.ts `signPack`).
 */
export const PHWS2_SETUP = {
  tabsLabel: "Set-up views",
  goLive: "Going live",
  packs: {
    explainer:
      "A signed pack is content a named person has checked and signed for this hospital. MedSync only acts on what is signed. Each row says what stays switched off until it is.",
    title: "Signed packs",
    count: "{signed} of {total} signed",
    columns: { pack: "Pack", state: "State", missing: "While it is missing", action: "Action" },
    signed: "Signed",
    draft: "Draft waiting",
    none: "Not signed",
    version: "Version {v}",
    versionOn: "Version {v}, {date}",
    draftToo: "A new draft, version {v}, is waiting",
    nothingBlocked: "Nothing blocked.",
    signers: "Signed by {first}",
    whoTitle: "Who signs",
    who: "The pharmacy in charge writes and signs each set of rules. One tap puts it in force; their name and the date stay with the version.",
  },
  goingLive: {
    title: "Going live",
    lead: "Each dispensing point you work at, and whether MedSync is live there. Switching a point on or off is done by the hospital admin.",
    columns: { point: "Point", state: "State" },
    live: "Live since {date}",
    notLive: "Not live",
    switchedOff: "Switched off on {date}",
    none: "You work at no dispensing point.",
  },
} as const;
