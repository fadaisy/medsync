/**
 * The signed other names and abbreviations (GATE A §5; `names.v1.json`) planned onto what the catalogue holds
 * (catalogue slice Step 3). Pure. A name that fits nothing is reported, never forced onto the nearest thing.
 * Names are search-only: no name changes a medicine.
 */
import names from "@/data/pharmacy/catalogue/names.v1.json";
import { normaliseName } from "@/lib/pharmacy/national-list";

export interface CatalogueSubstance {
  id: string;
  key: string;
  emhsluClass: string | null;
}
export interface CatalogueMedicine {
  id: string;
  ingredientKeys: readonly string[];
  formCode: string | null;
  strengthText: string | null;
}

export type NameTarget = "substance" | "medicine";
export interface PlannedName {
  target: NameTarget;
  ids: string[];
  name: string;
  type: string;
  why: string;
}

type Abbrev = {
  name: string;
  type: string;
  substance?: string[];
  medicine?: {
    all?: string[];
    form?: string;
    strength?: string;
    anyCombinationOf?: string[];
    classMatches?: string;
  };
};

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));
const squash = (s: string | null) => (s ?? "").toLowerCase().replace(/\s+/g, "");

export function planNames(
  substances: readonly CatalogueSubstance[],
  medicines: readonly CatalogueMedicine[],
): { planned: PlannedName[]; unmatched: { name: string; why: string }[] } {
  const byKey = new Map(substances.map((s) => [s.key, s]));
  const planned: PlannedName[] = [];
  const unmatched: { name: string; why: string }[] = [];

  for (const p of names.preferred) {
    const s = byKey.get(normaliseName(p.inn));
    for (const [other, type] of p.others as [string, string][]) {
      if (s)
        planned.push({
          target: "substance",
          ids: [s.id],
          name: other,
          type,
          why: `${type} name of ${p.inn}`,
        });
      else unmatched.push({ name: other, why: `${p.inn} is not in the catalogue yet` });
    }
  }

  for (const a of names.abbreviations as Abbrev[]) {
    let found = false;
    const sub = a.substance
      ?.map(normaliseName)
      .map((k) => byKey.get(k))
      .find(Boolean);
    if (sub) {
      planned.push({
        target: "substance",
        ids: [sub.id],
        name: a.name,
        type: a.type,
        why: `for ${sub.key}`,
      });
      found = true;
    }
    const m = a.medicine;
    if (m) {
      const all = m.all?.map(normaliseName);
      const any = m.anyCombinationOf?.map(normaliseName);
      const cls = m.classMatches?.toLowerCase();
      const fits = medicines.filter((x) => {
        if (all && !sameSet(x.ingredientKeys, all)) return false;
        if (m.form && x.formCode !== m.form) return false;
        if (m.strength && squash(x.strengthText) !== squash(m.strength)) return false;
        if (any && !(x.ingredientKeys.length > 1 && x.ingredientKeys.some((k) => any.includes(k))))
          return false;
        if (
          cls &&
          !x.ingredientKeys.some((k) => byKey.get(k)?.emhsluClass?.toLowerCase().includes(cls))
        )
          return false;
        return true;
      });
      if (fits.length) {
        const type = a.type === "local" ? "local" : a.type;
        planned.push({
          target: "medicine",
          ids: fits.map((x) => x.id),
          name: a.name,
          type,
          why: `${fits.length} medicine${fits.length === 1 ? "" : "s"}`,
        });
        found = true;
      }
    }
    if (!found) unmatched.push({ name: a.name, why: "nothing in the catalogue fits it yet" });
  }
  return { planned, unmatched };
}
