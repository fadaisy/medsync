import Link from "next/link";
import { InfoIcon } from "lucide-react";

import type { FacilityStatus } from "@/lib/ncdreg/admin";
import { DEMO_COPY } from "@/lib/ncdreg/demo/source";
import { SyncState } from "./outbox-provider";

/**
 * The one banner region of every NCD screen (§8.3, §10.2): the draft-standard notice, the synthetic
 * and demo-data notices as lines of one region (never stacked banners), and the sync state at its
 * right. Neutral ink, never a status colour: it informs, it does not alarm.
 */
export function NoticeBanner({ status, canManageDemo }: { status: FacilityStatus; canManageDemo: boolean }) {
  const demoOn = status.demo != null && ["loading", "on", "removing"].includes(status.demo.status);
  const lines: { strong: string; text: string; action?: { href: string; label: string } }[] = [];
  if (demoOn)
    lines.push({
      strong: "Demo data.",
      text: status.demo!.status === "loading" ? `${DEMO_COPY.banner} Loading…` : DEMO_COPY.banner,
      action: canManageDemo ? { href: "/ncd/admin?demo=off#demo", label: DEMO_COPY.switch_off } : undefined,
    });
  else if (status.syntheticPersons > 0) lines.push({ strong: "Synthetic data.", text: "Records here are synthetic test records." });
  if (!status.approved) lines.push({ strong: "Draft standard version 0.1.", text: "Not approved for patient data." });
  else if (status.draftDefinitions) lines.push({ strong: "Draft standard version 0.1.", text: "Some definitions in use are still drafts awaiting sign-off." });
  return (
    <div role="note" aria-label="Registry notices" className="border-border bg-ink-50 flex flex-wrap items-start justify-between gap-x-6 gap-y-1 border-b px-4 py-2 sm:px-8 print:bg-transparent">
      <ul className="text-caption text-ink-600 flex flex-col gap-0.5">
        {lines.map((l) => (
          <li key={l.strong} className="flex flex-wrap items-center gap-1.5">
            <InfoIcon className="size-3.5 shrink-0" aria-hidden />
            <strong className="text-ink-800 font-semibold">{l.strong}</strong>
            <span>{l.text}</span>
            {l.action ? (
              <Link href={l.action.href} className="text-ink-800 font-medium underline underline-offset-2 print:hidden">
                {l.action.label}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="print:hidden">
        <SyncState />
      </div>
    </div>
  );
}
