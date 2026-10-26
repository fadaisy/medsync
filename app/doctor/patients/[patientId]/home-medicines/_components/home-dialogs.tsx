"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RECON_UI as U } from "@/content/pharmacy-reconciliation";
import {
  Field,
  newKey,
  Refusal,
  SELECT,
  StoreDialog,
  str,
  TARGET,
} from "../../../../../pharmacy/store/places/_components/store-kit";
import { decideForHome, prepareMedicinesForHome } from "../actions";

const asResult = (r: { ok: true; id: string } | { ok: false; error: string }) =>
  r.ok
    ? { ok: true as const, id: r.id, serverTime: "" }
    : { ok: false as const, code: "invalid" as const, error: r.error };

/** MR-1: open the reconciliation for this admission. */
export function PrepareButton({ patientUserId }: { patientUserId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <Button
        className={`${TARGET} w-fit`}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await prepareMedicinesForHome({ clientKey: newKey(), patientUserId });
            setError(r.ok ? null : r.error);
            router.refresh();
          })
        }
      >
        {U.prepare}
      </Button>
      <Refusal error={error} />
    </div>
  );
}

/** One row's decision for home (5.7): from the prescriber, never inferred. */
export function DecideDialog({
  patientUserId,
  reconciliationId,
  rowKey,
  name,
}: {
  patientUserId: string;
  reconciliationId: string;
  rowKey: string;
  name: string;
}) {
  return (
    <StoreDialog
      label={U.decide}
      title={`${U.decide}: ${name}`}
      submit={U.save}
      onSave={async (clientKey, d) =>
        asResult(
          await decideForHome(patientUserId, {
            clientKey,
            reconciliationId,
            rowKey,
            decision: str(d, "decision"),
            reason: str(d, "reason") || null,
          }),
        )
      }
    >
      <Field label={U.cols.decision} id="decision">
        <select id="decision" name="decision" className={SELECT} required>
          {Object.entries(U.decisions).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label={U.reason} id="reason">
        <Input id="reason" name="reason" maxLength={500} className={TARGET} />
      </Field>
    </StoreDialog>
  );
}
