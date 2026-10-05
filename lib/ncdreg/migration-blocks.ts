/** The generated blocks of migration 0093 (see scripts/ncdreg-policies.ts). */
import { grantRows } from "./capabilities";
import { allPolicySql } from "./table-access";

export const MIGRATION_0093 = "supabase/migrations/0093_ncd_registry.sql";

export function grantSeedSql(): string {
  const rows = grantRows().map(([r, c]) => `  ('${r}', '${c}')`);
  return [
    "DELETE FROM public.ncd_capability_grant;",
    "INSERT INTO public.ncd_capability_grant (role, capability) VALUES",
    rows.join(",\n") + ";",
  ].join("\n");
}

export function generatedMigrationBlocks(): Record<string, string> {
  return { POLICIES: allPolicySql(), GRANTS: grantSeedSql() };
}

const markers = (name: string) =>
  [`-- BEGIN GENERATED ${name}\n`, `-- END GENERATED ${name}`] as const;

export function readBlock(sql: string, name: string): string {
  const [a, b] = markers(name);
  const i = sql.indexOf(a);
  const j = sql.indexOf(b);
  if (i < 0 || j < i) throw new Error(`missing block ${name}`);
  return sql.slice(i + a.length, j).replace(/\n$/, "");
}

export function replaceBlock(sql: string, name: string, body: string): string {
  const [a, b] = markers(name);
  const i = sql.indexOf(a);
  const j = sql.indexOf(b);
  if (i < 0 || j < i) throw new Error(`missing block ${name}`);
  return sql.slice(0, i + a.length) + body + "\n" + sql.slice(j);
}
