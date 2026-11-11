"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";

import { WitnessDialog } from "@/app/pharmacy/_components/witness";
import { useToast } from "@/components/pharmacy/medicines/shared";
import { STORE_SAYS } from "@/content/pharmacy-store";

/**
 * What every Main store surface shares. `useStoreAct` runs a server action: one client key per attempt, the refusal or
 * the success in the toast, the page re-read. `useWitness` asks the second person for a controlled step.
 */
export type StoreResult<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

export function useStoreAct(): {
  busy: boolean;
  toast: ReactNode;
  say: (m: string) => void;
  run: <T>(
    action: () => Promise<StoreResult<T>>,
    done?: string | ((data: T) => string | void),
  ) => void;
} {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [toast, say] = useToast();
  const run = useCallback(
    <T,>(action: () => Promise<StoreResult<T>>, done?: string | ((data: T) => string | void)) =>
      start(async () => {
        const r = await action();
        if (!r.ok) {
          say(r.error);
          return;
        }
        const m = typeof done === "function" ? done(r.data as T) : done;
        if (m) say(m);
        router.refresh();
      }),
    [router, say],
  );
  return { busy, toast, say, run };
}

export const newKey = () => crypto.randomUUID();

/**
 * `const { ask, dialog } = useWitness(locationId)`; render `dialog`, then `const id = await ask("what the witness reads")`.
 * Resolves to the approval's id, or null when closed. Store actions need the approval itself: a paper name is refused.
 */
export function useWitness(locationId: string | null, onRefuse?: (m: string) => void) {
  const [what, setWhat] = useState<string | null>(null);
  const settle = useRef<((id: string | null) => void) | null>(null);
  const ask = useCallback(
    (w: string) =>
      new Promise<string | null>((resolve) => {
        settle.current = resolve;
        setWhat(w);
      }),
    [],
  );
  const finish = (id: string | null) => {
    settle.current?.(id);
    settle.current = null;
    setWhat(null);
  };
  const dialog = (
    <WitnessDialog
      open={what !== null}
      onOpenChange={(o) => {
        if (!o) finish(null);
      }}
      what={what ?? ""}
      purpose="witness"
      locationId={locationId}
      onDone={(r) => {
        if (r.how === "phone") finish(r.attestationId);
        else {
          onRefuse?.(STORE_SAYS.witnessOnline);
          finish(null);
        }
      }}
    />
  );
  return { ask, dialog };
}
