"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  acceptWaitlistOfferAction,
  withdrawWaitlistAction,
} from "@/app/patient/appointments/actions";
import { Button, Card, Note, Overline } from "@/components/tide/kit";
import { VISITS_COPY as C } from "@/content/patient/visits";

/**
 * A place in the line (the phone's features/visits/waitlist-card.tsx; Gate E, ADR 0090): waiting, with one
 * sentence and a way out; offered, with the day, "Take this place" and the expiry in full words. Both go
 * through the existing Edge Function actions; a refusal shows the server's sentence word for word.
 */
export function WaitlistOffer({
  id,
  offered,
  overline,
  title,
  hospitalName,
  line,
}: {
  id: string;
  offered: boolean;
  overline: string;
  title: string;
  hospitalName: string;
  line: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"accept" | "withdraw" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: "accept" | "withdraw") => {
    setBusy(kind);
    setError(null);
    const fd = new FormData();
    fd.set("waitlist_entry_id", id);
    const res = await (kind === "accept" ? acceptWaitlistOfferAction : withdrawWaitlistAction)(
      {},
      fd,
    );
    setBusy(null);
    if (res.error) setError(res.error);
    // A refused accept still re-reads: the offer may have gone to someone else.
    if (res.ok || kind === "accept") router.refresh();
  };

  return (
    <Card className={offered ? "ring-pw-accent flex flex-col gap-3 ring-2" : "flex flex-col gap-3"}>
      <Overline>{overline}</Overline>
      <div className="flex flex-col gap-0.5">
        <h2 className="text-xl leading-[26px] font-semibold">{title}</h2>
        <p className="text-pw-ink-2 text-sm">{hospitalName}</p>
      </div>
      <p className="text-[17px] leading-6">{line}</p>
      {error ? <Note>{error}</Note> : null}
      <div className="flex flex-wrap gap-2">
        {offered ? (
          <Button busy={busy === "accept"} onClick={() => void run("accept")}>
            {C.takePlace}
          </Button>
        ) : null}
        <Button
          tone={offered ? "soft" : "outline"}
          size="m"
          busy={busy === "withdraw"}
          onClick={() => void run("withdraw")}
        >
          {C.leaveList}
        </Button>
      </div>
    </Card>
  );
}
