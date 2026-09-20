"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { selectPrimaryHospitalAction } from "../actions";

/**
 * "Set as primary" on a hospital row.
 *
 * One state, not two: the page skips this control entirely on the row that
 * already is primary, because that row says so with its own
 * `<Pill tone="stable">Your hospital</Pill>` — a second "Your primary" chip
 * here printed the same fact twice, so the branch that rendered it is gone
 * along with the `isPrimary` prop that selected it.
 *
 * `min-h-11` because `size="sm"` is ~24px tall and this is the one control
 * on the hospitals page a thumb has to hit.
 */
export function SelectHospitalButton({
  hospitalId,
  label = "Set as primary",
}: {
  hospitalId: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        className="min-h-11 w-full"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await selectPrimaryHospitalAction(hospitalId);
            if (!res.ok) {
              setError(res.error ?? "Couldn't save that.");
            } else {
              router.refresh();
            }
          });
        }}
      >
        {pending ? "Saving…" : label}
      </Button>
      {error ? (
        <span role="alert" className="text-destructive ncd-reveal text-body-s">
          {error}
        </span>
      ) : null}
    </div>
  );
}
