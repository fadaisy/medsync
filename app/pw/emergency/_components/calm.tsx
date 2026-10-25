import type { EmergencySheetContact } from "@/lib/emergency/queries";
import type { ReactNode } from "react";

import { CallLink } from "@/app/emergency/_components/call-link";
import { telHref } from "@/app/emergency/_lib/client";
import { buttonClass, Note } from "@/components/tide/kit";
import { PageHeader } from "@/components/tide/shell";
import { HELP_COPY } from "@/content/patient/help";

/**
 * The two calm screens (the phone's components/emergency/calm-screen.tsx; PRD §5.5): self-harm and sexual
 * violence. No red, no alarm, no questionnaire, no motion. The words are the screen; the contacts are what is
 * verified for the route's kind, then the general line, each a `tel:` that logs its contact id only.
 */
export function CalmScreen({
  title,
  lead,
  body,
  contacts,
  fallback,
  children,
}: {
  title: string;
  lead: string;
  body?: string;
  contacts: EmergencySheetContact[];
  fallback: string;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <PageHeader back={{ href: "/emergency", label: HELP_COPY.calm.back }} title={title} />
      <p className="text-[22px] leading-[30px] font-semibold tracking-[-0.01em]">{lead}</p>
      {body ? <p className="text-[17px] leading-[25px]">{body}</p> : null}
      {contacts.length ? (
        <ul className="flex flex-col gap-4">
          {contacts.map((c) => (
            <li key={c.id} className="flex flex-col items-start gap-2">
              <span className="text-[15px] font-medium">{c.label}</span>
              <CallLink
                href={telHref(c.number)}
                contactId={c.id}
                className={buttonClass("outline")}
              >
                <span aria-hidden>{HELP_COPY.calm.callNumber(c.number)}</span>
                <span className="sr-only">{HELP_COPY.lines.callLabel(c.label, c.number)}</span>
              </CallLink>
            </li>
          ))}
        </ul>
      ) : (
        <Note>{fallback}</Note>
      )}
      {children}
    </div>
  );
}

/** The route's kind first, then the general line; verified only (ADR 0098 ruling 8). */
export function calmContacts(
  contacts: readonly EmergencySheetContact[],
  kind: "crisis" | "sv",
): EmergencySheetContact[] {
  const verified = contacts.filter((c) => c.verificationStatus === "verified");
  return [
    ...verified.filter((c) => c.kind === kind),
    ...verified.filter((c) => c.kind === "general").slice(0, 1),
  ];
}
