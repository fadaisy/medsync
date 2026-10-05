"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  assignRole,
  decideDefinition,
  decideGoLive,
  proposeDefinition,
  requestGoLive,
  revokeRole,
  setConditionEnabled,
  settingsPatch,
  updateSettings,
} from "@/lib/ncdreg/admin";
import { fromDb, NcdError } from "@/lib/ncdreg/context";
import { continueLoad, removeAllSynthetic, turnOff, turnOn } from "@/lib/ncdreg/demo/service";
import { requireNcdScope } from "@/lib/ncdreg/scope";

export type AdminResult = { ok: true; message?: string; data?: Record<string, unknown> } | { ok: false; message: string };

async function act(fn: (ctx: Awaited<ReturnType<typeof requireNcdScope>>["ctx"]) => Promise<unknown>, done?: string): Promise<AdminResult> {
  const { ctx } = await requireNcdScope();
  try {
    const data = await fn(ctx);
    revalidatePath("/ncd", "layout");
    return { ok: true, message: done, data: data && typeof data === "object" ? (data as Record<string, unknown>) : undefined };
  } catch (e) {
    const err = e instanceof NcdError ? e : e instanceof z.ZodError ? new NcdError("invalid", e.issues[0]?.message ?? "Invalid") : fromDb(e);
    return { ok: false, message: err.message };
  }
}

const uuid = z.string().uuid();

export const setConditionAction = async (code: string, enabled: boolean, reason: string) =>
  act((ctx) => setConditionEnabled(ctx, z.string().max(60).parse(code), z.boolean().parse(enabled), z.string().trim().min(3).max(200).parse(reason)), "Saved.");
export const updateSettingsAction = async (patch: unknown) => act((ctx) => updateSettings(ctx, settingsPatch.parse(patch)), "Settings saved.");
export const proposeDefinitionAction = async (definitionId: string, payload: unknown) =>
  act((ctx) => proposeDefinition(ctx, z.string().max(60).parse(definitionId), z.record(z.string(), z.unknown()).parse(payload)), "Proposed. A second person approves it.");
export const decideDefinitionAction = async (id: string, approve: boolean) => act((ctx) => decideDefinition(ctx, uuid.parse(id), z.boolean().parse(approve)));
export const assignRoleAction = async (userId: string, role: string) =>
  act((ctx) => assignRole(ctx, uuid.parse(userId), z.enum(["registry_lead", "head_of_department", "auditor"]).parse(role)), "Role assigned.");
export const revokeRoleAction = async (id: string) => act((ctx) => revokeRole(ctx, uuid.parse(id)), "Role revoked.");
export const requestGoLiveAction = async (note: string) => act((ctx) => requestGoLive(ctx, z.string().max(500).parse(note) || null), "Go-live requested.");
export const decideGoLiveAction = async (id: string, approve: boolean) => act((ctx) => decideGoLive(ctx, uuid.parse(id), z.boolean().parse(approve)));
export const demoOnAction = async (mode: string) => act((ctx) => turnOn(ctx, z.enum(["scenario", "full_clinic"]).parse(mode)));
export const demoContinueAction = async () => act((ctx) => continueLoad(ctx, 20_000));
export const demoOffAction = async (confirmed: boolean) => act((ctx) => turnOff(ctx, z.boolean().parse(confirmed)), "Demo data removed.");
export const removeAllSyntheticAction = async () => act((ctx) => removeAllSynthetic(ctx), "Every synthetic record was removed.");
