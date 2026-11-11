import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { GoLiveTab } from "@/components/pharmacy/setup/going-live";
import { goLiveFixture } from "@/components/pharmacy/setup/going-live/fixture";
import { MessagesTab } from "@/components/pharmacy/setup/messages";
import { messagesFixture } from "@/components/pharmacy/setup/messages/fixture";
import { PlacesTab } from "@/components/pharmacy/setup/places";
import { placesFixture } from "@/components/pharmacy/setup/places/fixture";
import { RulesTab } from "@/components/pharmacy/setup/rules";
import { rulesFixture } from "@/components/pharmacy/setup/rules/fixture";

/**
 * Development fixture: Set-up › Going live, Places, Rules and Messages on synthetic data (no database, no real people),
 * for the 1440 and 390 px pass and axe. 404 outside development. Actions fail here (no database); the page only renders.
 * `?tab=` picks the tab; `?empty=1` shows the before-0274 state.
 */
export const metadata: Metadata = { title: "Set-up fixture", robots: { index: false } };

const TABS = ["going-live", "places", "rules", "messages"] as const;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; empty?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const tab = TABS.find((t) => t === sp.tab) ?? "going-live";
  const empty = sp.empty === "1";
  const places = placesFixture();
  return (
    <main
      data-ds="tide"
      className="bg-background mx-auto flex w-full max-w-[1400px] flex-col gap-4 p-4"
    >
      <nav className="text-body-s flex flex-wrap gap-3">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`?tab=${t}`}
            className="text-primary font-semibold underline-offset-4 hover:underline"
          >
            {t}
          </Link>
        ))}
      </nav>
      {tab === "going-live" ? <GoLiveTab view={empty ? null : goLiveFixture()} /> : null}
      {tab === "places" ? (
        <PlacesTab view={empty ? null : places.view} rules={places.rules} />
      ) : null}
      {tab === "rules" ? <RulesTab view={empty ? null : rulesFixture()} /> : null}
      {tab === "messages" ? <MessagesTab view={empty ? null : messagesFixture()} /> : null}
    </main>
  );
}
