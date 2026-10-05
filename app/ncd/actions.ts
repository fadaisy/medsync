"use server";

import { revalidatePath } from "next/cache";

import { applyCommand, type CommandResult } from "@/lib/ncdreg/commands/apply";
import { fromDb, NcdError } from "@/lib/ncdreg/context";
import type { IdentityFacts, TieredCandidate } from "@/lib/ncdreg/identity";
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
  candidates: (TieredCandidate & { name: string; registryNumber: string; age: number; sex: string })[];
};

/** A1: the search that must precede a new record; the token it returns unlocks person.enrol. */
export async function searchAction(typed: IdentityFacts): Promise<SearchResult> {
  const { ctx } = await requireNcdScope();
  const r = await searchPersons(ctx, typed);
  const ids = await identities(ctx, r.candidates.map((c) => c.personId));
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
    return { ok: true as const, value: await revealPhone(ctx, personId, slot) };
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
