"use client";

import type { HubResult } from "./types";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { runHubOp } from "../actions";

/**
 * Runs one hub op (ha-services-hub) or one server action, keeps the admin where they are, and shows the function's
 * own words when it refuses. `said` is the polite line a page reads out after a change.
 */
export function useOp() {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const call = (fn: () => Promise<HubResult>, onOk?: (data?: Record<string, unknown>) => void) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onOk?.(r.data);
      router.refresh();
    });
  };
  const run = (
    input: { op: string } & Record<string, unknown>,
    onOk?: (data?: Record<string, unknown>) => void,
  ) => call(() => runHubOp(input), onOk);
  return { busy, error, setError, run, call };
}
