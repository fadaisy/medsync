import { Redirect } from "expo-router";
import { CARE_V2_COPY } from "@content/patient-app/care";

import { Screen } from "@/components/tide";
import { MessagesBody } from "@/features/v2/my-care-routes";
import { flag } from "@/lib/flags";

/** Messages with the care team, v2 (Step 8). Not for emergencies: Help is in the header and on the page. */
export default function CareMessages() {
  if (!flag("appV2Mobile") || !flag("careMode")) return <Redirect href="/care" />;
  return (
    <Screen title={CARE_V2_COPY.messages.title} back={{}}>
      <MessagesBody />
    </Screen>
  );
}
