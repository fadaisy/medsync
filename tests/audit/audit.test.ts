import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { closeSql, serviceSql } from "../rls/_helpers";

interface AuditRow {
  id: string;
  action: string;
  schema_name: string;
  table_name: string;
  record_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
}

async function readAuditFor(tableName: string, recordId: string): Promise<AuditRow[]> {
  return (await serviceSql<AuditRow[]>`
    SELECT id::text, action, schema_name, table_name, record_id, before_data, after_data
    FROM public.audit_log
    WHERE table_name = ${tableName} AND record_id = ${recordId}
    ORDER BY id
  `) as unknown as AuditRow[];
}

describe("audit: log_changes trigger", () => {
  let hospitalId: string;
  let slug: string;

  beforeAll(async () => {
    slug = `audit-test-${Math.random().toString(36).slice(2, 8)}`;
  });

  afterAll(async () => {
    if (hospitalId) {
      // Best-effort cleanup — already deleted by the delete test.
      await serviceSql`DELETE FROM public.hospitals WHERE id = ${hospitalId}`.catch(
        () => undefined,
      );
    }
    // audit_log is append-only — DELETE raises. Leak the test rows.
  }, 30_000);

  test("INSERT into hospitals writes an 'insert' audit row", async () => {
    const [row] = await serviceSql<{ id: string }[]>`
      INSERT INTO public.hospitals (name, slug, level)
      VALUES (${"Audit Test Hospital"}, ${slug}, 'private')
      RETURNING id
    `;
    if (!row) throw new Error("insert failed");
    hospitalId = row.id;

    const audits = await readAuditFor("hospitals", hospitalId);
    expect(audits.length).toBe(1);
    expect(audits[0]?.action).toBe("insert");
    expect(audits[0]?.before_data).toBeNull();
    expect(audits[0]?.after_data?.slug).toBe(slug);
  });

  test("UPDATE on hospitals writes an 'update' audit row with before+after", async () => {
    await serviceSql`UPDATE public.hospitals SET region = 'Central' WHERE id = ${hospitalId}`;

    const audits = await readAuditFor("hospitals", hospitalId);
    const updates = audits.filter((a) => a.action === "update");
    expect(updates.length).toBeGreaterThanOrEqual(1);
    const last = updates.at(-1);
    expect(last?.before_data?.region).toBeNull();
    expect(last?.after_data?.region).toBe("Central");
  });

  test("DELETE on hospitals writes a 'delete' audit row with before", async () => {
    await serviceSql`DELETE FROM public.hospitals WHERE id = ${hospitalId}`;

    const audits = await readAuditFor("hospitals", hospitalId);
    const del = audits.find((a) => a.action === "delete");
    expect(del).toBeTruthy();
    expect(del?.before_data?.slug).toBe(slug);
    expect(del?.after_data).toBeNull();
  });
});

describe("audit: append-only protection on audit_log", () => {
  let auditRowId: string;

  beforeAll(async () => {
    const [row] = await serviceSql<{ id: string }[]>`
      INSERT INTO public.audit_log (action, schema_name, table_name, record_id)
      VALUES ('insert', 'public', 'audit_protection_test', ${`probe-${Math.random()}`})
      RETURNING id::text
    `;
    if (!row) throw new Error("seed failed");
    auditRowId = row.id;
  });

  // No afterAll — append-only audit log means we leak the probe row. That's
  // the intended behaviour: production audit data never gets deleted by tests.

  test("UPDATE on audit_log raises (BEFORE trigger blocks)", async () => {
    await expect(
      serviceSql`UPDATE public.audit_log SET action = 'tampered' WHERE id = ${auditRowId}`,
    ).rejects.toThrow(/append-only/i);
  });

  test("DELETE on audit_log raises (BEFORE trigger blocks)", async () => {
    await expect(serviceSql`DELETE FROM public.audit_log WHERE id = ${auditRowId}`).rejects.toThrow(
      /append-only/i,
    );
  });

  test("audit row survives both attempts", async () => {
    const [row] = await serviceSql<{ id: string }[]>`
      SELECT id::text FROM public.audit_log WHERE id = ${auditRowId}
    `;
    expect(row?.id).toBe(auditRowId);
  });
});

afterAll(async () => {
  await closeSql();
}, 30_000);
