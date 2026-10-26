import type { Metadata } from "next";
import { headers } from "next/headers";

import { loadEmergencyContext } from "@/app/emergency/_lib/sheet";
import { loadActiveShare, loadMedicCard } from "@/lib/patient-web/help-data";
import { canDial } from "@/lib/patient-web/help-device";
import { HelpView } from "./_components/help-view";

export const metadata: Metadata = { title: "Help" };
export const dynamic = "force-dynamic";

/**
 * Help · SOS (the phone's app/help.tsx; ADR 0098). The data is the old Emergency page's own loader
 * (`loadEmergencyContext`: the session without a redirect, and `pt-emergency-sheet`'s answer for the nearest
 * hospital); signed in as a patient, the medic card and any live share are their own rows. Whether this
 * device can dial is read from the user agent here, and again in the browser when there was none (D-PW-03).
 */
export default async function HelpPage() {
  const [ctx, h] = await Promise.all([loadEmergencyContext(), headers()]);
  const ua = h.get("user-agent");
  const [medic, share] = ctx.userId
    ? await Promise.all([
        loadMedicCard(ctx.userId).catch(() => null),
        loadActiveShare().catch(() => null),
      ])
    : [null, null];
  return (
    <HelpView
      serverDial={ua ? canDial(ua) : null}
      medic={medic}
      facilities={ctx.sheet.facilities}
      share={medic && share !== "off" ? share : null}
    />
  );
}
