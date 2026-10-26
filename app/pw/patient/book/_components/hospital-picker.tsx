"use client";

import type { HospitalOption } from "@/lib/patient-web/book-data";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { selectPrimaryHospitalAction } from "@/app/patient/hospitals/actions";
import { Card, Note } from "@/components/tide/kit";
import { BOOK_COPY as C } from "@/content/patient/book";
import { cn } from "@/lib/utils";
import { RetryButton } from "../../_components/home-bits";

/**
 * "Choose your hospital first" (mobile/src/features/visits/hospital-picker.tsx): every active hospital, and the
 * same write the old web makes (`patient_profiles.primary_facility_id`, RLS). Chosen, the page reads again.
 * `hospitals` null = the list failed to load.
 */
export function HospitalPicker({
  hospitals,
  current = null,
  next,
  title = C.pickHospitalTitle,
  line = C.pickHospitalLine,
}: {
  hospitals: HospitalOption[] | null;
  /** The patient's hospital now, marked and not offered again. */
  current?: string | null;
  /** Where to go once chosen; absent, the page reads again. */
  next?: string;
  title?: string;
  line?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const choose = (id: string) => {
    setBusy(id);
    setError(null);
    start(async () => {
      const res = await selectPrimaryHospitalAction(id).catch(() => ({
        error: C.hospitalSaveFailed,
      }));
      if (res.error) {
        setError(C.hospitalSaveFailed);
        setBusy(null);
        return;
      }
      if (next) router.push(next);
      else router.refresh();
    });
  };

  return (
    <Card className="flex flex-col gap-2.5">
      <h2 className="text-[17px] leading-[22px] font-semibold">{title}</h2>
      <p className="text-pw-ink-2 text-[15px] leading-[21px]">{line}</p>
      {hospitals === null ? (
        <div className="flex flex-col items-start gap-2">
          <Note>{C.hospitalsFailed}</Note>
          <RetryButton />
        </div>
      ) : hospitals.length === 0 ? (
        <Note>{C.noHospitals}</Note>
      ) : (
        <ul className="flex flex-col gap-2">
          {hospitals.map((h) =>
            h.id === current ? (
              <li
                key={h.id}
                className="rounded-pw-row bg-pw-accent-tint flex min-h-[52px] items-center justify-between gap-3 p-3"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="text-base font-semibold">{h.name}</span>
                  {h.district ? (
                    <span className="text-pw-ink-2 text-[13px] font-medium">{h.district}</span>
                  ) : null}
                </span>
                <span className="text-pw-accent-text text-[13px] font-semibold">
                  {C.yourHospital}
                </span>
              </li>
            ) : (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => choose(h.id)}
                  disabled={busy !== null}
                  aria-busy={busy === h.id || undefined}
                  aria-label={C.chooseHospital(h.name)}
                  className={cn(
                    "rounded-pw-row flex min-h-[52px] w-full flex-col gap-0.5 p-3 text-left ring-inset",
                    "focus-visible:outline-pw-focus focus-visible:outline-2 focus-visible:outline-offset-2",
                    busy === h.id
                      ? "bg-pw-accent-tint ring-pw-accent ring-2"
                      : "bg-pw-surface ring-pw-line ring-1",
                    busy !== null && busy !== h.id && "opacity-50",
                  )}
                >
                  <span className="text-base font-semibold">{h.name}</span>
                  {h.district ? (
                    <span className="text-pw-ink-2 text-[13px] font-medium">{h.district}</span>
                  ) : null}
                </button>
              </li>
            ),
          )}
        </ul>
      )}
      {error ? (
        <p role="alert" className="text-pw-ink text-[15px] font-semibold">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
