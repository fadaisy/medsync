import type { CommandType } from "../commands/schema";

import { ONLINE_ONLY } from "../commands/schema";
import { getSealed, idbDel, idbGet, idbKeys, idbPut, putSealed } from "./store";

/**
 * The outbox (§9, B5, ADR 0210). Every capture write becomes a command with a client UUID, queued
 * encrypted in IndexedDB, and sent in order per patient. The server applies each command once, so a
 * resend after a lost response is harmless. Failures back off; a command the server refuses for
 * good (or that names a removed demo patient) is discarded with a visible note, never retried
 * forever and never dropped silently. Death, transfer, merge and approvals are online-only.
 */

export type QueuedCommand = {
  id: string;
  type: CommandType;
  payload: Record<string, unknown> & { personId?: string };
  clientTs: string;
};
type Meta = { seq: number; personKey: string; attempts: number; nextAttemptAt: number };
export type SendResult =
  | { ok: true }
  | { ok: false; retry: true } // network, timeout, 5xx: try again later
  | { ok: false; retry: false; message: string }; // refused for good
export type Note = { id: string; type: CommandType; message: string; at: string };

const BACKOFF_MS = (n: number) => Math.min(2 ** n * 2000, 5 * 60_000);

export class Outbox {
  constructor(
    private db: IDBDatabase,
    private send: (c: QueuedCommand) => Promise<SendResult>,
    private now: () => number = () => Date.now(),
  ) {}

  async enqueue(c: QueuedCommand): Promise<void> {
    if (ONLINE_ONLY.has(c.type)) throw new Error("This action needs a connection.");
    const seq = ((await idbGet<number>(this.db, "meta", "seq")) ?? 0) + 1;
    await idbPut(this.db, "meta", "seq", seq);
    const meta: Meta = { seq, personKey: c.payload.personId ?? "_", attempts: 0, nextAttemptAt: 0 };
    await putSealed(this.db, "outbox", c.id, { c, meta });
  }

  async items(): Promise<{ c: QueuedCommand; meta: Meta }[]> {
    const keys = (await idbKeys(this.db, "outbox")) as string[];
    const all = await Promise.all(
      keys.map((k) => getSealed<{ c: QueuedCommand; meta: Meta }>(this.db, "outbox", k)),
    );
    return all
      .filter((x): x is { c: QueuedCommand; meta: Meta } => !!x)
      .sort((a, b) => a.meta.seq - b.meta.seq);
  }

  async waiting(): Promise<number> {
    return (await idbKeys(this.db, "outbox")).length;
  }

  async lastSync(): Promise<string | null> {
    return (await idbGet<string>(this.db, "meta", "lastSync")) ?? null;
  }

  async notes(): Promise<Note[]> {
    const keys = (await idbKeys(this.db, "notes")) as string[];
    return (await Promise.all(keys.map((k) => getSealed<Note>(this.db, "notes", k)))).filter(
      (n): n is Note => !!n,
    );
  }

  /**
   * Send what is due, oldest first, one patient's commands strictly in order: a patient whose head
   * command is waiting on a retry holds the rest of that patient's queue.
   */
  async flush(): Promise<{ sent: number; failed: number; discarded: number }> {
    const blocked = new Set<string>();
    let sent = 0;
    let failed = 0;
    let discarded = 0;
    for (const item of await this.items()) {
      const { c, meta } = item;
      if (blocked.has(meta.personKey)) continue;
      if (meta.nextAttemptAt > this.now()) {
        blocked.add(meta.personKey);
        continue;
      }
      let r: SendResult;
      try {
        r = await this.send(c);
      } catch {
        r = { ok: false, retry: true };
      }
      if (r.ok) {
        await idbDel(this.db, "outbox", c.id);
        sent++;
      } else if (r.retry) {
        meta.attempts++;
        meta.nextAttemptAt = this.now() + BACKOFF_MS(meta.attempts);
        await putSealed(this.db, "outbox", c.id, { c, meta });
        blocked.add(meta.personKey);
        failed++;
      } else {
        await idbDel(this.db, "outbox", c.id);
        await putSealed(this.db, "notes", c.id, {
          id: c.id,
          type: c.type,
          message: r.message,
          at: new Date(this.now()).toISOString(),
        } satisfies Note);
        discarded++;
      }
    }
    if (sent || discarded)
      await idbPut(this.db, "meta", "lastSync", new Date(this.now()).toISOString());
    return { sent, failed, discarded };
  }
}
