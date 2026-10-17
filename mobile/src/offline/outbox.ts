import type { SupabaseClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";

/**
 * The outbox: create-only writes waiting for a connection (PRD § Offline).
 *
 * The patient's own log (ADR 0342) is written as plain inserts. Every row
 * carries a client-made uuid `id`, so a replay is idempotent: if the first
 * try did land and only the answer was lost, the replay hits the primary key
 * (23505) and counts as sent. Items are kept until they land; they drain on
 * app start, when the app comes back to the foreground, and after any save
 * that reached the server.
 *
 * Chat still queues `message` items here with no sender; they stay until
 * chat has one.
 */
export interface OutboxItem {
  key: string;
  kind: "insert" | "reading" | "dose" | "mood" | "message";
  payload: Record<string, unknown>;
  createdAt: string;
}

/** What a save did, for the words on the screen. */
export type SaveResult = "sent" | "queued" | "failed";

const STORAGE_KEY = "medsync-outbox-v1";

/**
 * The Supabase client, loaded on first use rather than at import: the client
 * throws at import without its env vars, and the screens and tests that
 * import a repository only for a helper must not need a backend.
 */
export async function db(): Promise<SupabaseClient> {
  // A lazy `require`, not `import()`: Metro inlines both, Jest only runs this one.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require("@/lib/supabase") as typeof import("@/lib/supabase")).supabase;
}

/** The signed-in patient, from the stored session (works offline). */
export async function currentUserId(): Promise<string | null> {
  const { data } = await (await db()).auth.getSession();
  return data.session?.user.id ?? null;
}

export function idempotencyKey(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rand}`;
}

/**
 * A v4-shaped uuid for a new row's primary key. Not a secret, only a name the
 * replay can repeat, so `Math.random` is enough (Hermes has no `crypto`).
 */
export function newId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function readOutbox(): Promise<OutboxItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as OutboxItem[]) : [];
  } catch {
    return [];
  }
}

async function writeOutbox(items: OutboxItem[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items)).catch(() => {});
}

export async function enqueue(
  kind: OutboxItem["kind"],
  payload: Record<string, unknown>,
): Promise<OutboxItem> {
  const item: OutboxItem = {
    key: idempotencyKey(),
    kind,
    payload,
    createdAt: new Date().toISOString(),
  };
  const items = await readOutbox();
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...items, item]));
  } catch {
    // A full or locked store loses the queue entry, not the screen.
  }
  return item;
}

/** Take a queued insert back out (undone before it was sent). True when one was removed. */
export async function unqueue(rowId: string): Promise<boolean> {
  const items = await readOutbox();
  const left = items.filter((i) => rowOf(i)?.id !== rowId);
  if (left.length === items.length) return false;
  await writeOutbox(left);
  return true;
}

/**
 * Send each item once; keep the ones that fail. Only the sent keys are
 * removed from a fresh read, so an item queued while sending is not lost.
 */
export async function drain(send: (item: OutboxItem) => Promise<boolean>): Promise<number> {
  const sent = new Set<string>();
  for (const item of await readOutbox())
    if (await send(item).catch(() => false)) sent.add(item.key);
  if (sent.size) await writeOutbox((await readOutbox()).filter((i) => !sent.has(i.key)));
  return sent.size;
}

/** A PostgREST error with no code never reached the database: the phone is offline. */
export function isOffline(error: { code?: string | null } | null): boolean {
  return !!error && !error.code;
}

export type Row = { id: string; patient_user_id: string } & Record<string, unknown>;

function rowOf(item: OutboxItem): Row | null {
  if (item.kind !== "insert") return null;
  const row = item.payload.row as Row | undefined;
  return row && typeof row.id === "string" ? row : null;
}

/**
 * Insert one row now, or queue it when the phone is offline. A refusal from
 * the database (a check the row breaks, RLS) is `failed`: queueing it would
 * only fail again later, after the screen said it was safe.
 */
export async function insertOrQueue(table: string, row: Row): Promise<SaveResult> {
  try {
    const { error } = await (await db()).from(table).insert(row);
    if (!error || error.code === "23505") {
      void flushOutbox();
      return "sent";
    }
    if (!isOffline(error)) return "failed";
  } catch {
    // fetch threw before PostgREST could wrap it: offline too.
  }
  await enqueue("insert", { table, row });
  return "queued";
}

let flushing: Promise<number> | null = null;

/**
 * Replay queued inserts. Sent, or already there (23505), leaves the queue.
 * Offline, or a row of another account than the one signed in, stays. A row
 * the database can never take (RLS 42501, a deleted medicine 23503) is
 * dropped. Anything else (a kind before migration 0170) stays for a later
 * try. One flush at a time, so two triggers never send the same row at once.
 */
export function flushOutbox(): Promise<number> {
  flushing ??= (async () => {
    try {
      const me = await currentUserId();
      if (!me) return 0;
      const client = await db();
      return await drain(async (item) => {
        const row = rowOf(item);
        if (!row || row.patient_user_id !== me) return false;
        const { error } = await client.from(String(item.payload.table)).insert(row);
        if (!error || error.code === "23505") return true;
        return error.code === "42501" || error.code === "23503";
      });
    } catch {
      return 0;
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

let started = false;

/** Drain now and each time the app returns to the foreground. Safe to call more than once. */
export function startOutbox(): void {
  if (started) return;
  started = true;
  void flushOutbox();
  AppState.addEventListener("change", (state) => {
    if (state === "active") void flushOutbox();
  });
}

/** The words after a save, the same on every screen. Nothing the patient logs reaches a clinician. */
export function savedLine(result: SaveResult, sent = "Saved · only you can see it"): string {
  if (result === "sent") return sent;
  if (result === "queued") return "Saved on this phone. It will send when you are online";
  return "Couldn't save that. Try again later.";
}
