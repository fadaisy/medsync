/**
 * DATA-INVENTORY.md, generated from the schema (§13): every NCD field, whether it identifies,
 * whether it is encrypted, and which roles can read it. An input to the data protection impact
 * assessment, not the assessment itself.
 */
import type { NcdRole } from "./capabilities";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";

import * as schema from "@/db/schema/ncd-registry";
import { capabilitiesOf, NCD_ROLES } from "./capabilities";
import { ANALYTICS_CAPS, ANALYTICS_TABLES, TABLE_ACCESS } from "./table-access";

const readers = (table: string, identifying: boolean): string => {
  const a = TABLE_ACCESS[table];
  if (!a) return "–";
  const roles = NCD_ROLES.filter((r: NcdRole) => {
    const caps = capabilitiesOf([r]);
    const viaApp = a.select === "any" ? caps.size > 0 : a.select.some((c) => caps.has(c));
    const viaAnalytics =
      !identifying &&
      (ANALYTICS_TABLES as readonly string[]).includes(table) &&
      ANALYTICS_CAPS.some((c) => caps.has(c));
    return viaApp || viaAnalytics;
  });
  return roles.length
    ? roles.map((r) => r.replace(/_/g, " ")).join(", ")
    : "none (system principals only)";
};

export function renderDataInventory(): string {
  const out = [
    "# NCDSync data inventory",
    "",
    "Generated from `db/schema/ncd-registry.ts`, `lib/ncdreg/table-access.ts` and `lib/ncdreg/capabilities.ts` by `npm run ncdreg:docs`. Do not edit by hand.",
    "",
    "An input to the data protection impact assessment, not the assessment. *Identifying* columns are the encrypted identifiers (`*_ciphertext`, AES-256-GCM through lib/encryption) and their keyed blind indexes (`*_hmac`). The analytics role (dashboards, indicators) is granted no identifying column. Superadmin holds no NCD role. Every read of an identifiable record is logged in `ncd_access_event` and every write in `audit_log`.",
    "",
  ];
  const tables = (Object.values(schema) as unknown[])
    .filter((t): t is PgTable => is(t, PgTable))
    .map((t) => getTableConfig(t))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const c of tables) {
    out.push(
      `## ${c.name}`,
      "",
      "| Column | Type | Identifying | Encrypted | Readable by |",
      "| --- | --- | --- | --- | --- |",
    );
    for (const col of c.columns) {
      const identifying = /_(ciphertext|hmac)$/.test(col.name);
      out.push(
        `| ${col.name} | ${col.getSQLType()} | ${identifying ? "yes" : "no"} | ${col.name.endsWith("_ciphertext") ? "yes" : "no"} | ${readers(c.name, identifying)} |`,
      );
    }
    out.push("");
  }
  return out.join("\n");
}
