"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { fromDb, NcdError } from "@/lib/ncdreg/context";
import { approveRelease, requestRelease } from "@/lib/ncdreg/exchange";
import { legacyApply, legacyDryRun } from "@/lib/ncdreg/exchange/legacy";
import { requireNcdScope } from "@/lib/ncdreg/scope";

type R<T> = { ok: true; data: T } | { ok: false; message: string };
async function act<T>(fn: (ctx: Awaited<ReturnType<typeof requireNcdScope>>["ctx"]) => Promise<T>): Promise<R<T>> {
  const { ctx } = await requireNcdScope();
  try {
    const data = await fn(ctx);
    revalidatePath("/ncd/exchange");
    return { ok: true, data };
  } catch (e) {
    return { ok: false, message: (e instanceof NcdError ? e : fromDb(e)).message };
  }
}

export const requestReleaseAction = async (note: string) => act((ctx) => requestRelease(ctx, "research_extract", z.string().max(500).parse(note)).then((r) => ({ id: r.id })));
export const approveReleaseAction = async (id: string, reference: string) => act((ctx) => approveRelease(ctx, z.string().uuid().parse(id), z.string().max(200).parse(reference)).then(() => ({})));
export const legacyDryRunAction = async (csv: string) => act((ctx) => legacyDryRun(ctx, z.string().max(2_000_000).parse(csv)));
export const legacyApplyAction = async (csv: string) => act((ctx) => legacyApply(ctx, z.string().max(2_000_000).parse(csv)));
