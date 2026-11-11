import type { EmrDb } from "@/lib/emr/db";
import type { CaseFilter, CaseRow } from "@/lib/pharmacy/cases/derive";
import Link from "next/link";
import { cache } from "react";

import { EmptyState, KeyFigure, KeyFigureGrid, Panel, Pill } from "@/components/tide/work/kit";
import { FilterChips } from "@/components/tide/work/space";
import { CTL } from "@/content/pharmacy-rework-controls";
import { fill } from "@/content/pharmacy-workspace-v2";
import { db } from "@/db";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import {
  CASE_FILTERS,
  caseFilter,
  caseList,
  caseStatus,
  dur,
  isOverdue,
} from "@/lib/pharmacy/cases/derive";
import { caseDetail, loadCases } from "@/lib/pharmacy/cases/read";
import { when } from "@/lib/pharmacy/cd/sql";
import { isInCharge } from "@/lib/pharmacy/cd/store";
import { CaseDialog, ReportButton } from "./_components/cases-client";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);
const C = CTL.cases;

/** One read per request: the cases (1 query), the in-charge (1), and the open case's timeline and people (2). */
const casesPage = cache(async (hospitalId: string, userId: string, caseId: string | null) => {
  const d = db as unknown as EmrDb;
  const [cases, inCharge, detail] = await Promise.all([
    loadCases(d, hospitalId),
    isInCharge(d, userId, hospitalId),
    caseId ? caseDetail(d, hospitalId, caseId) : null,
  ]);
  return { cases, inCharge, detail };
});

const durWords = (ms: number) => {
  const x = dur(ms);
  return fill(CTL.common[x.unit === "min" ? "minutes" : x.unit === "h" ? "hours" : "days"], {
    n: x.n,
  });
};

/**
 * Investigations (rework PRD §6.5): every count that did not match, with an owner, a deadline and the in-charge's
 * sign-off. `?case=` opens one. The shell owns the h1.
 */
export default async function CasesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const actor = await requirePharmacyActor();
  const f = (CASE_FILTERS as readonly string[]).includes(one(sp.f) ?? "")
    ? (one(sp.f) as CaseFilter)
    : "open";
  const wanted = one(sp.case);
  const caseId = wanted && /^[0-9a-f-]{36}$/.test(wanted) ? wanted : null;
  const data = await casesPage(actor.hospitalId, actor.userId, caseId);
  const now = new Date();
  const all = caseList(data.cases, now);
  const shown = all.filter(caseFilter(f, actor.userId, now));
  const closed = all.filter((c) => c.signedOffAt);
  const avg = closed.length
    ? closed.reduce((a, c) => a + (c.signedOffAt!.getTime() - c.createdAt.getTime()), 0) /
      closed.length
    : null;
  const selected = caseId ? all.find((c) => c.id === caseId) : undefined;
  const href = (k: string) => `/pharmacy/controls/cases?f=${k}`;
  return (
    <div className="flex flex-col gap-4">
      <KeyFigureGrid>
        <KeyFigure
          label={C.kpiOpen}
          value={all.filter(caseFilter("open", actor.userId, now)).length}
          href={href("open")}
        />
        <KeyFigure
          label={C.kpiNew}
          value={all.filter(caseFilter("new", actor.userId, now)).length}
          href={href("new")}
        />
        <KeyFigure
          label={C.kpiOverdue}
          value={all.filter(caseFilter("overdue", actor.userId, now)).length}
          href={href("overdue")}
        />
        <KeyFigure
          label={C.kpiAvg}
          value={avg === null ? null : durWords(avg)}
          sub={fill(C.kpiAvgSub, { n: closed.length })}
        />
      </KeyFigureGrid>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FilterChips
          label={C.kpiOpen}
          current={f}
          chips={CASE_FILTERS.map((k) => ({
            key: k,
            label: C.filters[k],
            href: href(k),
            count: all.filter(caseFilter(k, actor.userId, now)).length,
          }))}
        />
        <ReportButton />
      </div>
      <Panel note={C.hint}>
        {shown.length ? (
          <ul className="flex flex-col gap-2">
            {shown.map((c) => (
              <li key={c.id}>
                <CaseCard c={c} now={now} href={`/pharmacy/controls/cases?f=${f}&case=${c.id}`} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact title={C.none} why={f === "mine" ? C.noneMine : C.noneAny} />
        )}
      </Panel>
      {selected && data.detail ? (
        <CaseDialog
          c={selected}
          detail={data.detail}
          me={actor.userId}
          inCharge={data.inCharge}
          closeHref={href(f)}
          due={dueWord(selected, now)}
        />
      ) : null}
    </div>
  );
}

const dueWord = (c: CaseRow, now: Date) => {
  const W = CTL.caseDialog.dueWord;
  if (c.signedOffAt) return fill(W.closed, { when: when(c.signedOffAt) });
  if (!c.ownerUserId) return W.none;
  if (isOverdue(c, now)) return fill(W.overdue, { t: durWords(now.getTime() - c.dueAt.getTime()) });
  return fill(W.due, { t: durWords(c.dueAt.getTime() - now.getTime()), when: when(c.dueAt) });
};

function CaseCard({ c, now, href }: { c: CaseRow; now: Date; href: string }) {
  const s = caseStatus(c);
  const late = isOverdue(c, now);
  return (
    <Link
      href={href}
      scroll={false}
      className="bg-card shadow-tide-card rounded-tide-row hover:bg-ink-50 flex min-h-11 flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <Pill>{C.sev[c.severity]}</Pill>
          <Pill tone={s === "closed" ? "passed" : "neutral"}>{C.status[s]}</Pill>
          <span className="text-[14px] font-semibold">
            {c.medicineName} · {c.placeName}
          </span>
        </span>
        <span className="text-caption text-ink-600">
          {c.what ?? fill(c.qty < 0 ? C.short : C.over, { n: Math.abs(c.qty) })} ·{" "}
          {C.src[c.fromHandover ? "cd_handover" : c.sourceType]} ·{" "}
          {fill(C.found, { when: when(c.createdAt) })}
          {c.sourceType !== "manual" ? ` · ${c.fixedAt ? C.numberFixed : C.stillDiffers}` : ""}
          {c.escalated ? ` · ${C.escalated}` : ""}
        </span>
      </div>
      <span className="flex items-center gap-2 text-[13px]">
        <span>{c.owner ?? C.notAssigned}</span>
        {late ? (
          <Pill tone="caution">
            {fill(C.overdueBy, { t: durWords(now.getTime() - c.dueAt.getTime()) })}
          </Pill>
        ) : s === "closed" ? null : (
          <span className="text-ink-600">
            {fill(C.dueIn, { t: durWords(c.dueAt.getTime() - now.getTime()) })}
          </span>
        )}
      </span>
    </Link>
  );
}
