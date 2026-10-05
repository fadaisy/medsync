/**
 * Engine helpers on the PGlite lane: a context for any facility user, and one-line command calls.
 * Every person is synthetic (no facility here is approved for patient data unless a test approves it).
 */
import { randomUUID } from "node:crypto";
import type { NcdFacility } from "./_ncd";
import type { NcdRole, Principal } from "@/lib/ncdreg/capabilities";
import type { CommandResult } from "@/lib/ncdreg/commands/apply";
import type { CommandType, Payload } from "@/lib/ncdreg/commands/schema";
import type { NcdContext } from "@/lib/ncdreg/context";
import type { NcdDb } from "@/lib/ncdreg/db";
import type { ConditionModule } from "@/lib/ncdreg/standard/types";
import { expect } from "vitest";

import { generateKey } from "@/lib/encryption";
import { applyCommand } from "@/lib/ncdreg/commands/apply";
import { resolveContext } from "@/lib/ncdreg/context";
import { searchPersons } from "@/lib/ncdreg/search";

process.env.MEDSYNC_PHI_KEY ??= generateKey();

export async function ctxFor(
  db: NcdDb,
  f: NcdFacility,
  who: NcdRole | { userId: string | null },
  o: {
    at?: string;
    principal?: Principal;
    catalogue?: readonly ConditionModule[];
    demoLoadId?: string;
  } = {},
): Promise<NcdContext> {
  const userId = typeof who === "string" ? f.users[who] : who.userId;
  return resolveContext(
    { userId, facilityId: f.facilityId, principal: o.principal ?? "user" },
    {
      db,
      enteredAt: o.at ? new Date(o.at) : new Date("2026-10-05T09:00:00+03:00"),
      catalogue: o.catalogue,
      demoLoadId: o.demoLoadId,
    },
  );
}

export async function run<T extends CommandType>(
  ctx: NcdContext,
  type: T,
  payload: Payload<T> | Record<string, unknown>,
  id: string = randomUUID(),
) {
  return applyCommand(ctx, { id, type, payload, clientTs: null });
}

export async function ok<T extends CommandType>(
  ctx: NcdContext,
  type: T,
  payload: Payload<T> | Record<string, unknown>,
  id?: string,
) {
  const r = await run(ctx, type, payload, id);
  if (!r.ok) throw new Error(`${type}: ${r.code} ${r.message} ${JSON.stringify(r.detail ?? {})}`);
  return r.result;
}

export function refused(r: CommandResult, code?: string) {
  expect(r.ok, JSON.stringify(r)).toBe(false);
  if (code && !r.ok) expect(r.code).toBe(code);
}

/** Random letters: unrelated names, so the duplicate check (A2) stays quiet unless a test wants it. */
export const randomName = () =>
  [...randomUUID().replace(/[^0-9a-f]/g, "")]
    .slice(0, 9)
    .map((c) => String.fromCharCode(97 + ((parseInt(c, 16) + Math.floor(Math.random() * 10)) % 26)))
    .join("");

export type PersonSeed = {
  given?: string;
  family?: string;
  sex?: "female" | "male";
  ageYears?: number;
  phone?: string | null;
  conditions?: { condition: string; subtype?: string; basis?: string; registrationDate?: string }[];
  heightCm?: number;
};

/** Enrol a synthetic person through the real path (search, then person.enrol). */
export async function enrol(ctx: NcdContext, s: PersonSeed = {}) {
  const personId = randomUUID();
  const identity = {
    givenName: s.given ?? randomName(),
    familyName: s.family ?? randomName(),
    sex: s.sex ?? "female",
    ageYears: s.ageYears ?? 50,
    phone1: s.phone === undefined ? null : s.phone,
  };
  const { token } = await searchPersons(ctx, {
    givenName: identity.givenName,
    familyName: identity.familyName,
    sex: identity.sex,
    birthYear: null,
    phones: [identity.phone1],
    hospitalNumber: null,
    nationalId: null,
  });
  const regs = (s.conditions ?? [{ condition: "hypertension" }]).map((c) => ({
    registrationId: randomUUID(),
    condition: c.condition,
    subtype:
      c.subtype ??
      (c.condition === "hypertension"
        ? "primary"
        : c.condition === "diabetes"
          ? "type_2"
          : "unknown"),
    diagnosisYear: 2020,
    basisOfDiagnosis: c.basis ?? "unknown",
    registrationDate: c.registrationDate ?? null,
  }));
  await ok(ctx, "person.enrol", {
    personId,
    searchToken: token,
    identity,
    registrations: regs,
    baseline: { heightCm: s.heightCm ?? 165, knownCvd: [] },
    privacy: { version: "0.1-draft", acknowledged: true },
    smsAllowed: true,
    callsAllowed: true,
    isSynthetic: true,
    dismissedCandidates: [],
    confirmations: [],
  });
  return { personId, registrations: regs };
}

export async function enableModule(
  pgQuery: (s: string, p?: unknown[]) => Promise<unknown>,
  facilityId: string,
  m: ConditionModule,
  enabled = true,
) {
  await pgQuery(
    `INSERT INTO public.ncd_condition_setting (facility_id, condition_code, enabled, module_level, module_status, module_version, version)
     VALUES ($1, $2, $3, $4, $5, $6, coalesce((SELECT max(version) FROM public.ncd_condition_setting WHERE facility_id = $1 AND condition_code = $2), 0) + 1)`,
    [facilityId, m.code, enabled, m.level, m.status, m.version],
  );
}
