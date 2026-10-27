"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { CheckIcon, ScanLineIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CATALOGUE } from "@/content/pharmacy-catalogue";
import { BATCH_CHOICE_REASONS } from "@/content/pharmacy-supply";
import { SELECT, TARGET } from "../../places/_components/store-kit";
import * as actions from "../actions";

const P = CATALOGUE.picking;

/**
 * 4.11 (ADR 0463): one line's pick. A wedge scanner types the code and presses Enter; a pack with no barcode is
 * ticked by hand. A wrong product or strength comes back in words; a later batch asks for the coded reason.
 */
export function PickCell({
  requisitionId,
  lineId,
  productName,
  picked,
}: {
  requisitionId: string;
  lineId: string;
  productName: string;
  picked: "scan" | "hand" | null;
}) {
  const router = useRouter();
  const id = useId();
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [askReason, setAskReason] = useState(false);
  const [reason, setReason] = useState<"" | "first_not_found" | "first_unfit">("");
  const [pending, start] = useTransition();
  if (picked)
    return (
      <span className="text-body-s inline-flex items-center gap-1">
        <CheckIcon aria-hidden className="size-4" />
        {picked === "hand" ? P.byHand : P.picked}
      </span>
    );
  const send = (code: string | null) =>
    start(async () => {
      const r = await actions.recordPick({
        requisitionId,
        lineId,
        raw: code,
        laterReason: reason || null,
      });
      if (r.ok) {
        setError(null);
        return router.refresh();
      }
      setError(r.error);
      setAskReason(r.code === "conflict");
    });
  return (
    <div className="flex min-w-56 flex-col gap-1">
      <label htmlFor={id} className="text-caption inline-flex items-center gap-1.5">
        <ScanLineIcon aria-hidden className="size-4" />
        {P.scanLabel}
      </label>
      <Input
        id={id}
        value={raw}
        autoComplete="off"
        disabled={pending}
        aria-label={`${productName}, ${P.scanLabel}`}
        onChange={(e) => setRaw(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && raw.trim()) {
            e.preventDefault();
            send(raw);
          }
        }}
        className={`${TARGET} font-mono`}
      />
      {askReason ? (
        <>
          <select
            aria-label={`${productName}, ${P.laterReason}`}
            className={SELECT}
            value={reason}
            onChange={(e) => setReason(e.target.value as typeof reason)}
          >
            <option value="" disabled>
              {P.laterReason}
            </option>
            <option value="first_not_found">{BATCH_CHOICE_REASONS.first_not_found}</option>
            <option value="first_unfit">{BATCH_CHOICE_REASONS.first_unfit}</option>
          </select>
          <Button
            type="button"
            variant="secondary"
            className={TARGET}
            disabled={pending || !reason || !raw.trim()}
            onClick={() => send(raw)}
          >
            {P.retry}
          </Button>
        </>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        className={TARGET}
        disabled={pending}
        onClick={() => send(null)}
      >
        {P.byHand}
      </Button>
      {error ? (
        <p className="text-caption" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
