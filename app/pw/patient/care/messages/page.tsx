import type { Metadata } from "next";
import { CalendarIcon } from "lucide-react";

import { ButtonLink, ICON } from "@/components/tide/kit";
import { PageHeader } from "@/components/tide/shell";
import { CARE_COPY } from "@/content/patient/care";

export const metadata: Metadata = { title: "Messages · MedSync" };

const C = CARE_COPY.messages;

/**
 * Messages (the phone's care/chat.tsx). There is no clinician inbox to answer a message (ADR 0342 §4), so the
 * page says so plainly and offers a visit and Help, as the phone does with `mobileChat` off. With it on, the
 * phone shows a demo thread with no engine behind it; the web does not build one.
 * ponytail: one honest page whatever the flag; build the thread when a messaging engine exists.
 */
export default function MessagesPage() {
  return (
    <>
      <PageHeader
        title={C.title}
        area="team"
        back={{ href: "/patient/care", label: CARE_COPY.backToCare }}
      />
      <div className="flex w-full max-w-[640px] flex-col items-start gap-3">
        <p className="text-[17px] leading-[25px] font-semibold">{C.notYet}</p>
        <p className="text-pw-ink-2 text-[15px] leading-[21px] font-medium">{C.instead}</p>
        <ButtonLink href="/patient/book" className="mt-2">
          <CalendarIcon className="size-5" {...ICON} />
          {C.book}
        </ButtonLink>
      </div>
    </>
  );
}
