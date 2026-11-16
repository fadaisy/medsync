"use client";

import type { WebVisitRow } from "@/components/tide/v2-visit-web";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { VisitsWeb } from "@/components/tide/v2-visit-web";
import { acceptOfferAction } from "@/lib/patient-web/visit-v2-actions";

/** The v2 Visits list (W4) with its offer buttons wired: Keep takes the offered day, Pick goes to Book. */
export function VisitsV2({
  offers,
  upcoming,
  past,
  month,
}: {
  offers: { id: string; title: string; line: string; sessionId: string }[];
  upcoming: WebVisitRow[];
  past: WebVisitRow[];
  month: string;
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  return (
    <VisitsWeb
      offers={offers.filter((o) => !hidden.has(o.id))}
      upcoming={upcoming}
      past={past}
      month={month}
      onOffer={(id, answer) => {
        const offer = offers.find((o) => o.id === id);
        if (answer === "pick") router.push("/patient/book");
        if (answer === "cancel") setHidden((h) => new Set(h).add(id));
        if (answer === "keep" && offer)
          void acceptOfferAction(id, offer.sessionId).then(() => router.refresh());
      }}
    />
  );
}
