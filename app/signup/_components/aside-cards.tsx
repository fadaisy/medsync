import type { ReactNode } from "react";
import { LockIcon, MapPinIcon, ShieldCheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Aside-column cards used across /signup/*.
 *
 * Three components, all small and composable:
 *
 *   - <ReassuranceCard>  — the standing "your data is safe" panel
 *   - <ChecklistCard>    — small "you'll need" / "what's next" bullet list
 *   - <SupportLine>      — minimal "questions? email …" line under the cards
 *
 * Designed to stack vertically in the aside column without dominating
 * the form's visual weight. Restrained teal accents, no big icons.
 */

// ─── ReassuranceCard ────────────────────────────────────────────────────

const REASSURANCE_ITEMS: Array<{ Icon: typeof ShieldCheckIcon; label: string; body: string }> = [
  {
    Icon: ShieldCheckIcon,
    label: "PHI encrypted at rest",
    body: "Your NIN, phone, and any documents you upload are AES-256 encrypted before they touch the database.",
  },
  {
    Icon: MapPinIcon,
    label: "Data stays in Uganda",
    body: "Hosted in-region. Cross-border replication only with explicit hospital authorisation.",
  },
  {
    Icon: LockIcon,
    label: "Your record, your access",
    body: "Only your care team can read your clinical record. You can audit every read from the dashboard.",
  },
];

export function ReassuranceCard() {
  return (
    <section className="border-border bg-card flex flex-col gap-3 rounded-lg border p-4">
      <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
        Privacy & safety
      </span>
      <ul className="flex flex-col gap-3">
        {REASSURANCE_ITEMS.map((item) => (
          <li key={item.label} className="flex items-start gap-3">
            <span
              aria-hidden
              className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-teal-50 text-teal-700 dark:bg-teal-50/15 dark:text-teal-200"
            >
              <item.Icon className="size-3.5" strokeWidth={1.75} />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-foreground text-[12.5px] leading-tight font-medium">
                {item.label}
              </span>
              <span className="text-muted-foreground text-[11.5px] leading-snug">{item.body}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── ChecklistCard ──────────────────────────────────────────────────────

interface ChecklistCardProps {
  title: string;
  items: ReadonlyArray<string>;
  tone?: "muted" | "tealTinted";
}

export function ChecklistCard({ title, items, tone = "muted" }: ChecklistCardProps) {
  return (
    <section
      className={cn(
        "border-border flex flex-col gap-3 rounded-lg border p-4",
        tone === "muted" ? "bg-muted/40" : "bg-teal-50/40 dark:bg-teal-500/[0.06]",
      )}
    >
      <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
        {title}
      </span>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-[12.5px]">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-teal-500" />
            <span className="text-foreground/85 leading-snug">{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── SupportLine ────────────────────────────────────────────────────────

interface SupportLineProps {
  email?: string;
  children?: ReactNode;
}

export function SupportLine({ email = "hello@medsync.health", children }: SupportLineProps) {
  return (
    <p className="text-muted-foreground px-1 text-[11.5px] leading-relaxed">
      {children ?? (
        <>
          Stuck? Write to{" "}
          <a className="text-foreground hover:underline" href={`mailto:${email}`}>
            {email}
          </a>{" "}
          — a real founder, not an autoresponder.
        </>
      )}
    </p>
  );
}
