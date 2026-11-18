import { Redirect } from "expo-router";
import { CARE_V2_COPY } from "@content/patient-app/care";

import { Screen } from "@/components/tide";
import { CarePlanBody } from "@/features/v2/care-routes";
import { flag } from "@/lib/flags";

/** The v2 Plan page (Step 7). Only in Care mode, v2: otherwise back to Care. */
export default function CarePlan() {
  if (!flag("careMode")) return <Redirect href="/care" />;
  return (
    <Screen title={CARE_V2_COPY.plan.title} back={{}}>
      <CarePlanBody />
    </Screen>
  );
}
