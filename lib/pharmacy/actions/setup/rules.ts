import "server-only";

import type { PharmacyActor } from "@/lib/pharmacy/write";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { RULE_REGISTRY } from "@/content/pharmacy-rules";
import { EmrWriteError } from "@/lib/emr/write/context";
import { rowsOf } from "@/lib/pharmacy/audit/read";
import { permissionsFor } from "@/lib/pharmacy/medicines/read";
import { MED_NEED } from "@/lib/pharmacy/medicines/store";
import { runPharmacyWrite } from "@/lib/pharmacy/write";

/**
 * Set-up › Rules (SETUP-TABS §C). Changing a rule is `proposeRegistryRule`; signing and withdrawing are the Medicines
 * actions (by proposal id). This adds a new rule, rejecting with a note, and signing a whole group (0274).
 */
const GROUPS = RULE_REGISTRY.map((g) => g.key) as [string, ...string[]];

export const NewRuleInput = z.object({
  clientKey: z.uuid(),
  group: z.enum(GROUPS),
  name: z.string().trim().min(2, "Give the rule a name.").max(80),
  text: z.string().trim().min(2, "Type what the rule says.").max(400),
  appliesTo: z.string().trim().max(120),
  reason: z.string().trim().min(2, "Say why.").max(300),
});
/** A new rule waits for the same two signatures; it is added only when both are in. */
export const proposeNewRule = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(NewRuleInput, raw, actor, MED_NEED, async (ctx, i) => {
    if (!permissionsFor(ctx.actor, ctx.manages).propose)
      throw new EmrWriteError("forbidden", "Not allowed.");
    await ctx.tx
      .execute(sql`INSERT INTO public.pharmacy_rule_proposals (id, hospital_id, rule_group, key, old_text,
        new_text, reason, proposed_by, kind, name, applies_to)
      VALUES (${i.clientKey}::uuid, ${ctx.actor.hospitalId}::uuid, ${i.group}, ${`new_${i.clientKey.slice(0, 8)}`}, NULL,
        ${i.text}, ${i.reason}, ${ctx.actor.userId}::uuid, 'new', ${i.name}, ${i.appliesTo || null})
      ON CONFLICT DO NOTHING`);
    return { id: i.clientKey };
  });

export const RejectInput = z.object({
  id: z.uuid(),
  note: z.string().trim().min(2, "Say why.").max(300),
});
/** Either signer rejects; the note stays in the history. */
export const rejectProposal = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(RejectInput, raw, actor, MED_NEED, async (ctx, i) => {
    const c = permissionsFor(ctx.actor, ctx.manages);
    if (!c.signInCharge && !c.signSecond) throw new EmrWriteError("forbidden", "Not allowed.");
    const r = rowsOf(
      await ctx.tx
        .execute(sql`UPDATE public.pharmacy_rule_proposals SET status = 'rejected', closed_at = now(),
          reject_note = ${i.note}, rejected_by = ${ctx.actor.userId}::uuid
        WHERE id = ${i.id}::uuid AND hospital_id = ${ctx.actor.hospitalId}::uuid AND status = 'pending' RETURNING id`),
    );
    if (!r.length) throw new EmrWriteError("conflict", "That proposal is closed.");
    return { id: i.id };
  });

export const GroupSignInput = z.object({
  group: z.enum(GROUPS),
  role: z.enum(["in_charge", "second"]),
});
/** Signs the group as it stands; the database refuses the same person twice. */
export const signGroup = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(GroupSignInput, raw, actor, MED_NEED, async (ctx, i) => {
    const c = permissionsFor(ctx.actor, ctx.manages);
    if (i.role === "in_charge" ? !c.signInCharge : !c.signSecond)
      throw new EmrWriteError("forbidden", "Not allowed.");
    const r = rowsOf(
      await ctx.tx
        .execute(sql`INSERT INTO public.pharmacy_rule_group_signatures (hospital_id, group_key, role, signed_by)
        VALUES (${ctx.actor.hospitalId}::uuid, ${i.group}, ${i.role}, ${ctx.actor.userId}::uuid)
        ON CONFLICT DO NOTHING RETURNING group_key`),
    );
    if (!r.length) throw new EmrWriteError("conflict", "That signature is already in.");
    return { id: i.group };
  });
