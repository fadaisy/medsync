"use client";

import type { CommandResult } from "@/lib/ncdreg/commands/apply";
import type { CommandType } from "@/lib/ncdreg/commands/schema";
import type { Note, QueuedCommand } from "@/lib/ncdreg/offline/outbox";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, CloudOffIcon, RefreshCwIcon } from "lucide-react";

import { ONLINE_ONLY } from "@/lib/ncdreg/commands/schema";
import { purgeOnSignOut, saveSnapshot } from "@/lib/ncdreg/offline/cache";
import { Outbox } from "@/lib/ncdreg/offline/outbox";
import { openStore } from "@/lib/ncdreg/offline/store";
import { offlineSnapshotAction, runCommand } from "../actions";

type Submit = <T extends CommandType>(type: T, payload: Record<string, unknown>) => Promise<CommandResult | { ok: true; queued: true }>;
type Sync = { online: boolean; waiting: number; lastSync: string | null; notes: Note[] };
const Ctx = createContext<{ submit: Submit; sync: Sync; signOut: () => Promise<{ purged: boolean; waiting: number }> } | null>(null);

const PERMANENT = new Set(["invalid", "forbidden", "not_found", "conflict", "interlock", "needs_confirmation", "duplicates"]);

/**
 * B5 / §9: every capture write goes through here. Online, the command goes straight to the server and
 * its answer comes back (duplicates, confirmations). Offline, or when the network fails, it is queued
 * encrypted on the device and sent in order when the connection returns. Online-only commands
 * (death, transfer, merge) are never queued.
 */
export function OutboxProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const box = useRef<Outbox | null>(null);
  const dbRef = useRef<IDBDatabase | null>(null);
  const [sync, setSync] = useState<Sync>({ online: true, waiting: 0, lastSync: null, notes: [] });

  const send = useCallback(async (c: QueuedCommand) => {
    const r = await runCommand({ id: c.id, type: c.type, payload: c.payload, clientTs: c.clientTs });
    if (r.ok) return { ok: true as const };
    return PERMANENT.has(r.code) ? { ok: false as const, retry: false as const, message: r.message } : { ok: false as const, retry: true as const };
  }, []);

  const refresh = useCallback(async () => {
    const b = box.current;
    if (!b) return;
    setSync({ online: navigator.onLine, waiting: await b.waiting(), lastSync: await b.lastSync(), notes: await b.notes() });
  }, []);

  const flush = useCallback(async () => {
    const b = box.current;
    if (!b || !navigator.onLine) return refresh();
    const r = await b.flush();
    await refresh();
    if (r.sent) router.refresh();
    // Refresh the offline read cache once the outbox is drained (replaced whole, encrypted).
    if (dbRef.current && !(await b.waiting()))
      await offlineSnapshotAction()
        .then((s) => saveSnapshot(dbRef.current!, s))
        .catch(() => undefined);
  }, [refresh, router]);

  useEffect(() => {
    let alive = true;
    openStore()
      .then((db) => {
        if (!alive) return;
        dbRef.current = db;
        box.current = new Outbox(db, send);
        // The offline shell, cached by a worker scoped to /ncd (nothing clinical in its cache).
        navigator.serviceWorker?.register("/ncd-sw.js", { scope: "/ncd", updateViaCache: "none" }).catch(() => undefined);
        void flush();
      })
      .catch(() => undefined);
    const on = () => void flush();
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    const t = window.setInterval(on, 30_000);
    return () => {
      alive = false;
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
      window.clearInterval(t);
    };
  }, [flush, send]);

  const submit: Submit = useCallback(
    async (type, payload) => {
      const c: QueuedCommand = { id: crypto.randomUUID(), type, payload, clientTs: new Date().toISOString() };
      if (navigator.onLine || ONLINE_ONLY.has(type)) {
        try {
          const r = await runCommand(c);
          if (r.ok) {
            router.refresh();
            await refresh();
          }
          return r;
        } catch (e) {
          if (ONLINE_ONLY.has(type)) return { ok: false, code: "error", message: "This needs a connection. Try again when you are back online." };
          void e;
        }
      }
      if (!box.current) return { ok: false, code: "error", message: "The device store is not ready." };
      await box.current.enqueue(c);
      await refresh();
      return { ok: true, queued: true };
    },
    [refresh, router],
  );

  const signOut = useCallback(async () => {
    if (!dbRef.current) return { purged: true, waiting: 0 };
    return purgeOnSignOut(dbRef.current);
  }, []);

  return <Ctx.Provider value={{ submit, sync, signOut }}>{children}</Ctx.Provider>;
}

export function useOutbox() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOutbox outside OutboxProvider");
  return v;
}

const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "not yet");

/** The persistent, calm sync line (§9): items waiting and the time of the last sync. */
export function SyncState() {
  const v = useContext(Ctx);
  if (!v) return null; // print and static renders have no device store
  const { sync } = v;
  const Icon = !sync.online ? CloudOffIcon : sync.waiting ? RefreshCwIcon : CheckIcon;
  const text = !sync.online
    ? `Offline. ${sync.waiting} ${sync.waiting === 1 ? "entry" : "entries"} waiting to sync · last sync ${time(sync.lastSync)}`
    : sync.waiting
      ? `${sync.waiting} ${sync.waiting === 1 ? "entry" : "entries"} waiting to sync · last sync ${time(sync.lastSync)}`
      : `All entries saved${sync.lastSync ? ` · last sync ${time(sync.lastSync)}` : ""}`;
  return (
    <span role="status" className="text-caption text-ink-600 inline-flex items-center gap-1.5 whitespace-nowrap">
      <Icon className="size-3.5" aria-hidden />
      {text}
      {sync.notes.length ? <span className="text-ink-800 font-medium">· {sync.notes.length} not saved, see notes</span> : null}
    </span>
  );
}

/** Sign out: purge the device cache first, but never while entries are still waiting to be sent. */
export function SignOutButton() {
  const { signOut } = useOutbox();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground text-[12px] underline-offset-4 hover:underline"
        onClick={async () => {
          const r = await signOut();
          if (!r.purged) return setMsg(`${r.waiting} ${r.waiting === 1 ? "entry is" : "entries are"} not sent yet. Reconnect before signing out.`);
          window.location.href = "/sign-out";
        }}
      >
        Sign out
      </button>
      {msg ? <span role="alert" className="text-ink-800 text-[11px]">{msg}</span> : null}
    </span>
  );
}
