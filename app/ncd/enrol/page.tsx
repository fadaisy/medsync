import { notFound } from "next/navigation";

import { facilityStatus } from "@/lib/ncdreg/admin";
import { can } from "@/lib/ncdreg/context";
import { CODE_LISTS_FOR_ENROL } from "@/lib/ncdreg/read/enrol-options";
import { requireNcdScope } from "@/lib/ncdreg/scope";
import { Page, PageTitle } from "../_components/kit";
import { EnrolForm } from "./_components/enrol-form";

export const dynamic = "force-dynamic";

/** Search and enrol (§11.3 item 2, A1–A5): one screen, no wizard; possible existing records beside the form. */
export default async function EnrolPage({
  searchParams,
}: {
  searchParams: Promise<{ walkin?: string }>;
}) {
  const { ctx } = await requireNcdScope();
  if (!can(ctx, "enrol", "legacy_entry")) notFound();
  const sp = await searchParams;
  const status = await facilityStatus(ctx);
  const modules = ctx.catalogue.filter((m) => status.enabled.includes(m.code));
  return (
    <Page>
      <PageTitle
        title="Search and enrol"
        subline="Search first: a new record is created only after the search has run and every likely match is settled."
      />
      <EnrolForm
        modules={modules}
        synthetic={!status.approved}
        options={CODE_LISTS_FOR_ENROL}
        walkIn={sp.walkin === "1"}
        today={ctx.today}
      />
    </Page>
  );
}
