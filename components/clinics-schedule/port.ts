/**
 * Where the workspace's writes go (as the desk and the floor): the server actions live, memory on the styleguide
 * fixture. Drafts also sit in the encrypted device queue (slot `cs-drafts`, D-CS-15) so a lost connection never
 * loses work; publishing needs a connection.
 */
import type { Band, Change } from "@/lib/clinics-schedule/model";

import { pairCode } from "@/lib/clinics-schedule/model";
import { readQueue, writeQueue } from "@/lib/reception/desk/queue";

export type PortResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };
export type When = "now" | "tonight" | "tomorrow";

export interface CsPort {
  saveChange(ch: Change): Promise<PortResult>;
  /** Removes these drafts (an undo takes every later one with it). */
  undo(ids: string[]): Promise<PortResult>;
  publish(
    ids: string[],
    when: When,
  ): Promise<PortResult<{ version?: number; texts?: number; runAt?: string }>>;
  cancelSchedule(): Promise<PortResult>;
  publishEarly(): Promise<PortResult<{ version: number }>>;
  /** P7: at once, audited; resuming goes through publish. */
  pause(clinicId: string): Promise<PortResult>;
  addDevice(
    kind: "desk" | "tablet" | "screen",
    name: string,
    place: string,
  ): Promise<PortResult<{ id: string; code: string }>>;
  invitePerson(p: {
    name: string;
    role: string;
    band: Band;
    email: string;
  }): Promise<PortResult<{ id: string }>>;
}

const ok = async <T extends object>(v: T = {} as T) => ({ ok: true as const, ...v });

export const fixturePort: CsPort = {
  saveChange: () => ok(),
  undo: () => ok(),
  publish: (_ids, when) => ok(when === "now" ? { version: 0, texts: 0 } : {}),
  cancelSchedule: () => ok(),
  publishEarly: () => ok({ version: 0 }),
  pause: () => ok(),
  addDevice: () => ok({ id: crypto.randomUUID(), code: pairCode() }),
  invitePerson: () => ok({ id: crypto.randomUUID() }),
};

const SLOT = "cs-drafts";
/** Drafts kept on the device while offline; sent with the next save once back online. */
export const localDrafts = {
  read: () => readQueue<Change>(SLOT).catch(() => [] as Change[]),
  write: (list: Change[]) => writeQueue(list, SLOT).catch(() => undefined),
};
