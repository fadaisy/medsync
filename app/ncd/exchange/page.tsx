import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";

import { buttonVariants } from "@/components/ui/button";
import { ncdExportRequest } from "@/db/schema/ncd-registry";
import { can } from "@/lib/ncdreg/context";
import { withNcd } from "@/lib/ncdreg/db";
import { demoOn } from "@/lib/ncdreg/exchange";
import { requireNcdScope } from "@/lib/ncdreg/scope";
import { Page, PageTitle } from "../_components/kit";
import { LegacyImport, ReleasePanel } from "./_components/exchange-panels";

export const dynamic = "force-dynamic";

const lastMonth = (today: string) => {
  const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
};

/** Exchange (§11.3 item 11, H1–H5): aggregates, FHIR, research releases, full export, legacy import. */
export default async function ExchangePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { ctx } = await requireNcdScope();
  if (!can(ctx, "export_request", "export_approve", "aggregate_export", "legacy_entry")) notFound();
  const month = (await searchParams).month ?? lastMonth(ctx.today);
  const [demo, requests] = await Promise.all([
    demoOn(ctx),
    can(ctx, "export_request", "export_approve", "aggregate_export")
      ? withNcd(
          ctx,
          "app",
          (tx) =>
            tx
              .select()
              .from(ncdExportRequest)
              .where(eq(ncdExportRequest.facilityId, ctx.facilityId))
              .orderBy(desc(ncdExportRequest.requestedAt)),
          ctx.db,
        )
      : Promise.resolve([]),
  ]);
  const dl = (kind: string, extra = "") => `/ncd/exchange/download?kind=${kind}${extra}`;
  return (
    <Page className="gap-8">
      <PageTitle
        place="exchange"
        title="Exchange"
        subline={
          demo
            ? "Demo data is on: files are marked synthetic; DHIS2, FHIR and research exports do not run."
            : "Every export is logged."
        }
      />
      {can(ctx, "aggregate_export") ? (
        <section aria-labelledby="agg-h" className="flex flex-col gap-3">
          <h2 id="agg-h" className="text-heading-s">
            Monthly aggregates (H1)
          </h2>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-label">Month</span>
              <input
                type="month"
                name="month"
                defaultValue={month}
                className="border-input h-9 rounded-lg border bg-transparent px-2 font-mono text-[13px]"
              />
            </label>
            <button type="submit" className={buttonVariants({ variant: "ghost" })}>
              Set
            </button>
            <a
              className={buttonVariants({ variant: "secondary" })}
              href={dl("aggregate_csv", `&month=${month}`)}
            >
              CSV
            </a>
            <a
              className={buttonVariants({ variant: "secondary" })}
              href={dl("dhis2", `&month=${month}`)}
            >
              DHIS2 data value set
            </a>
          </form>
          <p className="text-caption text-ink-600">
            The DHIS2 file needs data element identifiers from the Ministry of Health; the mapping
            ships empty and the export refuses until it is filled.
          </p>
        </section>
      ) : null}
      {can(ctx, "export_approve") ? (
        <section aria-labelledby="fhir-h" className="flex flex-col gap-3">
          <h2 id="fhir-h" className="text-heading-s">
            Patient-level exports (H2, H4)
          </h2>
          <div className="flex flex-wrap gap-2">
            <a className={buttonVariants({ variant: "secondary" })} href={dl("fhir")}>
              FHIR R4 bundle
            </a>
            <a className={buttonVariants({ variant: "secondary" })} href={dl("full")}>
              Full export with the data dictionary
            </a>
          </div>
          <p className="text-caption text-ink-600">
            The FHIR export refuses while the clinical codes are unverified (sign-off register S10).
          </p>
        </section>
      ) : null}
      {can(ctx, "export_request", "export_approve") ? (
        <section aria-labelledby="rel-h" className="flex flex-col gap-3">
          <h2 id="rel-h" className="text-heading-s">
            Research releases (H3)
          </h2>
          <p className="text-caption text-ink-600">
            De-identified: a per-release pseudonym, birth year only, district only, no names,
            phones, identifiers, free text or village; small counts suppressed. Each release needs a
            request and a different approver.
          </p>
          <ReleasePanel
            requests={requests
              .filter((r) => r.kind === "research_extract")
              .map((r) => ({
                id: r.id,
                status: r.status,
                requestedBy: r.requestedBy,
                reference: r.approvalReference,
                at: r.requestedAt.toISOString(),
              }))}
            me={ctx.userId}
            canRequest={can(ctx, "export_request")}
            canApprove={can(ctx, "export_approve")}
          />
        </section>
      ) : null}
      {can(ctx, "legacy_entry") ? (
        <section aria-labelledby="leg-h" className="flex flex-col gap-3">
          <h2 id="leg-h" className="text-heading-s">
            Legacy import (H5)
          </h2>
          <p className="text-caption text-ink-600">
            One row per historical visit. The dry run reports every error and likely duplicate
            before anything is written; imported visits are flagged as back-entry.
          </p>
          <LegacyImport />
        </section>
      ) : null}
    </Page>
  );
}
