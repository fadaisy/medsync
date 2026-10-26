"use client";

import { useRouter } from "next/navigation";

import { Segments } from "@/components/tide/controls";
import { Button } from "@/components/tide/kit";
import { HOME_COPY as C } from "@/content/patient/home";

/** Today / This week: "This week" is the Visits page, as on the phone. */
export function HomeSegments() {
  const router = useRouter();
  return (
    <Segments
      label={C.segmentsLabel}
      options={[
        { value: "today", label: C.today },
        { value: "week", label: C.thisWeek },
      ]}
      value="today"
      onChange={(v) => {
        if (v === "week") router.push("/patient/visits");
      }}
      className="max-[760px]:w-full"
    />
  );
}

/** "Try again": read the page from the server again. */
export function RetryButton() {
  const router = useRouter();
  return (
    <Button tone="outline" size="s" onClick={() => router.refresh()}>
      {C.tryAgain}
    </Button>
  );
}
