import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Tag } from "@/components/medsync/tag";
import { can } from "@/lib/ncdreg/context";
import { REVIEW_LABELS } from "@/lib/ncdreg/read/derive";
import { reviewsDueList } from "@/lib/ncdreg/read/views";
import { requireNcdScope } from "@/lib/ncdreg/scope";
import { EmptyState, fmtDate, Num, Page, PageTitle } from "../_components/kit";

export const metadata: Metadata = { title: "Reviews due" };

/** C3: patients with a review component due in the next 30 days or already due. Neutral tags only. */
export default async function ReviewsPage() {
  const { ctx } = await requireNcdScope();
  if (!can(ctx, "person_search", "review_write", "demo_write")) notFound();
  const rows = await reviewsDueList(ctx);
  return (
    <Page>
      <PageTitle
        title="Reviews due"
        subline={`Due now or in the next 30 days, as at ${fmtDate(ctx.today)} · earliest first`}
      />
      {rows.length ? (
        <div className="border-border overflow-x-auto border-y">
          <table className="w-full min-w-[720px] border-collapse text-[14px]">
            <caption className="sr-only">Patients with a review due</caption>
            <thead>
              <tr className="text-ink-600 border-border border-b text-left text-[13px]">
                {["Patient", "Review items", "Earliest due"].map((h) => (
                  <th key={h} scope="col" className="h-11 px-3.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.identity.id}
                  className="border-border hover:bg-ink-25 h-14 border-b last:border-b-0"
                >
                  <td className="px-3.5 py-2">
                    <Link
                      href={`/ncd/patients/${r.identity.id}?tab=reviews`}
                      className="focus-visible:shadow-focus flex flex-col rounded-sm outline-none"
                    >
                      <span className="text-foreground font-medium underline-offset-4 hover:underline">
                        {r.identity.name}
                      </span>
                      <span className="text-caption text-muted-foreground font-mono">
                        {r.identity.registryNumber}
                      </span>
                    </Link>
                  </td>
                  <td className="px-3.5 py-2">
                    <ul className="flex flex-wrap gap-1.5">
                      {r.reviews.map((v) => (
                        <li key={v.component}>
                          <Tag hue="slate">
                            {REVIEW_LABELS[v.component]} {v.due ? "due" : `due ${fmtDate(v.dueOn)}`}{" "}
                            · {v.last ? `last done ${fmtDate(v.last)}` : "never done"}
                          </Tag>
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-3.5 py-2">
                    <Num>{r.earliest <= ctx.today ? "Due now" : fmtDate(r.earliest)}</Num>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="No reviews due">
          <p className="text-body-s text-muted-foreground">
            Patients whose kidney, eye, foot, lipid or HbA1c review falls due in the next 30 days
            appear here.
          </p>
        </EmptyState>
      )}
    </Page>
  );
}
