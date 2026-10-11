"use client";

import type { FoundRow } from "../actions";
import type { PatientIdentity } from "@/components/emr/orders/model";
import type { RowState } from "@/lib/pharmacy/queue";
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { SearchIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Button } from "@/components/ui/button";
import { SheetBody, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PHARMACY } from "@/content/pharmacy";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { findByPatientNumber } from "../actions";

/**
 * Find a prescription (§5.7): one field in the sidebar, an exact patient number, searched on the
 * server. Type and press Enter: the patient's prescriptions at this hospital open in a centred
 * dialog (ADR 0161), two interactions in all. The number is posted, never put in the URL (§12).
 */
const F = PHARMACY.find;
const when = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DEFAULT_TIME_ZONE,
  }).format(new Date(iso));

export function FindField() {
  const id = useId();
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [found, setFound] = useState<{
    rows: FoundRow[];
    identities: Record<string, PatientIdentity>;
  } | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    start(async () => {
      setFound(await findByPatientNumber({ patientNumber: value }));
      setOpen(true);
    });
  };
  const who = found?.rows[0] ? found.identities[found.rows[0].patientUserId] : undefined;

  return (
    <>
      <form role="search" onSubmit={submit} className="relative">
        <label htmlFor={id} className="sr-only">
          {F.label}
        </label>
        <SearchIcon
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
        />
        <input
          id={id}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={F.label}
          autoComplete="off"
          spellCheck={false}
          disabled={pending}
          className="border-input bg-card text-body-s focus-visible:shadow-focus h-9 min-h-11 w-full rounded-md border pr-2 pl-8 font-mono outline-none lg:min-h-9"
        />
      </form>
      <EditorDialog width="medium" open={open} onOpenChange={setOpen}>
        <div className="flex min-h-0 flex-1 flex-col">
          <SheetHeader>
            <SheetTitle>{who ? `${who.name} · ${who.mrn}` : F.title}</SheetTitle>
            <SheetDescription>{found?.rows.length ? F.lede : F.none}</SheetDescription>
          </SheetHeader>
          <SheetBody>
            {found?.rows.length ? (
              <ul className="divide-border flex flex-col divide-y">
                {found.rows.map((r) => (
                  <li
                    key={r.key}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="text-foreground text-body-s font-medium">
                        {r.medicines.join(", ")}
                      </span>
                      <span className="text-muted-foreground text-caption">
                        <span className="font-mono tabular-nums">{when(r.writtenAtIso)}</span>
                        {r.from ? ` · ${r.from}` : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusWord tone={r.state === "prescribed" ? "neutral" : "caution"}>
                        {PHARMACY.rowState[r.state as RowState]}
                      </StatusWord>
                      <Link
                        href={`/pharmacy/prescriptions/${encodeURIComponent(r.key)}`}
                        prefetch={false}
                        onClick={() => setOpen(false)}
                        className="text-label border-input hover:bg-muted focus-visible:shadow-focus inline-flex min-h-11 items-center rounded-md border px-3 outline-none sm:min-h-8"
                      >
                        {PHARMACY.queue.open}
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-4 flex justify-end">
              <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
                {F.close}
              </Button>
            </div>
          </SheetBody>
        </div>
      </EditorDialog>
    </>
  );
}
