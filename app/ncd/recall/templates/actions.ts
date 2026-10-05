"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { fromDb } from "@/lib/ncdreg/context";
import { approveTemplate, saveTemplateBody, submitTemplate } from "@/lib/ncdreg/recall/templates";
import { requireNcdScope } from "@/lib/ncdreg/scope";

export type TemplateActionResult = { ok: true } | { ok: false; message: string };

const input = z.discriminatedUnion("op", [
  z.object({ op: z.literal("save"), id: z.string().uuid(), body: z.string().max(160) }),
  z.object({ op: z.literal("submit"), id: z.string().uuid() }),
  z.object({ op: z.literal("approve"), id: z.string().uuid() }),
]);

/** E5: save a draft, submit it for approval, or add one approval. Capabilities are checked in lib. */
export async function templateAction(raw: unknown): Promise<TemplateActionResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "A message is at most 160 characters." };
  const { ctx } = await requireNcdScope();
  try {
    const p = parsed.data;
    if (p.op === "save") await saveTemplateBody(ctx, p.id, p.body);
    else if (p.op === "submit") await submitTemplate(ctx, p.id);
    else await approveTemplate(ctx, p.id);
    revalidatePath("/ncd/recall", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: fromDb(e).message };
  }
}
