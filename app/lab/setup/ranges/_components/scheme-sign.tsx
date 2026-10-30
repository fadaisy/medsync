"use client";

import { useId, useState } from "react";

import { FreshFactor, needsFreshFactor } from "@/components/medsync/fresh-factor";
import { Input } from "@/components/ui/input";
import { signConfigAsLeadAction } from "@/lib/lab/catalogue-v2-actions";
import { LabButton } from "@/components/tide/work/button";
import { Said, useAct } from "../../criticals/_components/setup-forms";

/**
 * The laboratory lead's signature on a scheme or flag-basis draft (§5.12). A fresh second factor is asked
 * for in place when the action says "reauth:"; the CSO countersigns in the admin console, and until then
 * the version in force stays in force.
 */
export function SchemeSign({
  configId,
  authoredByMe,
  blockedReason = null,
}: {
  configId: string;
  authoredByMe: boolean;
  /** Why the signature is unavailable now (problems in the draft, unsaved changes). */
  blockedReason?: string | null;
}) {
  const { pending, message, act, setMessage } = useAct();
  const [note, setNote] = useState("");
  const [fresh, setFresh] = useState(false);
  const why = useId();
  const sign = () =>
    act(async () => {
      const r = await signConfigAsLeadAction({ configId, exceptionNote: note.trim() || null });
      if (needsFreshFactor(r)) {
        setFresh(true);
        return { ok: false, error: "Enter your authenticator code to sign." };
      }
      return r;
    }, "Signed as laboratory lead. The CSO signs next; until then the version in force stays in force.");
  return (
    <div className="flex flex-col gap-2">
      {authoredByMe ? (
        <label className="text-body-s flex flex-col gap-1">
          <span className="text-muted-foreground">
            You wrote this draft. If no other laboratory lead can sign, say why
          </span>
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
        <div className="flex flex-col gap-1">
          <div>
            <LabButton
              type="button"
              variant="secondary"
              onClick={sign}
              aria-describedby={blockedReason ? why : undefined}
              busy={pending}
              disabledReason={blockedReason || null}
            >
              Sign as laboratory lead
            </LabButton>
          </div>
          {blockedReason ? (
            <p id={why} className="text-caption text-muted-foreground">
              {blockedReason}
            </p>
          ) : null}
        </div>
      )}
      <Said message={message} />
    </div>
  );
}
