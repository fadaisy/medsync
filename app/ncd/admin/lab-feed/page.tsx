import Link from "next/link";
import { notFound } from "next/navigation";
import { ClockIcon } from "lucide-react";

import { ncdLabFeedLiveFor } from "@/lib/lab/feature";
import { PAYLOADS } from "@/lib/lab/signed-config";
import { canonicalUnitOf, FEED_FIELDS, fieldMappingVersions } from "@/lib/ncd/lab-feed-read";
import { requireNcdScope } from "@/lib/ncdreg/scope";
import { fmtDateTime, Num, Page, PageTitle } from "../../_components/kit";
import { MappingForm } from "./_components/mapping-form";

export const dynamic = "force-dynamic";

const METHOD_WORDS = { lab: "Lab", bedside: "Bedside" } as const;

/**
 * The NCD lab feed's set-up (Lab Phase 2 §5.9, NF-1): each registry field mapped to a concept, a unit,
 * the accepted methods and a look-back window, drafted and signed by the registry lead, then countersigned
 * by the CSO in the super-admin console. Registry lead only, and only with ncdLabFeed on.
 */
export default async function LabFeedSetupPage() {
  const { ctx } = await requireNcdScope();
  if (!ctx.roles.includes("registry_lead") || !ncdLabFeedLiveFor(ctx.facilityId)) notFound();
  const rows = await fieldMappingVersions(ctx.facilityId);
  const read = (payload: unknown) => {
    const p = PAYLOADS.ncd_mapping.safeParse(payload);
    return p.success ? p.data : null;
  };
  const summary = (payload: unknown) => {
    const p = read(payload);
    if (!p) return <span>Does not read as a mapping</span>;
    return (
      <span>
        <Num>{p.concept}</Num> in <Num>{p.unit}</Num> ·{" "}
        {p.methods.map((m) => METHOD_WORDS[m]).join(" or ")} · last <Num>{p.windowDays}</Num> day
        {p.windowDays === 1 ? "" : "s"}
      </span>
    );
  };
  const when = (d: Date | null) => (d ? fmtDateTime(d, ctx.timeZone) : "");

  return (
    <Page className="gap-6">
      <PageTitle
        place="admin"
        title="Lab feed"
        subline="Which released lab result fills each registry field. Every mapping is signed by you and the CSO; nothing is assumed."
        right={
          <Link href="/ncd/admin" className="text-body-s text-ink-700 hover:underline">
            Back to administration
          </Link>
        }
      />
      {(Object.keys(FEED_FIELDS) as (keyof typeof FEED_FIELDS)[]).map((f) => {
        const mine = rows.filter((r) => r.key === f);
        const signed = mine.find((r) => r.status === "signed" && !r.supersededAt);
        const waiting = mine.find((r) => r.status === "draft" && r.leadSignedBy);
        const open = mine.find((r) => r.status === "draft" && !r.leadSignedBy);
        const draft = open ? read(open.payload) : null;
        const suggested = FEED_FIELDS[f].suggestedConcept;
        return (
          <section
            key={f}
            aria-labelledby={`lf-${f}`}
            className="border-border flex flex-col gap-3 rounded-xl border p-4"
          >
            <h2 id={`lf-${f}`} className="text-heading-s">
              {FEED_FIELDS[f].label}
            </h2>
            <dl className="text-body-s grid gap-x-4 gap-y-1 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <dt className="text-ink-600">In force</dt>
              <dd>
                {signed ? (
                  <>
                    {summary(signed.payload)}{" "}
                    <span className="text-ink-600">
                      · signed {when(signed.csoSignedAt ?? signed.inForceFrom)}
                    </span>
                  </>
                ) : (
                  <span className="text-ink-700">
                    Not mapped: this field is not filled from the lab.
                  </span>
                )}
              </dd>
              {waiting ? (
                <>
                  <dt className="text-ink-600">Signed by the lead</dt>
                  <dd className="flex flex-wrap items-center gap-2">
                    {summary(waiting.payload)}
                    <span className="text-ink-800 inline-flex items-center gap-1">
                      <ClockIcon className="text-ink-500 size-3.5" aria-hidden />
                      Waiting for the CSO
                    </span>
                    <span className="text-ink-600">· {when(waiting.leadSignedAt)}</span>
                  </dd>
                </>
              ) : null}
              {open ? (
                <>
                  <dt className="text-ink-600">Open draft</dt>
                  <dd>
                    {summary(open.payload)}{" "}
                    <span className="text-ink-600">· version {open.version}, not signed</span>
                  </dd>
                </>
              ) : null}
            </dl>
            <MappingForm
              field={f}
              initial={
                draft
                  ? {
                      concept: draft.concept,
                      unit: draft.unit,
                      methods: draft.methods,
                      windowDays: String(draft.windowDays),
                    }
                  : {
                      concept: suggested,
                      unit: canonicalUnitOf(suggested),
                      methods: [],
                      windowDays: "",
                    }
              }
              openDraft={
                open ? { id: open.id, authoredByMe: open.authoredBy === ctx.userId } : null
              }
            />
          </section>
        );
      })}
    </Page>
  );
}
