/**
 * The one command path (§9, ADR 0211). A command is applied once: replaying its id is a no-op that
 * returns the original result. The command, its handler and its log row share one transaction under
 * medsync_ncd_app, so a failed command leaves nothing behind and can be retried.
 */
import "server-only";

import type { NcdContext } from "../context";
import type { NcdTx } from "../db";
import type { CommandType, Payload } from "./schema";
import { eq } from "drizzle-orm";

import { ncdCommandLog } from "@/db/schema";
import { NcdError } from "../context";
import { withNcd } from "../db";
import * as h from "./handlers";
import { commandEnvelope, COMMANDS } from "./schema";

type Handler<T extends CommandType> = (
  tx: NcdTx,
  ctx: NcdContext,
  p: Payload<T>,
) => Promise<Record<string, unknown>>;

const HANDLERS: { [T in CommandType]: Handler<T> } = {
  "person.enrol": h.enrol,
  "registration.add": h.addRegistration,
  "person.update": h.updatePerson,
  "person.flag_phone": h.flagPhone,
  "visit.arrive": (tx, ctx, p) => h.arrive(tx, ctx, p),
  "visit.save_nurse": h.saveNurse,
  "visit.start_clinician": h.startClinician,
  "visit.save_clinician": h.saveClinician,
  "visit.close": h.closeVisit,
  "visit.record": h.recordVisit,
  "visit.add_lab": h.addLab,
  "visit.mark_invalid": h.markVisitInvalid,
  "review.save": h.saveReview,
  "event.record": h.recordEvent,
  "call.log": h.logCall,
  "merge.request": h.requestMerge,
  "merge.decide": h.decideMerge,
  "query.resolve": h.resolveQuery,
};

export type CommandResult =
  | { ok: true; replayed: boolean; result: Record<string, unknown> }
  | {
      ok: false;
      code: NcdError["code"] | "error";
      message: string;
      detail?: Record<string, unknown>;
    };

/** Postgres refusals (policy, trigger interlock) arrive as errors; name them for the client. */
function fromDbError(e: unknown): CommandResult {
  const err = e as { code?: string; message?: string; cause?: { code?: string; message?: string } };
  const code = err.cause?.code ?? err.code;
  const message = err.cause?.message ?? err.message ?? "Error";
  if (code === "42501")
    return { ok: false, code: "forbidden", message: message.replace(/^ncd: /, "") };
  if (code === "23514")
    return { ok: false, code: "interlock", message: message.replace(/^ncd: /, "") };
  return { ok: false, code: "error", message };
}

export async function applyCommand(ctx: NcdContext, raw: unknown): Promise<CommandResult> {
  const env = commandEnvelope.safeParse(raw);
  if (!env.success)
    return {
      ok: false,
      code: "invalid",
      message: env.error.issues[0]?.message ?? "Invalid command",
    };
  const { id, type, clientTs } = env.data;
  const parsed = COMMANDS[type].safeParse(env.data.payload);
  if (!parsed.success)
    return {
      ok: false,
      code: "invalid",
      message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  const payload = parsed.data as { personId?: string };
  try {
    return await withNcd(
      ctx,
      "app",
      async (tx) => {
        const [prior] = await tx
          .select()
          .from(ncdCommandLog)
          .where(eq(ncdCommandLog.commandId, id));
        if (prior) {
          if (prior.type !== type || prior.personId !== (payload.personId ?? null))
            throw new NcdError("conflict", "This command id was used for another command.");
          return { ok: true as const, replayed: true, result: prior.result };
        }
        const result = await (HANDLERS[type] as Handler<CommandType>)(
          tx,
          ctx,
          parsed.data as Payload<CommandType>,
        );
        await tx.insert(ncdCommandLog).values({
          commandId: id,
          facilityId: ctx.facilityId,
          personId: payload.personId ?? null,
          type,
          principal: ctx.principal,
          userId: ctx.userId,
          // §9: the client timestamp is kept apart and never becomes the entry time.
          clientTs: clientTs ? new Date(clientTs) : null,
          enteredAt: ctx.enteredAt,
          result,
          demoLoadId: ctx.principal === "demo_loader" ? ctx.demoLoadId : null,
        });
        return { ok: true as const, replayed: false, result };
      },
      ctx.db,
    );
  } catch (e) {
    if (e instanceof NcdError)
      return { ok: false, code: e.code, message: e.message, detail: e.detail };
    return fromDbError(e);
  }
}
