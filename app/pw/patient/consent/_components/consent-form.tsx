"use client";

import type { AcceptConsentState } from "@/app/patient/consent/actions";
import { useActionState, useState } from "react";

import { acceptDataProcessingConsentAction } from "@/app/patient/consent/actions";
import { Button, Card, Note } from "@/components/tide/kit";
import { GETTING_IN_COPY as G } from "@/content/patient/getting-in";

/**
 * The whole text, open (this page exists for it to be read), one box and one action. The posted version and
 * hash are the ones on screen; the old action refuses a stale page rather than misfile it.
 */
export function ConsentForm({
  version,
  bodySha256,
  effectiveDate,
  body,
}: {
  version: string;
  bodySha256: string;
  effectiveDate: string;
  body: string;
}) {
  const [state, action, pending] = useActionState<AcceptConsentState, FormData>(
    acceptDataProcessingConsentAction,
    {},
  );
  const [agreed, setAgreed] = useState(false);
  return (
    <div className="flex flex-col gap-5">
      <form action={action} className="flex flex-col gap-5">
        <Card className="flex flex-col gap-3">
          <h2 className="text-[17px] leading-[22px] font-semibold">
            {G.gate.meta(version, effectiveDate)}
          </h2>
          <p className="text-pw-ink-2 text-[15px] leading-[23px] whitespace-pre-line">{body}</p>
        </Card>
        <input type="hidden" name="data_processing_consent_version" value={version} />
        <input type="hidden" name="data_processing_consent_body_sha256" value={bodySha256} />
        <label className="rounded-pw-row bg-pw-surface ring-pw-line has-checked:ring-pw-accent-pressed flex min-h-12 cursor-pointer items-start gap-3 p-4 ring-2 ring-inset">
          <input
            type="checkbox"
            name="data_processing_consent"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            aria-invalid={state.field === "consent" || undefined}
            className="accent-pw-act focus-visible:outline-pw-focus mt-0.5 size-6 shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2"
          />
          <span className="flex flex-col gap-1">
            <span className="font-semibold">{G.gate.agree}</span>
            <span className="text-pw-ink-2 text-[13px] leading-[18px]">{G.gate.recorded}</span>
          </span>
        </label>
        {state.error ? (
          <div role="alert">
            <Note>{state.error}</Note>
          </div>
        ) : null}
        <Button
          type="submit"
          busy={pending}
          disabledReason={agreed ? undefined : G.gate.tick}
          className="self-start"
        >
          {G.gate.accept}
        </Button>
      </form>
      <form action="/sign-out" method="post">
        <Button type="submit" tone="outline" size="m">
          {G.gate.signOut}
        </Button>
      </form>
    </div>
  );
}
