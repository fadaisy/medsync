import "server-only";

import type { PharmacyActor } from "@/lib/pharmacy/write";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { ROSTER_RULE_GROUPS } from "@/content/pharmacy-roster";
import { RULE_REGISTRY } from "@/content/pharmacy-rules";
import { EmrWriteError } from "@/lib/emr/write/context";
import { rowsOf } from "@/lib/pharmacy/audit/read";
import { permissionsFor } from "@/lib/pharmacy/medicines/read";
import { MED_NEED } from "@/lib/pharmacy/medicines/store";
import { ruleNumbers, ruleText, validateParam } from "@/lib/pharmacy/rules/registry";
import { runPharmacyWrite } from "@/lib/pharmacy/write";

/**
 * Propose a change to a registry rule (SETUP-TABS §C3): a number for a parameter rule (the proposal carries
 * `params.n`; the second signature copies it, 0273), or new wording for a text rule. People's rule badges (`rb_*`,
 * PEOPLE-ROSTER §11) are text rules by line. Signing and withdrawing reuse the Medicines actions (by proposal id).
 */
export const ProposeRegistryInput = z.object({
  clientKey: z.uuid(),
  group: z.string().regex(/^[a-z_]{2,40}$/),
  key: z.string().min(1).max(120),
  n: z.number().finite().nullable(),
  newText: z.string().trim().min(2).max(400).nullable(),
  reason: z.string().trim().min(2).max(300),
});

const badgeDefault = (group: string, key: string) =>
  ROSTER_RULE_GROUPS.find((g) => `rb_${g.id}` === group)?.rules[Number(key)]?.text ?? null;

export const proposeRegistryRule = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(ProposeRegistryInput, raw, actor, MED_NEED, async (ctx, i) => {
    if (!permissionsFor(ctx.actor, ctx.manages).propose)
      throw new EmrWriteError("forbidden", "Not allowed.");
    const h = ctx.actor.hospitalId;
    const signed = rowsOf<{
      rule_group: string;
      key: string;
      text: string;
      params: { n?: number } | null;
    }>(
      await ctx.tx.execute(sql`SELECT rule_group, key, text, params FROM public.pharmacy_rules
        WHERE hospital_id = ${h}::uuid AND rule_group = ${i.group} AND key = ${i.key}`),
    );
    const badge = ROSTER_RULE_GROUPS.some((g) => `rb_${g.id}` === i.group);
    if (!badge && !RULE_REGISTRY.some((g) => g.key === i.group))
      throw new EmrWriteError("invalid", "Unknown rule group.");
    const rule = RULE_REGISTRY.find((g) => g.key === i.group)?.rules.find((r) => r.key === i.key);
    let newText: string;
    let params: { n: number } | null = null;
    let old: string | null;
    if (rule?.param) {
      const cur = ruleNumbers(signed)(i.group, i.key);
      const bad = i.n === null ? "nan" : validateParam(String(i.n), rule.param, cur);
      if (bad)
        throw new EmrWriteError(
          "invalid",
          bad === "same" ? "That is the current value." : "Type a number.",
        );
      params = { n: i.n! };
      newText = ruleText(rule, i.n!);
      old = ruleText(rule, cur);
    } else {
      old = signed[0]?.text ?? rule?.text ?? badgeDefault(i.group, i.key);
      // A badge line past the defaults is "+ Add a rule here": no old text.
      if (!i.newText || (old === null && !badge))
        throw new EmrWriteError("invalid", "Type the new wording.");
      if (old?.trim() === i.newText)
        throw new EmrWriteError("invalid", "That is the current wording.");
      newText = i.newText;
    }
    const r = rowsOf<{ id: string }>(
      await ctx.tx
        .execute(sql`INSERT INTO public.pharmacy_rule_proposals (id, hospital_id, rule_group, key, old_text,
          new_text, reason, proposed_by, params)
        VALUES (${i.clientKey}::uuid, ${h}::uuid, ${i.group}, ${i.key}, ${old}, ${newText}, ${i.reason},
          ${ctx.actor.userId}::uuid, ${params ? JSON.stringify(params) : null}::jsonb)
        ON CONFLICT DO NOTHING RETURNING id`),
    );
    if (!r.length)
      throw new EmrWriteError(
        "conflict",
        "A change to this rule is already waiting for signatures.",
      );
    return { id: r[0]!.id };
  });
