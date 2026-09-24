import type { ArrestContext, ArrestState } from "@/lib/resus/model";
import type { TimelineEvent } from "@/lib/resus/types";

import {
  ADRENALINE_DOSE_TEXT,
  AMIODARONE_FIRST_MG,
  AMIODARONE_SECOND_MG,
  ANTIARRHYTHMIC_FIRST_AFTER_SHOCKS,
  ANTIARRHYTHMIC_SECOND_AFTER_SHOCKS,
  LIDOCAINE_FIRST_MG,
  LIDOCAINE_SECOND_MG,
} from "@/lib/resus/reference/als-catalog";
import { fastPathHoldReason } from "@/lib/resus/v2-rules";
import { fmtMs } from "./arrest-console-model";

/**
 * The console's protocol-drug buttons as data (D4 fast path, ALS-DRG-05). `doseMg` is the
 * one-tap dose, or null: then the tap opens the prescribe dialog and `reasons` say why
 * (a child, hypothermia withheld / delayed, LAST, both doses given). Every number is a
 * signed catalog constant; a child sees none (ALS-MOD-16). Episode totals (ALS-ROSC-05)
 * are recorded amounts, so they show for a child too. `events` lets the one tap follow
 * the server's own hold (fastPathHoldReason, S1), so the server never answers "dialog".
 */

export type ArrestDrug = "adrenaline" | "amiodarone" | "lidocaine";
export type RecCode = "als_adrenaline" | "als_amiodarone" | "als_lidocaine";

export interface DrugButton {
  drug: ArrestDrug;
  /** The one-tap dose; null = the prescribe dialog. */
  doseMg: number | null;
  /** Why the one tap is off — the dialog shows them. */
  reasons: string[];
  label: string;
  caption: string;
  rec: { recCode: RecCode; recLabel: string };
}

const ADRENALINE_MG = Number.parseFloat(ADRENALINE_DOSE_TEXT); // ALS-ADR-01/02 ("1 mg IV")
const AA_DOSES = {
  amiodarone: [AMIODARONE_FIRST_MG, AMIODARONE_SECOND_MG], // ALS-AA-01/02
  lidocaine: [LIDOCAINE_FIRST_MG, LIDOCAINE_SECOND_MG], // ALS-AA-03
} as const;
const NAME: Record<ArrestDrug, string> = {
  adrenaline: "Adrenaline",
  amiodarone: "Amiodarone",
  lidocaine: "Lidocaine",
};

const ADR_CAPTION: Record<ArrestState["adrenaline"]["status"], string> = {
  not_yet_eligible: "Not yet due",
  due_now: "Due now",
  waiting: "Waiting",
  window_open: "Window open",
  overdue: "Overdue",
  withheld: "Withheld — hypothermia",
  suppressed_child: "Weight-based — PLS not built",
};

const AA_CAPTION: Record<ArrestState["antiarrhythmic"]["status"], string> = {
  not_eligible: "Not yet eligible",
  due: "Due now",
  complete: "Both doses given",
  delayed_hypothermia: "Delayed — hypothermia",
  suppressed_child: "Weight-based — PLS not built",
};

/** A clinical number never sits on a different line from its unit. Display only. */
export const keepUnit = (s: string): string => s.replace(/(\d) (mg|J|kPa)\b/g, "$1\u00a0$2");

const mg = (n: number) => `${Math.round(n * 100) / 100}\u00a0mg`;

/** Earlier arrests in this resus (ALS-ROSC-05): the episode total, else nothing. */
function totalSuffix(a: ArrestState, drug: ArrestDrug): string {
  const total = a.episodeTotalsMg[drug];
  return a.arrestSeq > 1 && total ? ` · ${mg(total)} this resus` : "";
}

/** "This resus, all arrests: Adrenaline 5 mg · Amiodarone 450 mg" once there was an arrest #1. */
export function episodeTotalsLine(a: ArrestState): string | null {
  if (a.arrestSeq < 2) return null;
  const parts = (Object.keys(NAME) as ArrestDrug[]).flatMap((d) => {
    const total = a.episodeTotalsMg[d];
    return total ? [`${NAME[d]} ${mg(total)}`] : [];
  });
  return parts.length ? `This resus, all arrests: ${parts.join(" · ")}` : null;
}

const lastLabel = (a: ArrestState) =>
  a.modifiers.filter((m) => m.id === "last").map((m) => m.label);

export function adrenalineButton(
  a: ArrestState,
  ctx: ArrestContext,
  now: number,
  route: "iv" | "io",
  events: readonly TimelineEvent[] = [],
): DrugButton {
  const adr = a.adrenaline;
  const child = a.paediatric;
  const withheld = adr.status === "withheld";
  const last = ctx.flags.localAnaestheticToxicity && !child && !withheld;
  const hold = child || withheld ? null : fastPathHoldReason("adrenaline", events, adr.doses);
  const doseMg = child || withheld || last || hold ? null : ADRENALINE_MG;
  const state =
    adr.status === "waiting" && adr.opensAtMs !== null
      ? `Opens in ${fmtMs(adr.opensAtMs - now)}`
      : last
        ? "Weight-based — opens the dialog"
        : (hold ?? ADR_CAPTION[adr.status]);
  const doseText = route === "io" ? ADRENALINE_DOSE_TEXT.replace("IV", "IO") : ADRENALINE_DOSE_TEXT;
  return {
    drug: "adrenaline",
    doseMg,
    reasons: withheld ? [adr.reason] : last ? lastLabel(a) : hold ? [hold] : [],
    label: doseMg === null ? "Adrenaline" : keepUnit(`Adrenaline ${doseText}`),
    caption: state + (adr.doses > 0 ? ` · ${adr.doses} given` : "") + totalSuffix(a, "adrenaline"),
    rec: { recCode: "als_adrenaline", recLabel: "Adrenaline — cardiac arrest" },
  };
}

export function antiarrhythmicButton(
  a: ArrestState,
  ctx: ArrestContext,
  events: readonly TimelineEvent[] = [],
): DrugButton & { show: boolean } {
  const aa = a.antiarrhythmic;
  const child = a.paediatric;
  const name = NAME[aa.drug];
  const delayed = aa.status === "delayed_hypothermia";
  // Lidocaine is itself a local anaesthetic: the engine shows no dose in LAST.
  const last = aa.drug === "lidocaine" && ctx.flags.localAnaestheticToxicity && !child;
  const hold = child || delayed ? null : fastPathHoldReason(aa.drug, events, aa.dosesGiven);
  const doseMg =
    child || delayed || last || hold ? null : (AA_DOSES[aa.drug][aa.dosesGiven] ?? null);
  const reasons =
    child || doseMg !== null
      ? []
      : delayed || aa.status === "complete"
        ? [aa.reason]
        : last
          ? lastLabel(a)
          : hold
            ? [hold]
            : [];
  const state =
    aa.status === "not_eligible"
      ? `From shock ${aa.dosesGiven === 0 ? ANTIARRHYTHMIC_FIRST_AFTER_SHOCKS : ANTIARRHYTHMIC_SECOND_AFTER_SHOCKS}`
      : (hold ?? AA_CAPTION[aa.status]);
  return {
    drug: aa.drug,
    doseMg,
    reasons,
    label: doseMg === null ? name : `${name} ${mg(doseMg)}`,
    caption: state + totalSuffix(a, aa.drug),
    rec: {
      recCode: aa.drug === "amiodarone" ? "als_amiodarone" : "als_lidocaine",
      recLabel: `${name} — cardiac arrest`,
    },
    show: aa.dosesGiven > 0 || aa.status === "due" || a.rhythms.some((r) => r.rhythm === "vf_pvt"),
  };
}
