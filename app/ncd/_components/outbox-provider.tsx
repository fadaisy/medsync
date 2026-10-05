"use client";

import type { CommandResult } from "@/lib/ncdreg/commands/apply";
import type { CommandType } from "@/lib/ncdreg/commands/schema";
import type { Note, QueuedCommand } from "@/lib/ncdreg/offline/outbox";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CheckIcon, CloudOffIcon, RefreshCwIcon } from "lucide-react";

import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Button } from "@/components/ui/button";
import {
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ONLINE_ONLY } from "@/lib/ncdreg/commands/schema";
import { purgeOnSignOut, saveSnapshot } from "@/lib/ncdreg/offline/cache";
import { Outbox } from "@/lib/ncdreg/offline/outbox";
import { openStore } from "@/lib/ncdreg/offline/store";
import { offlineSnapshotAction, runCommand } from "../actions";

type Submit = <T extends CommandType>(
  type: T,
  payload: Record<string, unknown>,
) => Promise<CommandResult | { ok: true; queued: true }>;
type Held = {
  id: string;
  type: CommandType;
  code: string;
  message: string;
  fields: string[];
  clientTs: string;
};
type Sync = {
  online: boolean;
  waiting: number;
  lastSync: string | null;
  notes: Note[];
  held: Held[];
};
type Decide = (id: string, choice: "confirm" | "discard") => Promise<void>;
const Ctx = createContext<{
  submit: Submit;
  sync: Sync;
  decide: Decide;
  signOut: () => Promise<{ purged: boolean; waiting: number }>;
} | null>(null);

/** Refusals that can never succeed: discarded with a visible note. */
const PERMANENT = new Set(["invalid", "forbidden", "not_found", "interlock"]);
/** Refusals a person must decide: held on the device, never discarded silently (§9). */
const HOLD = new Set(["needs_confirmation", "duplicates", "conflict"]);

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
  const [sync, setSync] = useState<Sync>({
    online: true,
    waiting: 0,
    lastSync: null,
    notes: [],
    held: [],
  });

  const send = useCallback(async (c: QueuedCommand) => {
    const r = await runCommand({
      id: c.id,
      type: c.type,
      payload: c.payload,
      clientTs: c.clientTs,
    });
    if (r.ok) return { ok: true as const };
    if (HOLD.has(r.code))
      return {
        ok: false as const,
        hold: true as const,
        code: r.code,
        message: r.message,
        detail: r.detail,
      };
    return PERMANENT.has(r.code)
      ? { ok: false as const, retry: false as const, message: r.message }
      : { ok: false as const, retry: true as const };
  }, []);

  const refresh = useCallback(async () => {
    const b = box.current;
    if (!b) return;
    const held = (await b.heldItems()).map(({ c, meta }) => ({
      id: c.id,
      type: c.type,
      code: meta.held!.code,
      message: meta.held!.message,
      fields: Array.isArray(meta.held!.detail?.fields)
        ? (meta.held!.detail.fields as string[])
        : [],
      clientTs: c.clientTs,
    }));
    setSync({
      online: navigator.onLine,
      waiting: await b.waiting(),
      lastSync: await b.lastSync(),
      notes: await b.notes(),
      held,
    });
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
        navigator.serviceWorker
          ?.register("/ncd-sw.js", { scope: "/ncd", updateViaCache: "none" })
          .catch(() => undefined);
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
      const c: QueuedCommand = {
        id: crypto.randomUUID(),
        type,
        payload,
        clientTs: new Date().toISOString(),
      };
      if (navigator.onLine || ONLINE_ONLY.has(type)) {
        try {
          const r = await runCommand(c);
          if (r.ok) {
            router.refresh();
            await refresh();
          }
          return r;
        } catch (e) {
          if (ONLINE_ONLY.has(type))
            return {
              ok: false,
              code: "error",
              message: "This needs a connection. Try again when you are back online.",
            };
          void e;
        }
      }
      if (!box.current)
        return { ok: false, code: "error", message: "The device store is not ready." };
      await box.current.enqueue(c);
      await refresh();
      return { ok: true, queued: true };
    },
    [refresh, router],
  );

  /** A held entry: confirm the flagged values and send again, or discard it deliberately (kept as a note). */
  const decide: Decide = useCallback(
    async (id, choice) => {
      const b = box.current;
      if (!b) return;
      if (choice === "discard") await b.discard(id, "an entry that needed a decision");
      else {
        const it = (await b.heldItems()).find((x) => x.c.id === id);
        const fields = it?.meta.held?.detail?.fields;
        const prior = Array.isArray(it?.c.payload.confirmations)
          ? (it.c.payload.confirmations as string[])
          : [];
        await b.release(
          id,
          Array.isArray(fields) ? { confirmations: [...prior, ...(fields as string[])] } : {},
        );
      }
      await flush();
    },
    [flush],
  );

  const signOut = useCallback(async () => {
    if (!dbRef.current) return { purged: true, waiting: 0 };
    return purgeOnSignOut(dbRef.current);
  }, []);

  return <Ctx.Provider value={{ submit, sync, decide, signOut }}>{children}</Ctx.Provider>;
}

export function useOutbox() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOutbox outside OutboxProvider");
  return v;
}

const time = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : "not yet";

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
    <span
      role="status"
      className="text-caption text-ink-600 inline-flex items-center gap-1.5 whitespace-nowrap"
    >
      <Icon className="size-3.5" aria-hidden />
      {text}
      {sync.notes.length ? (
        <span className="text-ink-800 font-medium">· {sync.notes.length} not saved, see notes</span>
      ) : null}
      {sync.held.length ? <HeldEntries /> : null}
    </span>
  );
}

const HELD_ACTION: Record<string, string> = {
  needs_confirmation: "Values outside the usual range",
  duplicates: "Possible existing records",
  conflict: "Changed by someone else since",
};

/** §9: entries the server could not take without a person's decision. They wait here; nothing behind them for that patient is sent. */
function HeldEntries() {
  const { sync, decide } = useOutbox();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="text-ink-800 font-medium underline underline-offset-4"
        onClick={() => setOpen(true)}
      >
        · {sync.held.length} {sync.held.length === 1 ? "needs" : "need"} a decision
      </button>
      <EditorDialog open={open} onOpenChange={setOpen} width="medium">
        <SheetHeader>
          <SheetTitle>Entries waiting for a decision</SheetTitle>
          <SheetDescription>
            Saved on this device. Nothing later for the same patient is sent until each is settled.
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-3">
          {sync.held.map((h) => (
            <div key={h.id} className="border-border flex flex-col gap-2 rounded-lg border p-3">
              <p className="text-body-s font-medium">{HELD_ACTION[h.code] ?? h.message}</p>
              <p className="text-caption text-ink-700">
                Entered{" "}
                {new Date(h.clientTs).toLocaleString("en-GB", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
                {h.fields.length ? ` · ${h.fields.join(", ")}` : ""}
              </p>
              {h.code !== "needs_confirmation" ? (
                <p className="text-caption text-ink-700">
                  Enter it again on the patient&rsquo;s record, where the choice can be made.
                </p>
              ) : null}
              <div className="flex gap-2">
                {h.code === "needs_confirmation" ? (
                  <Button size="sm" onClick={() => void decide(h.id, "confirm")}>
                    The values are right, send
                  </Button>
                ) : null}
                <Button size="sm" variant="secondary" onClick={() => void decide(h.id, "discard")}>
                  Discard this entry
                </Button>
              </div>
            </div>
          ))}
        </SheetBody>
        <SheetFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Close
          </Button>
        </SheetFooter>
      </EditorDialog>
    </>
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
          if (!r.purged)
            return setMsg(
              `${r.waiting} ${r.waiting === 1 ? "entry is" : "entries are"} not sent yet. Reconnect before signing out.`,
            );
          window.location.href = "/sign-out";
        }}
      >
        Sign out
      </button>
      {msg ? (
        <span role="alert" className="text-ink-800 text-[11px]">
          {msg}
        </span>
      ) : null}
    </span>
  );
}
