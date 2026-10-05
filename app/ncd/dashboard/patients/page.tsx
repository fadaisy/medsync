import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

import { can } from "@/lib/ncdreg/context";
import {
  drillDown,
  indicatorLabel,
  monthLong,
  parseFilters,
  parseMonth,
} from "@/lib/ncdreg/read/dashboard";
import { requireNcdScope } from "@/lib/ncdreg/scope";
import { EmptyState, Num, Page, PageTitle, ROOMY_TABLE } from "../../_components/kit";

export const metadata: Metadata = { title: "Patients behind a figure · NCD registry" };

type Search = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/** F2: the patients behind one dashboard count, for drill-down roles only; every opening is audited. */
export default async function DrillDownPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { ctx } = await requireNcdScope();
  if (!can(ctx, "drill_down")) notFound();
  const sp = await searchParams;
  const code = str(sp.code);
  const part = str(sp.part);
  if (!/^[A-Za-z0-9_.]+$/.test(code) || !/^[A-Za-z0-9_:\-]+$/.test(part)) notFound();
  const month = parseMonth(str(sp.month) || null, ctx.today);
  const filters = parseFilters(sp, ctx.catalogue);
  const { result, count, people } = await drillDown(ctx, { code, part, month, filters });
  if (!result) notFound();

  const condition = result.condition
    ? ctx.catalogue.find((m) => m.code === result.condition)?.label
    : null;
  const back = new URLSearchParams(
    Object.entries(sp).filter(
      (e): e is [string, string] => typeof e[1] === "string" && !["code", "part"].includes(e[0]),
    ),
  );
  return (
    <Page>
      <Link
        href={`/ncd/dashboard?${back}`}
        className="text-caption text-ink-700 inline-flex w-fit items-center gap-1 underline-offset-2 hover:underline"
      >
        <ArrowLeftIcon className="size-3.5" aria-hidden />
        Dashboard
      </Link>
      <PageTitle
        title={`${indicatorLabel(result.code)}${condition ? `, ${condition}` : ""}`}
        subline={
          <>
            {result.code} ·{" "}
            {part === "num"
              ? "numerator"
              : part === "den"
                ? "denominator"
                : part.replace(/_/g, " ")}{" "}
            · {monthLong(month)} · {count.toLocaleString("en-GB")}{" "}
            {count === 1 ? "entry" : "entries"} · definition {result.version}. This list is logged.
          </>
        }
      />
      {people.length === 0 ? (
        <EmptyState title="No patients behind this figure." />
      ) : (
        <table className={`w-full border-collapse ${ROOMY_TABLE}`}>
          <thead>
            <tr className="text-muted-foreground border-ink-150 border-b text-left">
              <th scope="col" className="pr-4 font-medium">
                Patient
              </th>
              <th scope="col" className="pr-4 font-medium">
                Registry number
              </th>
              <th scope="col" className="hidden pr-4 font-medium sm:table-cell">
                Age, sex
              </th>
              <th scope="col" className="hidden font-medium md:table-cell">
                District
              </th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id} className="border-ink-100 border-b">
                <td className="pr-4">
                  {can(ctx, "person_search") ? (
                    <Link
                      href={`/ncd/patients/${p.id}`}
                      className="text-foreground focus-visible:shadow-focus rounded-xs font-medium underline-offset-2 outline-none hover:underline"
                    >
                      {p.name}
                    </Link>
                  ) : (
                    <span className="text-foreground font-medium">{p.name}</span>
                  )}
                  {p.isSynthetic ? (
                    <span className="text-muted-foreground ml-2 text-[11px]">Synthetic</span>
                  ) : null}
                </td>
                <td className="pr-4">
                  <Num>{p.registryNumber}</Num>
                </td>
                <td className="text-ink-700 hidden pr-4 sm:table-cell">
                  {p.age}, {p.sex}
                </td>
                <td className="text-ink-700 hidden md:table-cell">{p.district ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Page>
  );
}
