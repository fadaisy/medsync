"use client";

import type { JoinWaitlistInput, JoinWaitlistResult } from "../actions";
import Link from "next/link";
import { useState, useTransition } from "react";
import { CheckIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { joinWaitlistAction } from "../actions";

/**
 * "Tell me if a place opens" (Gate E, ADR 0090; PRD §3.3.3) — shown on a
 * clinic day step when every day inside the target is full, or nothing is
 * open inside it at all. One tap; the answer is the honest position in the
 * line and the sentence that it holds nothing.
 */
export function WaitlistJoin({
  input,
  clinicName,
}: {
  input: JoinWaitlistInput;
  clinicName: string;
}) {
  const [result, setResult] = useState<JoinWaitlistResult | null>(null);
  const [pending, start] = useTransition();

  if (result?.ok || result?.alreadyOn) {
    return (
      <div className="bg-card dark:shadow-card flex flex-col gap-2 rounded-xl p-4 shadow-xs">
        <span className="bg-brand-50 text-brand-700 ring-brand-200/70 text-body-s inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 font-medium ring-1">
          <CheckIcon className="size-3.5" aria-hidden />
          {result.ok ? `You are in line — position ${result.position}` : "You are already in line"}
        </span>
        <p className="text-muted-foreground text-body-s leading-relaxed">
          We will tell you when a place opens at {clinicName}. Being in line does not hold a place;
          you take it when we offer it.{" "}
          <Link
            href="/patient/appointments"
            className="text-primary underline-offset-4 hover:underline"
          >
            See it under Visits
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card dark:shadow-card flex flex-col gap-3 rounded-xl p-4 shadow-xs">
      <p className="text-foreground text-body-s leading-relaxed">
        Want a place at {clinicName} if one opens? We will message you, and you take it in one tap.
      </p>
      <Button
        type="button"
        variant="secondary"
        size="lg"
        disabled={pending}
        className="w-full sm:w-fit"
        onClick={() => start(async () => setResult(await joinWaitlistAction(input)))}
      >
        {pending ? "Adding you…" : "Tell me if a place opens"}
      </Button>
      {result && !result.ok ? (
        <p role="alert" className="text-status-caution-fg text-body-s">
          {result.error}
        </p>
      ) : null}
    </div>
  );
}
