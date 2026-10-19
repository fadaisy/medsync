import type { ComponentProps } from "react";
import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";

import { PageHeader } from "@/components/medsync/page-header";
import { LABWS2_SETUP } from "@/content/lab-workspace-v2-setup";
import { ViewHeader } from "../../_components/v2/view-header";
import { labV2 } from "../../_lib/places";

/**
 * A set-up page's header. With Lab Workspace v2 live the top bar holds the h1 (the place), so the page's own
 * title is an h2 under a "Set-up" link back to the hub; otherwise the old page header, unchanged.
 */
export async function SetupHeader(props: ComponentProps<typeof PageHeader>) {
  const v2 = await labV2();
  if (!v2.live) return <PageHeader {...props} />;
  // The hub is the lead's; a read-only page opened by someone else has no way back to it.
  const lead = v2.scope.access.permissions.has("lab.manage");
  return (
    <div className="flex flex-col gap-1">
      {lead ? (
        <Link
          href="/lab/setup"
          className="text-body-s text-primary focus-visible:shadow-focus inline-flex w-fit items-center gap-1 rounded-sm font-medium underline-offset-4 outline-none hover:underline"
        >
          <ChevronLeftIcon aria-hidden className="size-4" />
          {LABWS2_SETUP.back}
        </Link>
      ) : null}
      <ViewHeader title={props.title} subline={props.subline} right={props.right} />
    </div>
  );
}
