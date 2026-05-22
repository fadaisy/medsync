"use client";

import { useState } from "react";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * §01 — Announcement bar. Mirrors Attio's thin top strip.
 * Client component because it's dismissible (in-memory; no storage).
 */
export function AnnouncementBar() {
  const [open, setOpen] = useState(true);
  if (!open) return null;

  return (
    <div
      role="status"
      className="bg-primary text-primary-foreground relative w-full px-4 py-2 text-center text-[13px]"
    >
      <span>
        MedSync is in early access in Uganda —{" "}
        <a href="/onboarding/hospital" className="underline underline-offset-2">
          express interest →
        </a>
      </span>
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label="Dismiss announcement"
        className={cn(
          "absolute top-1/2 right-3 -translate-y-1/2 rounded-sm p-0.5",
          "opacity-70 transition-opacity hover:opacity-100",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current",
        )}
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
}
