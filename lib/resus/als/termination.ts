import type { ArrestContext, ArrestState, CauseTile } from "@/lib/resus/model";
import type { TimelineEvent } from "@/lib/resus/types";

import { peLysisAtMs, pregnancyModifierActive, tempBand } from "@/lib/resus/als/modifiers";
import {
  ERC_TOR_MIN,
  PE_LYSIS_CPR_MAX_MIN,
  PE_LYSIS_CPR_MIN_MIN,
  RCUK_TOR_MIN,
} from "@/lib/resus/reference/als-catalog";
import { reconstructTimeline } from "@/lib/resus/timeline";

/**
 * Termination-of-resuscitation review (catalog §9, ALS-TOR-01..10). PURE.
 *
 * The review lays out facts, the reversible causes not yet excluded (first, ALS-TOR-08), the
 * reasons to continue (ALS-TOR-07) and the persistent-asystole criteria as INFORMATION only
 * (ALS-TOR-03, D1). It never recommends stopping: the decision is the team's (ALS-TOR-01/02),
 * and a low ETCO₂ alone is never a reason (ALS-ETC-03, ALS-TOR-04).
 */

const MIN = 60_000;

export interface ContinueFlag {
  id: string;
  ruleId: string;
  text: string;
}

export interface TerminationReview {
  facts: {
    arrestDurationMs: number;
    cprDurationMs: number;
    /** Time since the first check of the current unbroken run of asystole checks, or null. */
    persistentAsystoleMs: number | null;
    shocks: number;
    adrenalineDoses: number;
    airway: ArrestState["airway"]["level"];
    capnography: ArrestState["airway"]["ettTrace"];
    etco2Last3: number[];
  };
  /** Causes whose state is not "excluded", listed first (amber, ALS-TOR-08). */
  notExcluded: CauseTile[];
  /** All eight tiles, not-excluded first. */
  causes: CauseTile[];
  continueFlags: ContinueFlag[];
  criteria: {
    erc: { minutes: number; met: boolean; text: string };
    rcuk: { minutes: number; met: boolean; text: string };
  };
  /** Standing cautions shown on the review. */
  cautions: { ruleId: string; text: string }[];
}

const CAUTIONS: TerminationReview["cautions"] = [
  {
    ruleId: "ALS-TOR-01",
    text: "A team decision: CPR duration, reversible causes, response to ALS, the patient's values",
  },
  {
    ruleId: "ALS-TOR-02",
    text: "Termination rules are not used for in-hospital arrest, nor as the sole reason to stop",
  },
  {
    ruleId: "ALS-TOR-04",
    text: "Persistently low ETCO₂ may aid the decision — never in isolation",
  },
  {
    ruleId: "ALS-TOR-05",
    text: "Not a basis for stopping: cardiac ultrasound, blood gases, pupil reactivity",
  },
  { ruleId: "ALS-TOR-06", text: "Ask the team; record any objection and the reasons" },
];

function persistentAsystoleMs(arrest: ArrestState, endMs: number): number | null {
  let start: number | null = null;
  for (let i = arrest.rhythms.length - 1; i >= 0 && arrest.rhythms[i]!.rhythm === "asystole"; i--) {
    start = arrest.rhythms[i]!.atMs;
  }
  return start === null ? null : Math.max(0, endMs - start);
}

function continueFlags(
  tl: readonly TimelineEvent[],
  arrest: ArrestState,
  ctx: ArrestContext,
  nowMs: number,
): ContinueFlag[] {
  const out: ContinueFlag[] = [];
  const add = (id: string, text: string) => out.push({ id, ruleId: "ALS-TOR-07", text });
  // ALS-MOD-16 / Law 7: a child's reasons to continue carry no adult duration.
  const child = arrest.paediatric;
  const band = tempBand(ctx);
  if (band === "below_30" || band === "30_to_35")
    add("hypothermia", `Hypothermia (core ${ctx.coreTempC} °C) — rewarm before deciding`);
  if (band === "peripheral_low")
    add(
      "temperature_not_core",
      "Low non-core temperature — measure core temperature before deciding",
    );
  const toxins = arrest.causes.find((c) => c.key === "toxins");
  if (
    ctx.flags.localAnaestheticToxicity ||
    toxins?.state === "suspected" ||
    toxins?.state === "treating"
  )
    add(
      "toxins",
      `Toxins / local anaesthetic toxicity — plan prolonged resuscitation${child ? "" : " (> 1 h)"}`,
    );
  const lysisAt = peLysisAtMs(tl);
  if (lysisAt !== null && nowMs - lysisAt < PE_LYSIS_CPR_MAX_MIN * MIN)
    add(
      "pe_lysis",
      `PE thrombolysis ${Math.floor((nowMs - lysisAt) / MIN)} min ago — ${
        child
          ? "prolonged resuscitation (weight-based — PLS module not built)"
          : `consider CPR for ${PE_LYSIS_CPR_MIN_MIN}–${PE_LYSIS_CPR_MAX_MIN} min after administration`
      }`,
    );
  const rs = arrest.rhythms;
  if (arrest.currentRhythm === "vf_pvt") add("shockable", "Persistent shockable rhythm");
  else if (
    rs.some((r, i) => r.rhythm === "vf_pvt" && rs.slice(0, i).some((p) => p.rhythm !== "vf_pvt"))
  )
    add("shockable", "Recurrent shockable rhythm");
  if (arrest.rosc.intermittentCount > 0)
    add("intermittent_rosc", `Intermittent ROSC (${arrest.rosc.intermittentCount})`);
  if (arrest.etco2.rising) add("etco2_rising", "ETCO₂ rising");
  const hysterotomy = tl.some(
    (e) => e.kind === "procedure" && e.payload.arrestProcedure === "hysterotomy",
  );
  if (pregnancyModifierActive(ctx) && !hysterotomy)
    add("hysterotomy", "Pregnancy > 20 weeks — resuscitative hysterotomy not yet performed");
  for (const c of arrest.causes)
    if (c.state === "treating")
      add(`treating_${c.key}`, `Reversible cause being treated now: ${c.key}`);
  return out;
}

export function terminationReview(
  events: readonly TimelineEvent[],
  arrest: ArrestState,
  ctx: ArrestContext,
  nowMs: number,
): TerminationReview {
  const tl = reconstructTimeline(events);
  const endMs = (arrest.arrestAtMs ?? nowMs) + arrest.arrestElapsedMs;
  const asystoleMs = persistentAsystoleMs(arrest, endMs);
  const notExcluded = arrest.causes.filter((c) => c.state !== "excluded");
  const flags = continueFlags(tl, arrest, ctx, nowMs);
  const causeActive = arrest.causes.some((c) => c.state === "suspected" || c.state === "treating");
  const clear = !causeActive && flags.length === 0;
  return {
    facts: {
      arrestDurationMs: arrest.arrestElapsedMs,
      cprDurationMs: arrest.cprElapsedMs,
      persistentAsystoleMs: asystoleMs,
      shocks: arrest.shocks.count,
      adrenalineDoses: arrest.adrenaline.doses,
      airway: arrest.airway.level,
      capnography: arrest.airway.ettTrace,
      etco2Last3: arrest.etco2.last3,
    },
    notExcluded,
    causes: [...notExcluded, ...arrest.causes.filter((c) => c.state === "excluded")],
    continueFlags: flags,
    criteria: {
      erc: {
        minutes: ERC_TOR_MIN,
        met: clear && asystoleMs !== null && asystoleMs >= ERC_TOR_MIN * MIN,
        text: `ERC 2025: stopping may be considered after ${ERC_TOR_MIN} min of ALS in persistent asystole with no reversible cause and nothing arguing against — a team decision`,
      },
      rcuk: {
        minutes: RCUK_TOR_MIN,
        met: clear && asystoleMs !== null && arrest.arrestElapsedMs >= RCUK_TOR_MIN * MIN,
        text: `RCUK 2025: at least ${RCUK_TOR_MIN} min from confirmation of arrest — a team decision`,
      },
    },
    cautions: CAUTIONS,
  };
}

/**
 * Cadres recommended to lead (and to stop, ALS-TOR-09). Re-declared from `lib/resus/scope.ts`
 * (a server-only module); a test proves the two lists are equal.
 */
export const STOP_RECOMMENDED_CADRE_CODES = [
  "INTERN_DOCTOR",
  "MEDICAL_OFFICER",
  "MEDICAL_OFFICER_SG",
  "CONSULTANT",
  "SENIOR_CONSULTANT",
  "CLINICAL_OFFICER",
] as const;

/** Who may stop (D9): doctor / CO recommended; any cadre may record with a senior co-sign pending. */
export function stopAuthority(cadreCode: string | null): {
  recommended: boolean;
  seniorCosignPending: boolean;
} {
  const recommended = (STOP_RECOMMENDED_CADRE_CODES as readonly string[]).includes(cadreCode ?? "");
  return { recommended, seniorCosignPending: !recommended };
}
