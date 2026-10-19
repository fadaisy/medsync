import "server-only";

import type { LabNavId } from "./nav";
import type { ConfigDraftRow, HubFacts, TallyRow } from "./setup-hub";
import type { EmrDb } from "@/lib/emr/db";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import { and, count, eq, isNull, max, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import {
  analyserProfiles,
  criticalLimitVersions,
  criticalResponseVersions,
  devices,
  diagnosticOfferings,
  labPartners,
  labSignedConfigs,
  referenceRangeVersions,
  testCatalogue,
  users,
} from "@/db/schema";
import { testsWithoutUnit } from "./criticals/readiness";
import { demoLoads } from "./demo";
import { loadConnections } from "./exchange-read";
import { signatureQueue } from "./setup-hub";

/**
 * Set-up hub, the read (prompt 5.8). Read only, over the stores that already hold each setting: the signed
 * configuration store (`lab_signed_configs`), the range, limit and response-time versions, the test menu, the
 * analyser profiles, the devices, the partners, the connections and the demo loads. The queue and the words
 * are decided in the pure part (lib/lab/setup-hub.ts).
 */

const author = alias(users, "author");
const lead = alias(users, "lead");

async function versionTally(
  conn: typeof db,
  table: PgTable & {
    hospitalId: AnyPgColumn;
    status: AnyPgColumn;
    leadSignedBy: AnyPgColumn;
    version: AnyPgColumn;
  },
  hospitalId: string,
): Promise<TallyRow[]> {
  const leadSigned = sql<boolean>`${table.leadSignedBy} is not null`;
  const rows = await conn
    .select({ status: table.status, leadSigned, n: count(), v: max(table.version) })
    .from(table)
    .where(eq(table.hospitalId, hospitalId))
    .groupBy(table.status, leadSigned);
  return rows.map((r) => ({
    status: String(r.status),
    leadSigned: !!r.leadSigned,
    n: Number(r.n),
    v: r.v as number | null,
  }));
}

export async function loadSetupHub(
  hospitalId: string,
  viewerId: string,
  visible: ReadonlySet<LabNavId>,
  database: EmrDb = db as unknown as EmrDb,
) {
  const conn = database as unknown as typeof db;
  const h = hospitalId;
  const leadSigned = sql<boolean>`${labSignedConfigs.leadSignedBy} is not null`;
  const [
    drafts,
    configs,
    ranges,
    limits,
    response,
    menu,
    noUnit,
    profiles,
    analysers,
    partners,
    connections,
    demo,
  ] = await Promise.all([
    conn
      .select({
        id: labSignedConfigs.id,
        kind: labSignedConfigs.kind,
        key: labSignedConfigs.key,
        version: labSignedConfigs.version,
        status: labSignedConfigs.status,
        authoredBy: labSignedConfigs.authoredBy,
        authorName: author.fullName,
        leadSignedBy: labSignedConfigs.leadSignedBy,
        leadName: lead.fullName,
        csoSignedBy: labSignedConfigs.csoSignedBy,
        createdAt: labSignedConfigs.createdAt,
        leadSignedAt: labSignedConfigs.leadSignedAt,
      })
      .from(labSignedConfigs)
      .leftJoin(author, eq(author.id, labSignedConfigs.authoredBy))
      .leftJoin(lead, eq(lead.id, labSignedConfigs.leadSignedBy))
      .where(and(eq(labSignedConfigs.hospitalId, h), eq(labSignedConfigs.status, "draft"))),
    conn
      .select({
        kind: labSignedConfigs.kind,
        status: labSignedConfigs.status,
        leadSigned,
        n: count(),
        v: max(labSignedConfigs.version),
      })
      .from(labSignedConfigs)
      .where(or(eq(labSignedConfigs.hospitalId, h), isNull(labSignedConfigs.hospitalId)))
      .groupBy(labSignedConfigs.kind, labSignedConfigs.status, leadSigned),
    versionTally(conn, referenceRangeVersions, h),
    versionTally(conn, criticalLimitVersions, h),
    versionTally(conn, criticalResponseVersions, h),
    // Lab test menu v2 (TM-3): the tests on this hospital's menu, keyed by the test; there is no link step.
    conn
      .select({ tests: sql<number>`count(distinct ${testCatalogue.code})` })
      .from(testCatalogue)
      .innerJoin(
        diagnosticOfferings,
        and(
          eq(diagnosticOfferings.code, testCatalogue.code),
          eq(diagnosticOfferings.hospitalId, h),
          eq(diagnosticOfferings.kind, "lab"),
        ),
      )
      .where(
        and(
          eq(testCatalogue.kind, "lab"),
          isNull(testCatalogue.hospitalId),
          ne(diagnosticOfferings.provision, "not_offered"),
        ),
      ),
    visible.has("setup_catalogue") ? testsWithoutUnit(h, new Date(), database) : [],
    conn
      .select({ state: analyserProfiles.state, n: count() })
      .from(analyserProfiles)
      .where(eq(analyserProfiles.hospitalId, h))
      .groupBy(analyserProfiles.state),
    conn
      .select({ n: count() })
      .from(devices)
      .where(
        and(eq(devices.hospitalId, h), eq(devices.kind, "analyser"), eq(devices.active, true)),
      ),
    conn
      .select({ n: count() })
      .from(labPartners)
      .where(and(eq(labPartners.hospitalId, h), eq(labPartners.active, true))),
    visible.has("connections") ? loadConnections(h) : [],
    visible.has("setup_demo") ? demoLoads(database, h) : [],
  ]);

  const queue = signatureQueue(drafts as ConfigDraftRow[], viewerId);
  const facts: HubFacts = {
    configs: configs.map((r) => ({
      kind: r.kind,
      status: r.status,
      leadSigned: !!r.leadSigned,
      n: Number(r.n),
      v: r.v,
    })),
    ranges,
    limits,
    response,
    menu: { tests: Number(menu[0]?.tests ?? 0) },
    noUnit: noUnit.length,
    profiles: {
      inUse: Number(profiles.find((p) => p.state === "in_use")?.n ?? 0),
      drafts: Number(profiles.find((p) => p.state === "draft")?.n ?? 0),
    },
    analysers: Number(analysers[0]?.n ?? 0),
    partners: Number(partners[0]?.n ?? 0),
    connections: {
      live: connections.filter((c) => c.state === "active").length,
      retrying: connections.filter((c) => c.state === "active" && c.retryingSince).length,
    },
    demoLoads: demo.length,
  };
  return { queue, facts };
}
