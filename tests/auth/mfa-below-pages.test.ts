import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Review C-2: 0288 put a RESTRICTIVE `mfa_gate` policy on every RLS table that existed then. A later migration that
// turns RLS on for a new table must give it the same policy, or staff reach that table without MFA.
const dir = join(process.cwd(), "supabase/migrations");
const read = (f: string) => readFileSync(join(dir, f), "utf8");

describe("every table that gets RLS after 0288 gets the MFA gate", () => {
  const later = readdirSync(dir).filter(
    (f) => /^\d{4}_.*\.sql$/.test(f) && Number(f.slice(0, 4)) > 288,
  );
  const all = later.map(read).join("\n");
  // The gate may come in a later migration when the first is already applied (0293 → 0294).
  const tables = later.flatMap((f) =>
    [...read(f).matchAll(/((?:public|pharmacy_practice)\.\w+)\s+ENABLE ROW LEVEL SECURITY/gi)].map(
      (m) => `${f} ${m[1]}`,
    ),
  );

  it.each(tables.length ? tables : ["(none yet)"])("%s", (row) => {
    if (row === "(none yet)") return;
    const table = row.split(" ")[1]!.replace(".", "\\.");
    expect(all).toMatch(
      new RegExp(`CREATE POLICY mfa_gate ON ${table} AS RESTRICTIVE[\\s\\S]*?caller_mfa_ok\\(\\)`),
    );
  });
});

describe("the layers below the pages ask the same question", () => {
  it("0288 defines the rule and the gate", () => {
    const sql = read("0288_mfa_below_the_pages.sql");
    expect(sql).toMatch(/FUNCTION public\.caller_mfa_ok\(\)/);
    expect(sql).toMatch(/AS RESTRICTIVE FOR ALL TO authenticated/);
  });

  it("getCaller refuses when caller_mfa_ok is not true", () => {
    const src = readFileSync(join(process.cwd(), "supabase/functions/_shared/auth.ts"), "utf8");
    expect(src).toMatch(/rpc\("caller_mfa_ok"\)/);
    expect(src).toMatch(/if \(mfaOk !== true\) return null;/);
  });

  it("CORS has no wildcard host", () => {
    const src = readFileSync(join(process.cwd(), "supabase/functions/_shared/cors.ts"), "utf8");
    expect(src).not.toMatch(/endsWith\(/);
  });

  it("no cron route compares its secret with !==", () => {
    const cron = join(process.cwd(), "app/api/cron");
    for (const d of readdirSync(cron)) {
      const src = readFileSync(join(cron, d, "route.ts"), "utf8");
      expect(src, d).not.toMatch(/!==\s*(env\.CRON_SECRET|`Bearer)/);
    }
  });
});
