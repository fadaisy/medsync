"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { HospitalIcon } from "lucide-react";

import { selectPrimaryHospitalAction } from "@/app/patient/hospitals/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The hospitals a patient can walk into today, as chips: theirs first and
 * filled, up to two others beside it, and "View more" once the network is
 * bigger than that. Tapping another chip makes it their hospital — the same
 * write the directory makes — and this screen re-renders with its clinics,
 * because the same-day door is always the patient's own hospital
 * (`pt-declare-intake` checks it).
 */
export function HospitalChips({
  hospitals,
  currentId,
}: {
  hospitals: ReadonlyArray<{ id: string; name: string }>;
  currentId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const shown = hospitals.slice(0, 3);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Hospital">
        {shown.map((h) => {
          const current = h.id === currentId;
          return (
            <Button
              key={h.id}
              type="button"
              variant={current ? "primary" : "secondary"}
              aria-pressed={current}
              disabled={pending || current}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const res = await selectPrimaryHospitalAction(h.id);
                  if (!res.ok) setError(res.error ?? "Couldn't switch hospital.");
                  else router.refresh();
                });
              }}
              className={cn("min-h-11 rounded-full", current && "cursor-default")}
            >
              <HospitalIcon className="size-3.5" aria-hidden />
              {h.name}
            </Button>
          );
        })}
        {hospitals.length > shown.length ? (
          <Link
            href="/patient/hospitals"
            className="text-primary text-body-s inline-flex min-h-11 items-center rounded-md px-2 underline-offset-4 hover:underline"
          >
            View more ({hospitals.length - shown.length})
          </Link>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-destructive text-body-s">
          {error}
        </p>
      ) : null}
    </div>
  );
}
