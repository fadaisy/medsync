import { Redirect } from "expo-router";
import { CARE_V2_COPY } from "@content/patient-app/care";

import { Screen } from "@/components/tide";
import { MyCareBody } from "@/features/v2/my-care-routes";
import { flag } from "@/lib/flags";

/** My care, v2 (Step 8): the team, checks this year and messages. Only in Care mode, v2. */
export default function MyCare() {
  if (!flag("careMode")) return <Redirect href="/care" />;
  return (
    <Screen title={CARE_V2_COPY.myCare.title} back={{}}>
      <MyCareBody />
    </Screen>
  );
}
