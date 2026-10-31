"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { LabButton } from "@/components/tide/work/button";
import { RC } from "@/content/pharmacy-rework-records";
import { riskActionAction } from "../actions";

type Act = keyof typeof RC.losses.actions;

/** The three moves on stock at risk (prototype losses.js): each is recorded, with the value, on the audit trail. */
export function RiskAct({ productId, batchNumber, value }: { productId: string; batchNumber: string; value: number }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = (action: Act) =>
    start(async () => {
      setError(null);
      const r = await riskActionAction({
        clientKey: crypto.randomUUID(),
        productId,
        batchNumber,
        action,
        valueUgx: Math.round(value),
      });
      if (!r.ok) return setError(r.error);
      router.refresh();
    });
  return (
    <div className="flex flex-wrap gap-1.5">
      {(Object.keys(RC.losses.actions) as Act[]).map((a) => (
        <LabButton key={a} size="sm" variant="secondary" busy={pending} onClick={() => go(a)}>
          {RC.losses.actions[a]}
        </LabButton>
      ))}
      {error ? (
        <p role="alert" className="text-caption text-ink-900 w-full font-semibold">
          {error}
        </p>
      ) : null}
    </div>
  );
}
