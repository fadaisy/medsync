import type { WardLayout } from "@/supabase/functions/_shared/ward-layout";
import { z } from "zod";

import { buildLayoutSchema } from "@/supabase/functions/_shared/ward-layout";

export type {
  LayoutBed,
  LayoutDivider,
  LayoutDoor,
  LayoutFixture,
  LayoutRoom,
  RoomFeatures,
  WardLayout,
} from "@/supabase/functions/_shared/ward-layout";

/**
 * The ward layout document (ADR 0191) as a Zod type. The schema itself is built in
 * supabase/functions/_shared/ward-layout.ts from the caller's Zod, so ha-services-hub (Deno, npm:zod)
 * and the app (Node, zod) validate with the same rules, cross-field ones included.
 */
export const WardLayoutSchema: z.ZodType<WardLayout> = buildLayoutSchema(z);

/** Parse a stored or sent document; the first problem in words when it doesn't fit. */
export function parseLayout(
  raw: unknown,
): { ok: true; doc: WardLayout } | { ok: false; error: string } {
  const r = WardLayoutSchema.safeParse(raw);
  return r.success
    ? { ok: true, doc: r.data }
    : { ok: false, error: r.error.issues[0]?.message ?? "The layout doesn't fit its schema." };
}
