/**
 * Workspace access from a signed cadre map (ADR 0229; Lab Phase 0 ADR 0221, Pharmacy Phase 0 ADR
 * 0227). A map names each cadre's permissions; an unsigned map grants nothing, and a permission a
 * workspace reserves for something other than a cadre (lab.manage: headship) never comes from one.
 * Pure: the lab and the pharmacy each bring their own permission list and map.
 */

export interface PermissionMap {
  version: string;
  status: string;
  permissions: readonly string[];
  cadres: Record<string, readonly string[]>;
}

export function cadrePermissions<P extends string>(
  map: PermissionMap,
  cadreCode: string | null,
  known: readonly P[],
  notFromCadre: readonly P[] = [],
): Set<P> {
  const out = new Set<P>();
  if (map.status !== "signed" || !cadreCode) return out;
  for (const p of map.cadres[cadreCode] ?? []) {
    if (
      (known as readonly string[]).includes(p) &&
      !(notFromCadre as readonly string[]).includes(p)
    )
      out.add(p as P);
  }
  return out;
}

/** Every problem with a map, for the test that keeps a shipped one honest. */
export function mapProblems<P extends string>(
  map: PermissionMap,
  known: readonly P[],
  notFromCadre: readonly P[] = [],
): string[] {
  const isKnown = (p: string) => (known as readonly string[]).includes(p);
  const problems: string[] = [];
  if (map.status !== "signed") problems.push(`status is ${map.status}, not signed`);
  for (const p of map.permissions) if (!isKnown(p)) problems.push(`unknown permission ${p}`);
  for (const [cadre, ps] of Object.entries(map.cadres)) {
    for (const p of ps) {
      if (!isKnown(p)) problems.push(`${cadre}: unknown permission ${p}`);
      if ((notFromCadre as readonly string[]).includes(p))
        problems.push(`${cadre}: ${p} cannot come from a cadre`);
    }
  }
  return problems;
}
