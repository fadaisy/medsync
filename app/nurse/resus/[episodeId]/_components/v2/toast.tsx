"use client";

import type { ToastSpec } from "./desk-context";
import { useEffect, useState } from "react";
import { CircleCheckIcon, CircleXIcon, TriangleAlertIcon, XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** A queued toast: the spec `ui.toast()` received, plus the desk's id. */
export interface DeskToast extends ToastSpec {
  id: string;
}

const TOAST_MS = 10_000;
/** Only the newest few are on screen; older ones wait (they still time out). */
const MAX_VISIBLE = 3;

// The toast is inverted (dark in light mode, light in dark mode). The teal ramp
// flips with the theme, so teal-200 is the deep teal in dark; amber/rose don't.
const TONE_ICON = {
  info: { Icon: CircleCheckIcon, cls: "text-teal-400 dark:text-teal-200" },
  warn: { Icon: TriangleAlertIcon, cls: "text-amber-400 dark:text-amber-700" },
  // A failed write is the one toast allowed red (Law 5: a failed action).
  error: { Icon: CircleXIcon, cls: "text-rose-400 dark:text-rose-700" },
} as const;

/**
 * The desk's toasts (UI-BUILD-SPEC §3 / §8): bottom-centre, 10 s, Undo / Edit,
 * no library. The timer pauses while the pointer or focus is on a toast, so
 * Undo is never snatched away mid-reach. Info and warn toasts sit in a polite
 * live region; a write that was not saved is an alert that stays until
 * dismissed. Above the bottom bar; over the arrest console (no bottom bar) they
 * drop to the edge and, below lg, only the newest shows, so they never stack
 * over console controls.
 */
export function Toaster({
  toasts,
  onDismiss,
  overConsole,
}: {
  toasts: DeskToast[];
  onDismiss: (id: string) => void;
  overConsole: boolean;
}) {
  const place = cn(
    "pointer-events-none fixed inset-x-0 z-40 flex flex-col items-center gap-2 px-4 xl:bottom-6",
    overConsole
      ? "bottom-[max(env(safe-area-inset-bottom),1rem)]"
      : "bottom-[calc(4.5rem+env(safe-area-inset-bottom))]",
  );
  const stack = "flex w-full flex-col items-center gap-2";
  const item = overConsole ? "max-lg:not-last:hidden" : undefined;
  const errors = toasts.filter((t) => t.tone === "error");
  const notes = toasts.filter((t) => t.tone !== "error");
  return (
    <div className={place}>
      <div role="status" aria-live="polite" className={stack}>
        {notes.slice(-MAX_VISIBLE).map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={onDismiss} className={item} />
        ))}
      </div>
      <div role="alert" className={stack}>
        {errors.slice(-MAX_VISIBLE).map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={onDismiss} className={item} />
        ))}
      </div>
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
  className,
}: {
  toast: DeskToast;
  onDismiss: (id: string) => void;
  className?: string;
}) {
  const [paused, setPaused] = useState(false);
  const sticky = toast.tone === "error";
  useEffect(() => {
    if (paused || sticky) return;
    const id = setTimeout(() => onDismiss(toast.id), TOAST_MS);
    return () => clearTimeout(id);
  }, [paused, sticky, toast.id, onDismiss]);

  const { Icon, cls } = TONE_ICON[toast.tone ?? "info"];
  const act = (fn: () => void) => () => {
    fn();
    onDismiss(toast.id);
  };
  const btn =
    "tap text-body-s inline-flex min-h-11 shrink-0 items-center rounded-md px-3 font-medium text-background underline-offset-4 hover:underline";

  return (
    <div
      className={cn(
        "bg-foreground text-background shadow-popover pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-lg py-1 pr-1 pl-3",
        "ease-expo-out transition-[opacity,transform] duration-150 motion-reduce:transition-none starting:translate-y-2 starting:opacity-0",
        className,
      )}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon aria-hidden className={cn("size-4 shrink-0", cls)} />
      <p className="text-body-s min-w-0 flex-1 py-2">{toast.message}</p>
      {toast.retry ? (
        <button type="button" className={btn} onClick={act(toast.retry)}>
          Retry
        </button>
      ) : null}
      {toast.undo ? (
        <button type="button" className={btn} onClick={act(toast.undo)}>
          Undo
        </button>
      ) : null}
      {toast.edit ? (
        <button type="button" className={btn} onClick={act(toast.edit)}>
          Edit
        </button>
      ) : null}
      <button
        type="button"
        aria-label="Dismiss"
        className="tap text-background/70 hover:text-background inline-flex size-11 shrink-0 items-center justify-center rounded-md"
        onClick={() => onDismiss(toast.id)}
      >
        <XIcon aria-hidden className="size-4" />
      </button>
    </div>
  );
}
