"use client";

import type { ActionResult } from "@/lib/emr/write/context";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/** One pending flag and one message per surface; a success refreshes the server read (S9: both entry points). */
export function useMenuAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const run = <T>(
    call: () => Promise<ActionResult<T>>,
    okText: string | ((r: ActionResult<T> & { ok: true }) => string),
    after?: () => void,
  ) =>
    start(async () => {
      const r = await call();
      if (!r.ok) return setMessage({ ok: false, text: r.error });
      setMessage({ ok: true, text: typeof okText === "string" ? okText : okText(r) });
      after?.();
      router.refresh();
    });
  return { pending, message, setMessage, run };
}

export const newKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
