"use client";

import type { patientSearch } from "@/lib/ncdreg/read/views";
import Link from "next/link";
import { useState, useTransition } from "react";
import { SearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConditionTags, Num } from "../../_components/kit";
import { patientSearchAction } from "../../actions";

type Row = Awaited<ReturnType<typeof patientSearch>>[number];

/** Search by name or registry number, sent by POST so no name lands in a URL or a log. */
export function PatientSearch() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pending, start] = useTransition();
  return (
    <section aria-label="Search the register" className="flex flex-col gap-3">
      <form
        role="search"
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => setRows(await patientSearchAction(q)));
        }}
      >
        <label className="border-input focus-within:shadow-focus flex h-9 w-full max-w-sm items-center gap-2 rounded-lg border px-2.5">
          <SearchIcon className="text-ink-500 size-4" aria-hidden />
          <span className="sr-only">Name or registry number</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name or registry number"
            className="text-body-s flex-1 bg-transparent outline-none"
          />
        </label>
        <Button type="submit" variant="secondary" disabled={pending || q.trim().length < 2}>
          Search
        </Button>
        {rows ? (
          <Button type="button" variant="ghost" onClick={() => (setRows(null), setQ(""))}>
            Clear
          </Button>
        ) : null}
      </form>
      {rows ? (
        rows.length ? (
          <ul className="border-border divide-border flex flex-col divide-y border-y">
            {rows.map((r) => (
              <li
                key={r.identity.id}
                className="flex min-h-14 flex-wrap items-center justify-between gap-2 px-1 py-2"
              >
                <Link
                  href={`/ncd/patients/${r.identity.id}`}
                  className="flex flex-col hover:underline"
                >
                  <span className="font-medium">{r.identity.name}</span>
                  <Num className="text-muted-foreground text-[12px]">
                    {r.identity.registryNumber} · {r.identity.sex === "female" ? "F" : "M"} ·{" "}
                    {r.identity.age} y
                  </Num>
                </Link>
                <ConditionTags conditions={r.conditions} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body-s text-ink-700">
            No patient matches. Check the spelling, or search by registry number.
          </p>
        )
      ) : null}
    </section>
  );
}
