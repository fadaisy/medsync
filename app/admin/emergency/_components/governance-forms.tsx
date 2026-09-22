"use client";

import type { GovernanceState } from "../actions";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signCatalogVersionAction, verifyContactAction } from "../actions";

/**
 * The two governance forms. Both are the same shape — an id, a reason, one
 * button — and both must say the four-eyes / checksum outcome in words, so
 * the outcome line is shared.
 */

const PENDING_TEXT =
  "Awaiting a second superadmin — no executor exists yet; see the runbook docs/runbooks/emergency-contacts-verification.md";

function Outcome({ state, okText }: { state: GovernanceState; okText: string }) {
  if (state.error) {
    return (
      <p role="alert" className="text-status-caution-fg text-caption">
        {state.error}
      </p>
    );
  }
  if (state.pending) {
    return (
      <p role="status" className="text-status-pending-fg text-caption">
        {PENDING_TEXT}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p role="status" className="text-status-stable-fg text-caption">
        {okText}
      </p>
    );
  }
  return null;
}

export function VerifyContactForm({
  contactId,
  verified,
  hasNumber,
}: {
  contactId: string;
  verified: boolean;
  hasNumber: boolean;
}) {
  const [state, formAction, pending] = useActionState<GovernanceState, FormData>(
    verifyContactAction,
    {},
  );
  const id = `reason-${contactId}`;
  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <input type="hidden" name="contact_id" value={contactId} />
      <input
        type="hidden"
        name="verification_status"
        value={verified ? "unverified" : "verified"}
      />
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="sr-only">
          Reason
        </label>
        <Input
          id={id}
          name="reason"
          minLength={8}
          required
          placeholder="Dialled on … by …; who answered"
          className="min-w-48 flex-1"
        />
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={pending || (!verified && !hasNumber)}
        >
          {pending ? "Sending…" : verified ? "Unverify" : "Verify"}
        </Button>
      </div>
      <Outcome state={state} okText={verified ? "Marked unverified." : "Marked verified."} />
    </form>
  );
}

export function SignVersionForm({ version }: { version: string }) {
  const [state, formAction, pending] = useActionState<GovernanceState, FormData>(
    signCatalogVersionAction,
    {},
  );
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="version" value={version} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`artifact-${version}`} className="text-caption text-foreground">
          Sign-off artifact reference
        </label>
        <Input
          id={`artifact-${version}`}
          name="signoff_artifact_ref"
          minLength={8}
          required
          placeholder="Where the signed CSO artifact lives, e.g. docs/clinical/signoffs/catalog-v0.1.pdf"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`sign-reason-${version}`} className="text-caption text-foreground">
          Reason
        </label>
        <Input
          id={`sign-reason-${version}`}
          name="reason"
          minLength={8}
          required
          placeholder="Why now — at least 8 characters"
        />
      </div>
      <p className="text-muted-foreground text-caption leading-relaxed">
        Signing is refused when the registered checksum differs from the bundle deployed with the
        function. Production renders signed content only (Gate CS).
      </p>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Signing…" : `Sign ${version}`}
        </Button>
      </div>
      <Outcome state={state} okText={`${version} signed. Production now renders it.`} />
    </form>
  );
}
