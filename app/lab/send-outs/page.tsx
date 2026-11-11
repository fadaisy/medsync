import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PillTabs, PrimaryLink, SpaceHeader } from "@/components/tide/work/space";
import { LABWS2_SEND_OUTS as S } from "@/content/lab-workspace-v2-send-outs";
import { countMatchesWaiting } from "@/lib/lab/match-read";
import { one, pillTabs } from "../_lib/place-tabs";
import { labV2 } from "../_lib/places";
import { ReferralsBoard } from "./_views/board";
import { ConnectionsView } from "./_views/connections";
import { ManifestsView } from "./_views/manifests";
import { MatchesView } from "./_views/matches";
import { PartnersView } from "./_views/partners";

export const metadata: Metadata = { title: "Send-outs · Laboratory" };
export const dynamic = "force-dynamic";

/**
 * Send-outs (prompt 5.6; gate-a §3): Board · Manifests · Waiting for a match · Partners · Connections, one URL
 * each (`?tab=`), with New manifest as the place's primary action. Every tab renders the view its old route
 * rendered (/lab/refer, /lab/referrals, /lab/exchange/*), so nothing the old pages offered is lost (Law 2).
 */
export default async function SendOutsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const v2 = await labV2();
  if (!v2.live) notFound();
  const defs = v2.tabs.send_outs;
  if (!defs.length) notFound();
  const sp = await searchParams;
  const tab = defs.find((d) => d.key === one(sp.tab))?.key ?? defs[0]!.key;
  const h = v2.scope.hospitalId;
  const waiting = defs.some((d) => d.key === "match") ? await countMatchesWaiting(h) : null;
  const tabs = pillTabs(defs, "send_outs", waiting === null ? {} : { match: { count: waiting } });
  const toRefer = !!v2.flags.oneMenu && v2.visible.has("to_refer");
  const canSend = toRefer && !!v2.flags.referral;
  const base = `/lab/send-outs?tab=${tab}`;

  return (
    <div className="flex flex-col gap-4">
      <SpaceHeader
        tabs={<PillTabs tabs={tabs} current={tab} label={S.tabsLabel} />}
        action={
          canSend ? (
            <PrimaryLink href="/lab/send-outs?tab=board&send=1">{S.newManifest}</PrimaryLink>
          ) : null
        }
      />
      {tab === "board" ? (
        <ReferralsBoard
          scope={v2.scope}
          q={{
            month: one(sp.month),
            partner: one(sp.partner),
            view: one(sp.view),
            r: one(sp.r),
            send: one(sp.send),
            show: one(sp.show),
          }}
          v2
          base={base}
          toRefer={toRefer}
          exchange={!!v2.flags.exchange}
          referral={!!v2.flags.referral}
        />
      ) : tab === "manifests" ? (
        <ManifestsView scope={v2.scope} m={one(sp.m)} />
      ) : tab === "match" ? (
        <MatchesView scope={v2.scope} i={one(sp.i)} base={base} />
      ) : tab === "partners" ? (
        <PartnersView scope={v2.scope} p={one(sp.p)} base={base} />
      ) : (
        <ConnectionsView scope={v2.scope} view={one(sp.view)} base={base} v2 />
      )}
    </div>
  );
}
