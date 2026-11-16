"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { wardOpAction } from "../_lib/actions";

/** One pending flag and one error per surface; a success refreshes the server read. */
export function useWardOp() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (
    input: { op: string } & Record<string, unknown>,
    onOk?: (data: Record<string, unknown> | undefined) => void,
  ) => {
    setError(null);
    start(async () => {
      const r = await wardOpAction(input);
      if (!r.ok) return setError(r.error);
      onOk?.(r.data);
      router.refresh();
    });
  };
  return { pending, error, setError, run };
}
