"use server";

import type { CommandResult } from "@/lib/ncdreg/commands/apply";
import type { IdentityFacts, TieredCandidate } from "@/lib/ncdreg/identity";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { applyCommand } from "@/lib/ncdreg/commands/apply";
import { fromDb, NcdError } from "@/lib/ncdreg/context";
import { identities, revealPhone } from "@/lib/ncdreg/read/views";
import { requireNcdScope } from "@/lib/ncdreg/scope";
import { searchPersons } from "@/lib/ncdreg/search";

/**
 * The one capture endpoint (§9): the client outbox sends every command here. The server stamps its
 * own receipt time; the client timestamp is stored apart and never becomes the entry time.
 */
export async function runCommand(envelope: unknown): Promise<CommandResult> {
  const { ctx } = await requireNcdScope();
  const r = await applyCommand(ctx, envelope);
  if (r.ok) revalidatePath("/ncd", "layout");
  return r;
}

export type SearchResult = {
  token: string;
  candidates: (TieredCandidate & {
    name: string;
    registryNumber: string;
    age: number;
    sex: string;
  })[];
};

/** A1: the search that must precede a new record; the token it returns unlocks person.enrol. */
const short = z.string().trim().max(80);
const identityFacts = z.object({
  givenName: short,
  familyName: short,
  sex: z.enum(["female", "male"]).nullable(),
  birthYear: z.number().int().min(1900).max(2100).nullable(),
  phones: z.array(z.string().max(30).nullable()).max(2),
  hospitalNumber: z.string().max(40).nullable(),
  nationalId: z.string().max(20).nullable(),
}) satisfies z.ZodType<IdentityFacts>;

export async function searchAction(raw: IdentityFacts): Promise<SearchResult> {
  const { ctx } = await requireNcdScope();
  const typed = identityFacts.parse(raw);
  const r = await searchPersons(ctx, typed);
  const ids = await identities(
    ctx,
    r.candidates.map((c) => c.personId),
  );
  return {
    token: r.token,
    candidates: r.candidates.map((c) => {
      const i = ids.get(c.personId)!;
      return { ...c, name: i.name, registryNumber: i.registryNumber, age: i.age, sex: i.sex };
    }),
  };
}

export async function revealPhoneAction(personId: string, slot: 1 | 2) {
  const { ctx } = await requireNcdScope();
  try {
    const args = z
      .object({ personId: z.string().uuid(), slot: z.union([z.literal(1), z.literal(2)]) })
      .parse({ personId, slot });
    return { ok: true as const, value: await revealPhone(ctx, args.personId, args.slot) };
  } catch (e) {
    const err = e instanceof NcdError ? e : fromDb(e);
    return { ok: false as const, message: err.message };
  }
}

/** The device's offline read cache (§9), refreshed while online. */
export async function offlineSnapshotAction() {
  const { ctx } = await requireNcdScope();
  const { offlineSnapshot } = await import("@/lib/ncdreg/read/offline");
  return offlineSnapshot(ctx);
}

/** Patient search by POST, never a name in a URL (§8.2). */
export async function patientSearchAction(q: string) {
  const { ctx } = await requireNcdScope();
  const { patientSearch } = await import("@/lib/ncdreg/read/views");
  return patientSearch(ctx, z.string().max(80).parse(q));
}
