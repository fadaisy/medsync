"use client";

import { useLinkStatus } from "next/link";

import { cn } from "@/lib/utils";

/**
 * Inside a tab or chip link: fills it while its navigation is pending. A tab switch stays on the same route, so no
 * `loading.tsx` shows; this is the only sign the click landed. The link needs `relative isolate`.
 */
export function LinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      data-pending={pending || undefined}
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 rounded-full opacity-0",
        "duration-normal ease-expo-out transition-opacity motion-reduce:transition-none",
        "data-pending:opacity-70 motion-safe:data-pending:animate-pulse",
        className,
      )}
    />
  );
}
