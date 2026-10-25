import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";

import { ICON } from "@/components/tide/kit";
import { cn } from "@/lib/utils";

/** The Me tab's grouped settings rows (the phone's Label / Group / Row): a square icon, a title over a line. */

export function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label={label}>
      <h2 className="text-pw-ink-3 px-1 text-[13px] leading-[18px] font-semibold">{label}</h2>
      <ul className="rounded-pw-card bg-pw-surface shadow-pw-card divide-pw-surface-3 divide-y overflow-hidden">
        {children}
      </ul>
    </section>
  );
}

export function Row({
  icon: Icon,
  title,
  sub,
  note,
  href,
  right,
  iconClass = "text-pw-ink-2",
}: {
  icon: LucideIcon;
  title: string;
  sub: ReactNode;
  note?: string | null;
  href?: string;
  right?: ReactNode;
  iconClass?: string;
}) {
  const body = (
    <>
      <span className="bg-pw-surface-2 grid size-[34px] shrink-0 place-items-center rounded-lg">
        <Icon className={cn("size-[18px]", iconClass)} {...ICON} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="text-[15px] leading-5 font-semibold">{title}</span>
        <span className="text-pw-ink-2 text-[13px] leading-[18px] font-medium">{sub}</span>
        {note ? (
          <span role="status" className="text-pw-ink text-[13px] leading-[18px] font-semibold">
            {note}
          </span>
        ) : null}
      </span>
    </>
  );
  const cls = "flex min-h-14 items-center gap-3 px-3.5 py-[11px]";
  return (
    <li>
      {href ? (
        <Link
          href={href}
          className={cn(
            cls,
            "hover:bg-pw-surface-2 focus-visible:outline-pw-focus focus-visible:outline-2 focus-visible:-outline-offset-2",
          )}
        >
          {body}
          <ChevronRightIcon className="text-pw-ink-3 size-[18px] shrink-0" {...ICON} />
        </Link>
      ) : (
        <div className={cn(cls, "flex-wrap")}>
          {body}
          {right}
        </div>
      )}
    </li>
  );
}

/** The phone's switch: a real checkbox with the switch's look; the row's words carry the state too. */
export function Switch({
  label,
  checked,
  onChange,
  busy,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  busy?: boolean;
}) {
  return (
    <label className="relative inline-grid min-h-12 shrink-0 cursor-pointer place-items-center px-1 has-[:disabled]:cursor-wait">
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        disabled={busy}
        aria-busy={busy || undefined}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={cn(
          "peer-focus-visible:outline-pw-focus h-[30px] w-[50px] rounded-full p-0.5 transition-colors duration-150 ease-out peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 motion-reduce:transition-none",
          checked ? "bg-pw-accent-pressed" : "bg-pw-act-off",
          busy && "opacity-60",
        )}
      >
        <span
          className={cn(
            "bg-pw-on-band shadow-pw-card block size-[26px] rounded-full transition-transform duration-150 ease-out motion-reduce:transition-none",
            checked && "translate-x-5",
          )}
        />
      </span>
    </label>
  );
}
