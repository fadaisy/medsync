"use client";

import type { StoreResult } from "@/components/pharmacy/store/shared";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/** `useStoreAct` for a form in a dialog: the refusal stays in the dialog, beside the fields, not behind the overlay. */
export function useSave() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const go = <T,>(action: () => Promise<StoreResult<T>>, done: (data: T) => void) =>
    start(async () => {
      const r = await action();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      done(r.data as T);
      router.refresh();
    });
  return { pending, error, setError, go };
}
