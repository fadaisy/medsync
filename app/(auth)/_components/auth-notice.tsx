import { TriangleAlertIcon } from "lucide-react";

/**
 * Form-level notice for the auth funnels — calm amber, icon-led, pops
 * in via scale-in when the message lands. An auth slip is routine
 * attention, never an emergency, so it stays out of clinical red.
 */
export function AuthNotice({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="scale-in flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] leading-snug text-amber-900 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-200"
    >
      <TriangleAlertIcon aria-hidden className="mt-px size-3.5 shrink-0" strokeWidth={2} />
      <span>{message}</span>
    </div>
  );
}

/** Tiny in-button progress ring shown while a server action is pending. */
export function ButtonSpinner() {
  return (
    <span
      aria-hidden
      className="size-3 shrink-0 rounded-full border-2 border-current/30 border-t-current motion-safe:animate-spin"
    />
  );
}
