import type { LabNavId } from "./nav";

import { fill } from "@/content/lab-workspace-v2";
import { LABWS2_SETUP } from "@/content/lab-workspace-v2-setup";
import { conceptDef } from "@/lib/facts/project/shared";
import { leadSlotFor, secondSlotFor } from "./catalogue-v2";

/**
 * Set-up hub (prompt 5.8, gate-a §1 "Lead's signature queue"), the pure part. The queue is the same rule as
 * Needs you (lib/lab/needs-you-read.ts): drafts of signed configuration at this hospital whose lead slot is the
 * laboratory lead's and empty, or whose second slot is another laboratory lead's (lab_counter) after a lead
 * other than the viewer signed, and never the viewer's own draft (D-LAB1-12). The server still decides at
 * signing; this only says who is asked.
 */

export interface ConfigDraftRow {
  id: string;
  kind: string;
  key: string;
  version: number;
  status: string;
  authoredBy: string;
  authorName: string | null;
  leadSignedBy: string | null;
  leadName: string | null;
  csoSignedBy: string | null;
  createdAt: Date;
  leadSignedAt: Date | null;
}

export function signatureQueue(
  rows: readonly ConfigDraftRow[],
  viewerId: string,
): { mine: ConfigDraftRow[]; cso: ConfigDraftRow[] } {
  const mine: ConfigDraftRow[] = [];
  const cso: ConfigDraftRow[] = [];
  for (const r of rows) {
    if (r.status !== "draft" || r.csoSignedBy) continue;
    if (!r.leadSignedBy) {
      if (leadSlotFor(r.kind) === "lead" && r.authoredBy !== viewerId) mine.push(r);
      continue;
    }
    const second = secondSlotFor(r.kind);
    if (second === "lab_counter") {
      if (r.authoredBy !== viewerId && r.leadSignedBy !== viewerId) mine.push(r);
    } else cso.push(r);
  }
  const byAge = (a: ConfigDraftRow, b: ConfigDraftRow) =>
    a.createdAt.getTime() - b.createdAt.getTime();
  return { mine: mine.sort(byAge), cso: cso.sort(byAge) };
}

const S = LABWS2_SETUP;

export const kindWords = (kind: string) => S.kinds[kind] ?? S.otherKind;
export const secondWords = (kind: string) => S.second[secondSlotFor(kind)];

/** A config key in words: result concept ids become names, language codes words; "hospital" says nothing. */
export function keyWords(key: string): string | null {
  const parts = key
    .split(":")
    .filter((p) => p && p !== "hospital")
    .map((p) =>
      p.startsWith("obs.") ? (conceptDef(p)?.display ?? S.notInCatalogue) : (S.languages[p] ?? p),
    );
  return parts.length ? parts.join(", ") : null;
}

/** Where a kind is reviewed and signed (the existing page that holds it). */
export function signHref(kind: string): string {
  switch (kind) {
    case "scheme":
    case "flag_basis":
      return "/lab/setup/ranges";
    case "elevation":
    case "hiv_algorithm":
      return "/lab/setup/settings";
    case "addendum":
    case "ref":
      return "/lab/setup/drafts";
    case "delta_rule":
    case "panel_rule":
    case "pattern_rule":
      return "/lab/setup/delta";
    case "patient_release":
    case "plain_words":
    case "minors_rule":
    case "sms_template":
    case "patient_floor_additions":
    case "results_consent_notice":
      return "/lab/setup/patient-release";
    case "qc_plan":
    case "qc_policy":
    case "kit_qc_rule":
      return "/lab/quality?tab=plans";
    case "device_qc_rule":
    case "competency_validity":
      return "/lab/quality?tab=bedside";
    case "acceptance_plan":
      return "/lab/quality?tab=stock";
    case "hmis_mapping":
      return "/lab/setup/hmis-mapping";
    case "register_config":
      return "/lab/reports?tab=register";
    case "ncd_mapping":
      return "/ncd/admin/lab-feed";
    case "ipc_alert_entry":
      return "/ipc";
    default:
      return "/lab/send-outs?tab=partners";
  }
}

/* ─── The six groups ─────────────────────────────────────────────────── */

/** One count row of a two-signature store: status, whether the lead has signed, how many, the newest version. */
export interface TallyRow {
  kind?: string;
  status: string;
  leadSigned: boolean;
  n: number;
  v: number | null;
}

export interface HubFacts {
  configs: TallyRow[];
  ranges: TallyRow[];
  limits: TallyRow[];
  response: TallyRow[];
  menu: { tests: number };
  noUnit: number;
  profiles: { inUse: number; drafts: number };
  analysers: number;
  partners: number;
  connections: { live: number; retrying: number };
  demoLoads: number;
}

export type HubTone = "neutral" | "draft" | "not_set";
export interface HubStatus {
  text: string;
  tone: HubTone;
}

interface Tally {
  signed: number;
  drafts: number;
  waiting: number;
  signedV: number | null;
  draftV: number | null;
}

export function tally(rows: readonly TallyRow[], kinds?: readonly string[]): Tally {
  const t: Tally = { signed: 0, drafts: 0, waiting: 0, signedV: null, draftV: null };
  const max = (a: number | null, b: number | null) =>
    b === null ? a : a === null ? b : Math.max(a, b);
  for (const r of rows) {
    if (kinds && !kinds.includes(r.kind ?? "")) continue;
    if (r.status === "signed") {
      t.signed += r.n;
      t.signedV = max(t.signedV, r.v);
    } else if (r.status === "draft") {
      if (r.leadSigned) t.waiting += r.n;
      else t.drafts += r.n;
      t.draftV = max(t.draftV, r.v);
    }
  }
  return t;
}

/** One versioned setting: "Draft v4", "Waiting for the CSO", "Signed v2", "Not signed yet". */
export function singleStatus(t: Tally, waitingWord: string = S.status.waitingCso): HubStatus {
  if (t.waiting) return { text: waitingWord, tone: "neutral" };
  if (t.drafts) return { text: fill(S.status.draftV, { n: t.draftV ?? 1 }), tone: "draft" };
  if (t.signed) return { text: fill(S.status.signedV, { n: t.signedV ?? 1 }), tone: "neutral" };
  return { text: S.status.notSigned, tone: "not_set" };
}

/** Many keyed settings: "38 signed · 6 drafts". */
export function manyStatus(t: Tally): HubStatus {
  const parts = [
    t.signed ? fill(S.status.signed, { n: t.signed }) : null,
    t.drafts === 1 ? S.status.draft : t.drafts ? fill(S.status.drafts, { n: t.drafts }) : null,
    t.waiting ? fill(S.status.waiting, { n: t.waiting }) : null,
  ].filter(Boolean);
  if (!parts.length) return { text: S.status.nothingDrafted, tone: "not_set" };
  return { text: parts.join(" · "), tone: t.drafts ? "draft" : "neutral" };
}

const count = (
  n: number,
  one: string,
  many: string,
  none: string,
  tone: HubTone = "not_set",
): HubStatus =>
  n === 0 ? { text: none, tone } : { text: n === 1 ? one : fill(many, { n }), tone: "neutral" };

export interface HubLink {
  id: string;
  label: string;
  href: string;
  status: HubStatus;
}
export interface HubGroup {
  id: keyof typeof S.groups;
  title: string;
  links: HubLink[];
}

/** The six groups, each link shown only when the nav item it stands for is visible to the viewer. */
export function hubGroups(f: HubFacts, visible: ReadonlySet<LabNavId>): HubGroup[] {
  const L = S.links;
  const st = S.status;
  const c = (kinds: readonly string[]) => tally(f.configs, kinds);
  const link = (
    id: string,
    show: boolean,
    label: string,
    href: string,
    status: () => HubStatus,
  ): HubLink | null => (show ? { id, label, href, status: status() } : null);
  const v = (id: LabNavId) => visible.has(id);
  const groups: { id: HubGroup["id"]; links: (HubLink | null)[] }[] = [
    {
      id: "tests",
      links: [
        link("menu", v("setup_menu"), L.menu, "/lab/setup/menu", () =>
          f.menu.tests === 0
            ? { text: st.menuNone, tone: "not_set" }
            : { text: fill(st.menuAll, { n: f.menu.tests }), tone: "neutral" },
        ),
        link("catalogue", v("setup_catalogue"), L.catalogue, "/lab/setup/catalogue", () =>
          f.noUnit
            ? { text: fill(st.noUnit, { n: f.noUnit }), tone: "draft" }
            : { text: st.allUnits, tone: "neutral" },
        ),
        link("profiles", v("setup_profiles"), L.profiles, "/lab/setup/profiles", () =>
          !f.profiles.inUse && !f.profiles.drafts
            ? { text: st.noProfile, tone: "not_set" }
            : f.profiles.drafts
              ? {
                  text: fill(st.profiles, { n: f.profiles.inUse, d: f.profiles.drafts }),
                  tone: "draft",
                }
              : { text: fill(st.profilesInUse, { n: f.profiles.inUse }), tone: "neutral" },
        ),
      ],
    },
    {
      id: "safety",
      links: [
        link("ranges", v("setup_ranges"), L.ranges, "/lab/setup/ranges", () => {
          const r = tally(f.ranges);
          const s = c(["scheme", "flag_basis"]);
          return manyStatus({
            signed: r.signed + s.signed,
            drafts: r.drafts + s.drafts,
            waiting: r.waiting + s.waiting,
            signedV: null,
            draftV: null,
          });
        }),
        link("limits", v("setup_limits"), L.limits, "/lab/setup/limits", () =>
          singleStatus(tally(f.limits)),
        ),
        link("response", v("setup_criticals"), L.response, "/lab/setup/criticals", () =>
          singleStatus(tally(f.response)),
        ),
        link("delta", v("setup_delta"), L.delta, "/lab/setup/delta", () =>
          manyStatus(c(["delta_rule", "panel_rule", "pattern_rule"])),
        ),
      ],
    },
    {
      id: "patients",
      links: [
        link("release", v("setup_patient_release"), L.release, "/lab/setup/patient-release", () =>
          manyStatus(
            c([
              "patient_release",
              "minors_rule",
              "patient_floor_additions",
              "results_consent_notice",
            ]),
          ),
        ),
        link(
          "plainWords",
          v("setup_patient_release"),
          L.plainWords,
          "/lab/setup/patient-release",
          () => manyStatus(c(["plain_words"])),
        ),
        link("message", v("setup_patient_release"), L.message, "/lab/setup/patient-release", () =>
          manyStatus(c(["sms_template"])),
        ),
      ],
    },
    {
      id: "quality",
      links: [
        link("qc", v("qc"), L.qc, "/lab/quality?tab=plans", () =>
          manyStatus(c(["qc_plan", "qc_policy"])),
        ),
        link(
          "kitRules",
          v("qc") || v("bedside_quality"),
          L.kitRules,
          v("qc") ? "/lab/quality?tab=plans" : "/lab/quality?tab=bedside",
          () => manyStatus(c(["kit_qc_rule", "device_qc_rule", "competency_validity"])),
        ),
        link("lots", v("stock"), L.lots, "/lab/quality?tab=stock", () =>
          manyStatus(c(["acceptance_plan"])),
        ),
        link(
          "equipment",
          v("equipment") || v("eqa"),
          L.equipment,
          v("equipment") ? "/lab/quality?tab=equipment" : "/lab/quality?tab=eqa",
          () => ({ text: st.equipment, tone: "neutral" }),
        ),
      ],
    },
    {
      id: "partners",
      links: [
        link("partners", v("partners"), L.partners, "/lab/send-outs?tab=partners", () =>
          count(f.partners, st.onePartner, st.partners, st.noPartner),
        ),
        link("analysers", v("analysers"), L.analysers, "/lab/setup/analysers", () =>
          count(f.analysers, st.oneAnalyser, st.analysers, st.noAnalyser),
        ),
        link(
          "connections",
          v("connections"),
          L.connections,
          "/lab/send-outs?tab=connections",
          () =>
            !f.connections.live && !f.connections.retrying
              ? { text: st.noConnection, tone: "not_set" }
              : f.connections.retrying
                ? {
                    text: fill(st.connections, {
                      n: f.connections.live,
                      r: f.connections.retrying,
                    }),
                    tone: "draft",
                  }
                : { text: fill(st.connectionsLive, { n: f.connections.live }), tone: "neutral" },
        ),
      ],
    },
    {
      id: "lab",
      links: [
        link("settings", v("setup_settings"), L.settings, "/lab/setup/settings", () =>
          manyStatus(c(["elevation", "hiv_algorithm"])),
        ),
        link("hmis", v("hmis"), L.hmis, "/lab/setup/hmis-mapping", () =>
          singleStatus(c(["hmis_mapping"]), st.waitingFocal),
        ),
        link("drafts", v("setup_drafts"), L.drafts, "/lab/setup/drafts", () =>
          singleStatus(c(["addendum"])),
        ),
        link("demo", v("setup_demo"), L.demo, "/lab/setup/demo", () =>
          count(f.demoLoads, st.oneDemo, st.demo, st.noDemo),
        ),
      ],
    },
  ];
  return groups
    .map((g) => ({
      id: g.id,
      title: S.groups[g.id],
      links: g.links.filter((l): l is HubLink => l !== null),
    }))
    .filter((g) => g.links.length > 0);
}
