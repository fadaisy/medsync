import type { SignedCopy } from "@/content/signed-copy";

import { STOCK_UP_POLISH } from "@/content/pharmacy-stock-up-polish";
import RAW from "@/data/pharmacy/controlled-substances.v1.json";

/**
 * The signed list of controlled substances (ADR 0470, owner 29 Oct 2026): a catalogue medicine is controlled when any
 * ingredient is a listed substance (or a listed salt of it), with that substance's class; otherwise not controlled.
 * Matched on the catalogue's own substance key and names, never on a display name. Pure.
 */

export type ControlledClass = "narcotic" | "psychotropic" | "policy";

export interface ControlledSubstance {
  substance: string;
  class: ControlledClass;
  basis: "law" | "policy";
  source: string;
  /** Names that are this substance or a salt of it, normalised as `normaliseSubstance` does. */
  matches: string[];
}

const LIST = RAW as unknown as {
  edition: string;
  copy: SignedCopy;
  rule: string;
  substances: ControlledSubstance[];
};

export const CONTROLLED_SUBSTANCES: readonly ControlledSubstance[] = LIST.substances;
/** Draft until the CSO signs it. */
export const CONTROLLED_SUBSTANCES_COPY: SignedCopy = LIST.copy;

/** As the catalogue keys a substance: lower case, punctuation as spaces. */
export const normaliseSubstance = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const BY_NAME = new Map(
  CONTROLLED_SUBSTANCES.flatMap((s) => s.matches.map((m) => [normaliseSubstance(m), s] as const)),
);
const RANK: Record<ControlledClass, number> = { narcotic: 0, psychotropic: 1, policy: 2 };

/**
 * A medicine's controlled substance, from its ingredients (each its substance key and other names): the strictest
 * class when more than one is listed (narcotic, then psychotropic, then policy). Null: not controlled.
 */
export function controlledIngredient(
  ingredients: readonly { key: string; names: readonly string[] }[],
): ControlledSubstance | null {
  const hits = ingredients.flatMap((i) =>
    [i.key, ...i.names].flatMap((n) => BY_NAME.get(normaliseSubstance(n)) ?? []),
  );
  return hits.sort((a, b) => RANK[a.class] - RANK[b.class])[0] ?? null;
}

/** The class as the controlled screens name it. */
export const classWords = (c: ControlledClass) => STOCK_UP_POLISH.controlled.classes[c];

/** CS-5: in production the list decides a new local medicine's status only once signed; elsewhere, at once. */
export const controlledListLive = () =>
  CONTROLLED_SUBSTANCES_COPY.status === "signed" || process.env.VERCEL_ENV !== "production";
