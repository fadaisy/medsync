"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/** Refresh (D-PW-12): reads the page again on the server. There is no live channel, so nothing updates by itself. */
export function RefreshButton({ label, busy }: { label: string; busy: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => router.refresh())}
      disabled={pending}
      className="text-body-s text-primary font-medium underline-offset-4 hover:underline disabled:opacity-60"
    >
      {pending ? busy : label}
    </button>
  );
}
