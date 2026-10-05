"use client";

import type { SignState } from "../actions";
import { useActionState } from "react";
import { PenLineIcon, PrinterIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { signMonthAction } from "../actions";

/** Sign and lock the month (report_sign holders). A refusal is shown next to the action. */
export function SignForm({ month, monthText }: { month: string; monthText: string }) {
  const [state, action, pending] = useActionState<SignState, FormData>(
    signMonthAction.bind(null, month),
    null,
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-3 print:hidden">
      <Button type="submit" variant="primary" size="sm" disabled={pending}>
        <PenLineIcon aria-hidden />
        {pending ? "Signing…" : `Sign and lock ${monthText}`}
      </Button>
      <p role="status" aria-live="polite" className="text-body-s text-ink-700">
        {state ? (state.ok ? state.message : `Not signed: ${state.message}`) : null}
      </p>
    </form>
  );
}

export function PrintButton() {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={() => window.print()}
      className="print:hidden"
    >
      <PrinterIcon aria-hidden />
      Print
    </Button>
  );
}
