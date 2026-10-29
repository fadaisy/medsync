import type { PackKind } from "./packs";
import type { SignedCopy } from "@/content/signed-copy";

import RAW from "@/data/pharmacy/packs/templates.v1.json";

/**
 * Signed packs start from MedSync's sourced drafts (ADR 0469, owner 29 Oct 2026): every pack kind has a starting
 * draft in `data/pharmacy/packs/templates.v1.json`, each field with its basis: a national figure and where it is
 * printed, MedSync's proposal and why, or the hospital's own choice (left empty). A pack still takes effect only when
 * signed. Pure and client-safe: the Write a draft dialog reads it.
 */

export type Basis =
  | { basis: "national"; source: string }
  | { basis: "medsync"; reason: string }
  | { basis: "hospital"; reason: string; choices?: string[] };

export type TemplateField = { value: unknown } & Basis;

interface Templates {
  edition: string;
  copy: SignedCopy;
  packs: Record<PackKind, Record<string, TemplateField>>;
}

export const PACK_TEMPLATES = RAW as unknown as Templates;
/** Draft until the CSO signs it as MedSync's national template. */
export const PACK_TEMPLATES_COPY: SignedCopy = PACK_TEMPLATES.copy;

const setPath = (o: Record<string, unknown>, path: string, v: unknown) => {
  const [head, ...rest] = path.split(".");
  if (!rest.length) o[head!] = v;
  else setPath((o[head!] ??= {}) as Record<string, unknown>, rest.join("."), v);
};

/** A kind's starting draft as content; a hospital field stays empty, never filled for it. */
export function templateContent(kind: PackKind): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [path, f] of Object.entries(PACK_TEMPLATES.packs[kind] ?? {}))
    setPath(out, path, f.value);
  return out;
}

/** What Write a draft opens with: the hospital's draft, else its signed version, else MedSync's starting draft. */
export function startingDraft(
  kind: PackKind,
  row: { draft: { content: unknown } | null; signed: { content: unknown } | null },
): { content: unknown; from: "draft" | "signed" | "template" } {
  if (row.draft) return { content: row.draft.content, from: "draft" };
  if (row.signed) return { content: row.signed.content, from: "signed" };
  return { content: templateContent(kind), from: "template" };
}

/** A field's basis, for the small line under it. */
export const basisOf = (kind: PackKind, path: string): TemplateField | undefined =>
  PACK_TEMPLATES.packs[kind]?.[path];
