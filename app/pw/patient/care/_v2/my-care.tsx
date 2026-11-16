"use client";

import type { ThreadMessage } from "@/components/tide/v2-care-web";
import type { CheckLine, TeamCard } from "@patient-core/my-care";

import { MyCareWeb } from "@/components/tide/v2-care-web";
import { sendCareMessageAction } from "@/lib/patient-web/care-v2-actions";

export function MyCareClient(p: {
  team: TeamCard[];
  checks: CheckLine[];
  messages: ThreadMessage[];
}) {
  return <MyCareWeb {...p} send={(key, body) => sendCareMessageAction(key, body)} />;
}
