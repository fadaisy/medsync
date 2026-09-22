"use client";

import type { ReactNode } from "react";

import { emergencyEventAction } from "../actions";

/**
 * A `tel:` anchor that logs the tap (PRD §9.6 `emergency_call_tapped`,
 * contact id only) and still navigates: the action is fire-and-forget,
 * never awaited, so an offline phone dials exactly as fast.
 */
export function CallLink({
  href,
  contactId,
  className,
  children,
}: {
  href: string;
  contactId: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className={className}
      onClick={() => {
        void emergencyEventAction({ event: "call_tapped", contact_id: contactId }).catch(() => {});
      }}
    >
      {children}
    </a>
  );
}
