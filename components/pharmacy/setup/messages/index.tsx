"use client";

import type { MessagesView } from "@/lib/pharmacy/setup/types";
import { useState } from "react";

import { useToast } from "@/components/pharmacy/medicines/shared";
import { useAct } from "@/components/pharmacy/roster/swaps";
import { EmptyState, Panel } from "@/components/tide/work/kit";
import { MSG } from "@/content/pharmacy-setup-messages";
import { Consent } from "./consent";
import { ThisMonth } from "./month";
import { Outbox } from "./outbox";
import { Provider } from "./provider";
import { Templates } from "./templates";

export type LogFilter = "all" | "failed" | "queued" | "delivered";
export type Run = ReturnType<typeof useAct>[1];
export interface SectionProps {
  view: MessagesView;
  toast: (m: string) => void;
  run: Run;
  pending: boolean;
}

/** Set-up › Messages (SETUP-TABS §D): this month, the provider, the templates, the outbox, consent. */
export function MessagesTab({ view }: { view: MessagesView | null }) {
  const [toastNode, toast] = useToast();
  const [pending, run] = useAct(toast);
  const [filter, setFilter] = useState<LogFilter>("all");
  // The test number is typed under SMS provider and used by every template's "Send this to the test number".
  const [testTo, setTestTo] = useState("");
  if (!view)
    return (
      <Panel title={MSG.month.title}>
        <EmptyState compact title={MSG.needsDb} />
      </Panel>
    );
  const p = { view, toast, run, pending };
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ThisMonth {...p} filter={filter} setFilter={setFilter} />
      <Provider {...p} testTo={testTo} setTestTo={setTestTo} />
      <Templates {...p} testTo={testTo} />
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Outbox {...p} filter={filter} setFilter={setFilter} />
        <Consent {...p} />
      </div>
      {toastNode}
    </div>
  );
}
