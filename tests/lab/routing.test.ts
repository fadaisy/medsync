import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A lab technician or technologist lands on /lab: sign-in routes the lab cadres with the shared
 * constant (role or affiliation), and /clinician sends any lab user on, the way it sends doctors.
 */
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("lab staff are routed to /lab", () => {
  it("sign-in routes the lab role and the lab cadres with the shared constant", () => {
    const signIn = read("app/(auth)/sign-in/landing.ts");
    expect(signIn).toMatch(/import \{ LAB_TECH_CADRE_CODES \} from "@\/lib\/lab-tech\/scope"/);
    expect(signIn).not.toMatch(/"LAB_TECHNOLOGIST"/);
    // The decision itself is the pure resolver's (tests/lab/landing.test.ts); here, the loader
    // classifies the lab cadres with the shared constant and hands ?redirect= to the resolver.
    expect(signIn).toMatch(
      /LAB_TECH_CADRE_CODES as readonly string\[\]\)\.includes\(code\)\) return "lab"/,
    );
    expect(signIn).toMatch(/resolveLanding\(facts, next\)/);
  });

  it("LD-5: /clinician sends a lab user to /lab with the gate's own query", () => {
    expect(read("app/clinician/layout.tsx")).toMatch(
      /if \(await isLabTechUser\(scope\.userId\)\) redirect\("\/lab"\)/,
    );
    expect(read("lib/lab-tech/scope.ts")).toMatch(
      /export async function isLabTechUser[\s\S]*findLabTechAffiliation\(userId\)/,
    );
  });
});

describe("the authenticator-code step lands like the password step", () => {
  it("both steps pass ?redirect= through the shared landingFor, never a bare '/'", () => {
    for (const f of ["app/(auth)/sign-in/actions.ts", "app/(auth)/sign-in/mfa/actions.ts"]) {
      expect(read(f), f).toMatch(/import \{ landingFor \} from "\.{1,2}\/landing"/);
      expect(read(f), f).toMatch(/landingFor\([^)]*parsed\.data\.redirect\)/);
    }
  });
});
