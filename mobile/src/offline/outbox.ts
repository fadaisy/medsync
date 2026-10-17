import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The outbox: create-only writes waiting for a connection (PRD § Offline).
 * Each item carries an idempotency key, so a write sent twice after a flaky
 * network lands once. While clinical data is on fixtures (law L2) nothing
 * drains it to a server: items stay on the phone and are shown as "waiting
 * to send". `drain` takes a sender when a real repository exists.
 */
export interface OutboxItem {
  key: string;
  kind: "reading" | "dose" | "mood" | "message";
  payload: Record<string, unknown>;
  createdAt: string;
}

const STORAGE_KEY = "medsync-outbox-v1";

export function idempotencyKey(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rand}`;
}

export async function readOutbox(): Promise<OutboxItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as OutboxItem[]) : [];
  } catch {
    return [];
  }
}

export async function enqueue(kind: OutboxItem["kind"], payload: Record<string, unknown>): Promise<OutboxItem> {
  const item: OutboxItem = { key: idempotencyKey(), kind, payload, createdAt: new Date().toISOString() };
  const items = await readOutbox();
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...items, item]));
  } catch {
    // A full or locked store loses the queue entry, not the screen.
  }
  return item;
}

/** Send each item once; keep the ones that fail. */
export async function drain(send: (item: OutboxItem) => Promise<boolean>): Promise<number> {
  const items = await readOutbox();
  const left: OutboxItem[] = [];
  for (const item of items) if (!(await send(item).catch(() => false))) left.push(item);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(left)).catch(() => {});
  return items.length - left.length;
}
