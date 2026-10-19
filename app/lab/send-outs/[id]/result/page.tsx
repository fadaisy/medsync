import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LABWS2_SEND_OUTS } from "@/content/lab-workspace-v2-send-outs";
import { ResultBack } from "../../_views/result";
import { ViewHeader } from "../../../_components/v2/view-header";
import { labV2 } from "../../../_lib/places";

export const metadata: Metadata = { title: "Result back on paper · Send-outs · Laboratory" };
export const dynamic = "force-dynamic";

/** Result back on paper under Send-outs (prompt 5.6; gate-a §3): opened from a referral on the board. */
export default async function SendOutsResultPage({ params }: { params: Promise<{ id: string }> }) {
  const v2 = await labV2();
  if (!v2.live || !v2.flags.referral) notFound();
  const { id } = await params;
  const board = "/lab/send-outs?tab=board";
  return (
    <div className="flex flex-col gap-5">
      <ResultBack
        scope={v2.scope}
        id={id}
        doneHref={board}
        header={(number) => (
          <ViewHeader
            title={LABWS2_SEND_OUTS.resultTitle}
            subline={number}
            right={
              <Link
                href={`${board}&r=${id}`}
                className="text-body-s text-primary underline-offset-4 hover:underline"
              >
                {LABWS2_SEND_OUTS.backToReferral}
              </Link>
            }
          />
        )}
      />
    </div>
  );
}
