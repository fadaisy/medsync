"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** The grid's density (MEDICINES-TAB.md §4): 32 px fields with 13 px text, pill-shaped. */
export const field =
  "bg-card text-foreground h-8 rounded-full border border-ink-300 px-3 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-primary";
export const fieldSm = cn(field, "h-[30px]");
export const sectionTitle =
  "text-ink-600 m-0 text-[11px] leading-[14px] font-semibold tracking-[0.06em] uppercase";
export const pillBtn = (on: boolean) =>
  cn(
    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold whitespace-nowrap transition-colors duration-150",
    on
      ? "bg-tide-lagoon-tint border-transparent text-teal-900"
      : "bg-card border-ink-300 text-foreground hover:bg-ink-50",
  );
export const linkBtn =
  "text-primary inline-flex min-h-8 items-center text-[13px] font-semibold underline-offset-4 hover:underline";

/** Hover and focus detail. The trigger is focusable so a keyboard reaches it too. */
export function Tip({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            className={cn(
              "focus-visible:ring-primary rounded outline-none focus-visible:ring-2",
              className,
            )}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent className="text-[12px] leading-4">{label}</TooltipContent>
    </Tooltip>
  );
}

/** A dot beside its word: colour is never the only signal. */
export function Dot({ className }: { className: string }) {
  return (
    <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", className)} />
  );
}

/** The toast at the bottom centre (§2.11), read politely. */
export function useToast(): [ReactNode, (m: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(null), 3500);
  }, []);
  useEffect(() => () => void (t.current && clearTimeout(t.current)), []);
  const node = (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
    >
      {msg ? (
        <span className="bg-tide-navy-900 text-tide-on-band pointer-events-auto max-w-xl rounded-full px-5 py-2.5 text-[14px] font-semibold shadow-lg">
          {msg}
        </span>
      ) : null}
    </div>
  );
  return [node, show];
}

export const newKey = () => crypto.randomUUID();
