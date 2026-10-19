"use client";

import { useState } from "react";

import { FreshFactor, needsFreshFactor } from "@/components/medsync/fresh-factor";
import { Input } from "@/components/ui/input";
import { LabButton } from "../../../_components/v2/button";
import { Said, useAct } from "../../criticals/_components/setup-forms";

type Result = { ok: true } | { ok: false; error: string };

/**
 * A signature with a fresh second factor (range-editor's pattern): the author must say why no other
 * laboratory lead can sign; a "reauth:" refusal asks for the authenticator code in place, then retries.
 */
export function SignButton({
  label,
  okText,
  authoredByMe,
  noteLabel,
  disabledReason = null,
  describedBy,
  onSign,
}: {
  label: string;
  okText: string;
  authoredByMe: boolean;
  noteLabel: string;
  /** Why signing waits; present = the button is disabled and says why. */
  disabledReason?: string | null;
  describedBy?: string;
  onSign: (exceptionNote: string | null) => Promise<Result>;
}) {
  const { pending, message, act, setMessage } = useAct();
  const [note, setNote] = useState("");
  const [fresh, setFresh] = useState(false);
  const sign = () =>
    act(async () => {
      const r = await onSign(note.trim() || null);
      if (needsFreshFactor(r)) {
        setFresh(true);
        return { ok: false, error: "Enter your authenticator code to sign." };
      }
      return r;
    }, okText);
  return (
    <div className="flex flex-col gap-2">
      {authoredByMe && !disabledReason ? (
        <label className="text-body-s flex flex-col gap-1">
          <span className="text-muted-foreground">{noteLabel}</span>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            className="min-h-11 sm:min-h-9"
          />
        </label>
      ) : null}
      {fresh ? (
        <FreshFactor
          onCancel={() => setFresh(false)}
          onConfirmed={() => {
            setFresh(false);
            setMessage(null);
            sign();
          }}
        />
      ) : (
        <div>
          <LabButton
            type="button"
            onClick={sign}
            aria-describedby={describedBy}
            className="min-h-11 sm:min-h-8"
            variant="primary"
            busy={pending}
            disabledReason={disabledReason}
          >
            {label}
          </LabButton>
        </div>
      )}
      <Said message={message} />
    </div>
  );
}
