import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Tag } from "@/components/medsync/tag";
import { facilityStatus } from "@/lib/ncdreg/admin";
import { can } from "@/lib/ncdreg/context";
import { closedVisits, lastClasses, overdueDays, REVIEW_LABELS, reviewsDue } from "@/lib/ncdreg/read/derive";
import { identities, myPanel } from "@/lib/ncdreg/read/views";
import { requireNcdScope } from "@/lib/ncdreg/scope";
import { ClassChip, EmptyState, fmtDate, Num, Page, PageTitle } from "../_components/kit";
import { FilterChipLink } from "./_components/filter-link";

export const metadata: Metadata = { title: "My patients" };

const LISTS = {
  not_leading: { label: "Not in range at last visit", empty: "None of your patients is outside range at their last visit." },
  review_due: { label: "Review due", empty: "None of your patients has a review due." },
  overdue: { label: "Overdue", empty: "None of your patients is overdue." },
} as const;
type ListKey = keyof typeof LISTS;

/** F4: a clinician's own panel: patients they saw who are not in range at the last visit, overdue, or due a review. */
export default async function MyPatientsPage({ searchParams }: { searchParams: Promise<{ list?: string }> }) {
  const { ctx } = await requireNcdScope();
  if (!can(ctx, "own_panel", "clinician_visit_write")) notFound();
  const sp = await searchParams;
  const list: ListKey = sp.list && sp.list in LISTS ? (sp.list as ListKey) : "not_leading";
  const status = await facilityStatus(ctx);
  const demoOn = !!status.demo && ["loading", "on"].includes(status.demo.status);
  const { lists, persons } = await myPanel(ctx, demoOn);
  const ids = lists[list];
  const idn = await identities(ctx, ids);
  const byId = new Map(persons.map((p) => [p.id, p]));
  return (
    <Page>
      <PageTitle title="My patients" subline="Patients you closed a visit for" />
      <nav aria-label="My patient lists" className="flex flex-wrap gap-2">
        {(Object.keys(LISTS) as ListKey[]).map((k) => (
          <FilterChipLink key={k} href={`/ncd/my?list=${k}`} active={k === list} count={lists[k].length}>
            {LISTS[k].label}
          </FilterChipLink>
        ))}
      </nav>
      {ids.length ? (
        <div className="border-border overflow-x-auto border-y">
          <table className="w-full min-w-[720px] border-collapse text-[14px]">
            <caption className="sr-only">{LISTS[list].label}</caption>
            <thead>
              <tr className="text-ink-600 border-border border-b text-left text-[13px]">
                {["Patient", "Last visit", list === "overdue" ? "Days overdue" : list === "review_due" ? "Review items" : "At last visit"].map((h) => (
                  <th key={h} scope="col" className="h-11 px-3.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ids.map((id) => {
                const p = byId.get(id);
                const i = idn.get(id);
                if (!p || !i) return null;
                const last = closedVisits(p).at(-1)?.date;
                return (
                  <tr key={id} className="border-border hover:bg-ink-25 h-14 border-b last:border-b-0">
                    <td className="px-3.5 py-2">
                      <Link href={`/ncd/patients/${id}`} className="focus-visible:shadow-focus flex flex-col rounded-sm outline-none">
                        <span className="text-foreground font-medium underline-offset-4 hover:underline">{i.name}</span>
                        <span className="text-caption text-muted-foreground font-mono">{i.registryNumber}</span>
                      </Link>
                    </td>
                    <td className="px-3.5 py-2">{last ? <Num>{fmtDate(last)}</Num> : <span className="text-muted-foreground">None</span>}</td>
                    <td className="px-3.5 py-2">
                      {list === "overdue" ? (
                        <Num>{overdueDays(p, ctx.today) ?? "–"}</Num>
                      ) : list === "review_due" ? (
                        <span className="flex flex-wrap gap-1.5">
                          {reviewsDue(p, ctx.catalogue, ctx.today)
                            .filter((r) => r.due)
                            .map((r) => (
                              <Tag key={r.component} hue="slate">
                                {REVIEW_LABELS[r.component]} due · {r.last ? `last done ${fmtDate(r.last)}` : "never done"}
                              </Tag>
                            ))}
                        </span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {lastClasses(p, ctx.catalogue).map((c) => (
                            <ClassChip key={c.label} label={c.label} leading={c.leading} cls={c.cls} clinicianRecorded={c.clinicianRecorded} />
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title={LISTS[list].empty} />
      )}
    </Page>
  );
}
