import type { EmrDb } from "@/lib/emr/db";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { NotSet, Pill } from "@/components/tide/work/kit";
import { SecondaryLink } from "@/components/tide/work/space";
import { fill, PHWS2 } from "@/content/pharmacy-workspace-v2";
import { PHWS2_CLINICAL as C } from "@/content/pharmacy-workspace-v2-clinical";
import { db } from "@/db";
import { asClinicalReader } from "@/lib/emr/db";
import { interventionReport } from "@/lib/pharmacy/clinical/interventions";
import { queryFacts } from "@/lib/pharmacy/clinical/interventions-read";
import { listReports } from "@/lib/pharmacy/clinical/reaction-read";
import { listReconciliations } from "@/lib/pharmacy/clinical/reconciliation-read";
import { groupOf, reviewDue } from "@/lib/pharmacy/clinical/stewardship";
import { stewardshipData } from "@/lib/pharmacy/clinical/stewardship-read";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { LimitsLine } from "../_components/v2/limits-line";
import { hasTab, pharmacyV2 } from "../_lib/v2";

export const metadata: Metadata = { title: "Clinical · Pharmacy" };
export const dynamic = "force-dynamic";

const T = PHWS2.tabs.clinical;
const time = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: DEFAULT_TIME_ZONE,
});

/** The first instant of this month in the hospital's day (Africa/Kampala keeps UTC+3 all year). */
function monthStart(now: Date) {
  const ym = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: DEFAULT_TIME_ZONE,
  }).format(now);
  return new Date(`${ym}-01T00:00:00+03:00`);
}

/**
 * The Clinical hub (board Clinical, GATE A §3): one card per clinical tab the viewer has, each with its real count
 * from the page's own read, linking to the existing page. Nothing here writes.
 */
export default async function ClinicalHubPage() {
  const v2 = await pharmacyV2();
  if (!v2.live) notFound();
  const has = (k: string) => hasTab(v2, "clinical", k);
  if (!["reconciliation", "reactions", "stewardship", "interventions"].some(has)) notFound();
  const { scope } = v2;
  const h = scope.hospitalId;
  const now = new Date();
  const database = db as unknown as EmrDb;
  const [recs, reports, steward, facts] = await Promise.all([
    // On the app connection, as each page reads it (see the Reconciliation and Stewardship pages).
    has("reconciliation") ? listReconciliations(database, h, now) : null,
    has("reactions") ? asClinicalReader(scope, (tx) => listReports(tx, h, now)) : null,
    has("stewardship")
      ? stewardshipData(database, h, new Date(now.getTime() - 30 * 86_400_000))
      : null,
    has("interventions")
      ? asClinicalReader(scope, (tx) => queryFacts(tx, h, monthStart(now), now))
      : null,
  ]);

  const cards: ReactNode[] = [];
  if (recs) {
    const open = recs.filter((r) => r.state === "open").length;
    const reopened = recs.filter((r) => r.state === "reopened").length;
    cards.push(
      <Card
        key="reconciliation"
        title={T.reconciliation}
        count={fill(C.cards.reconciliation.count, { n: open + reopened })}
        lead={C.cards.reconciliation.lead}
        facts={[
          fill(C.cards.reconciliation.open, { n: open }),
          fill(C.cards.reconciliation.reopened, { n: reopened }),
        ]}
        href="/pharmacy/clinical/reconciliation"
        action={C.cards.reconciliation.action}
      />,
    );
  }
  if (reports) {
    const toSubmit = reports.filter((r) => r.state === "to_submit");
    const late = toSubmit.filter((r) => r.pastDue).length;
    cards.push(
      <Card
        key="reactions"
        title={T.reactions}
        count={fill(C.cards.reactions.count, { n: toSubmit.length })}
        lead={C.cards.reactions.lead}
        facts={[]}
        warn={late ? fill(C.cards.reactions.pastDue, { n: late }) : undefined}
        href="/pharmacy/clinical/reactions"
        action={C.cards.reactions.action}
      />,
    );
  }
  if (steward) {
    const S = C.cards.stewardship;
    const running = steward.courses.filter((c) => !c.endedAt);
    const due = running.filter(
      (c) =>
        reviewDue(
          c,
          groupOf(steward.tags, c.medicineId, c.route) ?? "unknown",
          steward.settings,
          steward.reviews,
          now,
          DEFAULT_TIME_ZONE,
        ).due,
    ).length;
    // Law 6: with the pack or the review days unsigned nothing can be due, so the count is "Not set", never 0.
    const unset = !steward.signed ? S.notSigned : !steward.settings ? S.noSettings : null;
    cards.push(
      <Card
        key="stewardship"
        title={T.stewardship}
        count={unset ? null : fill(S.count, { n: due })}
        lead={S.lead}
        facts={unset ? [] : [fill(S.running, { n: running.length })]}
        notSet={
          unset ? (
            <NotSet
              label={unset}
              href="/pharmacy/setup?view=content"
              canSet={v2.permissions.has("pharmacy.manage") && hasTab(v2, "setup", "content")}
            />
          ) : undefined
        }
        href="/pharmacy/clinical/stewardship"
        action={S.action}
      />,
    );
  }
  if (facts) {
    const I = C.cards.interventions;
    const t = interventionReport(facts, monthStart(now), now).total;
    cards.push(
      <Card
        key="interventions"
        title={T.interventions}
        count={fill(I.count, { n: t.sent })}
        lead={I.lead}
        facts={[fill(I.acted, { n: t.changed + t.stopped }), fill(I.open, { n: t.open })]}
        href="/pharmacy/clinical/interventions"
        action={I.action}
      />,
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6">
      <p className="text-body-m text-ink-700 max-w-[70ch]">{C.intro}</p>
      <LimitsLine hospitalId={h} text={C.limits} linkLabel={C.limitsLink} href={v2.tabs.some((t) => t.key === "packs") ? "/pharmacy/setup" : undefined} />
      <p className="text-caption text-muted-foreground">
        {fill(C.asOf, { time: time.format(now) })} ·{" "}
        <Link href="/pharmacy/clinical" className="text-primary underline-offset-2 hover:underline">
          {C.refresh}
        </Link>
      </p>
      <div className="grid gap-4 md:grid-cols-2">{cards}</div>
    </div>
  );
}

function Card({
  title,
  count,
  lead,
  facts,
  warn,
  notSet,
  href,
  action,
}: {
  title: string;
  /** null: not set (the card says why in `notSet`). */
  count: string | null;
  lead: string;
  facts: readonly string[];
  warn?: string;
  notSet?: ReactNode;
  href: string;
  action: string;
}) {
  return (
    <section className="bg-card shadow-tide-card rounded-tide-card flex min-w-0 flex-col gap-3 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-heading-s text-foreground">{title}</h2>
        {count ? <Pill>{count}</Pill> : null}
      </header>
      <p className="text-body-s text-muted-foreground">{lead}</p>
      {notSet ?? null}
      {facts.length || warn ? (
        <ul className="text-body-s text-foreground flex flex-col gap-1">
          {warn ? (
            <li>
              <Pill tone="caution">{warn}</Pill>
            </li>
          ) : null}
          {facts.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-auto">
        <SecondaryLink href={href}>{action}</SecondaryLink>
      </div>
    </section>
  );
}
