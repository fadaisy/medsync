import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { can } from "@/lib/ncdreg/context";
import { patientsList } from "@/lib/ncdreg/read/views";
import { requireNcdScope } from "@/lib/ncdreg/scope";
import { ConditionTags, fmtDate, Num, Page, PageTitle } from "../_components/kit";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  active: "Active",
  overdue: "Overdue",
  lost_to_follow_up: "Lost to follow-up",
  transferred_out: "Transferred out",
  died: "Died",
  withdrawn: "Withdrawn",
};

/** Patients: the register, searchable by name or registry number. The event form (D2) is one click from each row. */
export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { ctx } = await requireNcdScope();
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const list = await patientsList(ctx, { q: sp.q, limit: 50, offset: page * 50 });
  return (
    <Page>
      <PageTitle
        title="Patients"
        subline={`${list.total.toLocaleString("en-GB")} registered`}
        right={
          can(ctx, "enrol") ? (
            <Link href="/ncd/enrol" className={buttonVariants({ variant: "primary" })}>
              Search and enrol
            </Link>
          ) : null
        }
      />
      <form method="get" className="flex gap-2" role="search">
        <label htmlFor="q" className="sr-only">
          Name or registry number
        </label>
        <input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Name or registry number" className="border-input h-9 w-full max-w-sm rounded-lg border bg-transparent px-3 text-[14px]" />
        <button type="submit" className={buttonVariants({ variant: "secondary" })}>
          Search
        </button>
      </form>
      <div className="border-border overflow-x-auto border-y">
        <table className="w-full min-w-[760px] text-[14px]">
          <caption className="sr-only">Registered patients</caption>
          <thead>
            <tr className="text-ink-600 border-border border-b text-left text-[13px]">
              {["Patient", "Conditions", "Status", "Last visit", ""].map((h) => (
                <th key={h} scope="col" className="h-11 px-3.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.rows.map((r) => (
              <tr key={r.identity.id} className="border-border hover:bg-ink-25 border-b last:border-b-0">
                <td className="h-14 px-3.5">
                  <Link href={`/ncd/patients/${r.identity.id}`} className="flex flex-col hover:underline">
                    <span className="font-medium">{r.identity.name}</span>
                    <Num className="text-muted-foreground text-[12px]">
                      {r.identity.registryNumber} · {r.identity.sex === "female" ? "F" : "M"} · {r.identity.age} y
                    </Num>
                  </Link>
                </td>
                <td className="px-3.5">
                  <ConditionTags conditions={r.conditions} />
                </td>
                <td className="px-3.5">{STATUS[r.status]}</td>
                <td className="px-3.5">{r.lastVisit ? <Num>{fmtDate(r.lastVisit)}</Num> : <span className="text-muted-foreground">–</span>}</td>
                <td className="px-3.5 text-right">
                  <Link href={`/ncd/patients/${r.identity.id}?tab=events`} className="text-teal-text text-[13px] hover:underline">
                    Events
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav aria-label="Pages" className="flex items-center gap-3">
        {page > 0 ? <Link href={`?q=${encodeURIComponent(sp.q ?? "")}&page=${page - 1}`} className={buttonVariants({ variant: "secondary" })}>Previous</Link> : null}
        <span className="text-caption text-ink-600">
          {list.matched ? `${page * 50 + 1}–${Math.min(list.matched, page * 50 + 50)} of ${list.matched}` : "No match"}
        </span>
        {(page + 1) * 50 < list.matched ? <Link href={`?q=${encodeURIComponent(sp.q ?? "")}&page=${page + 1}`} className={buttonVariants({ variant: "secondary" })}>Next</Link> : null}
      </nav>
    </Page>
  );
}
