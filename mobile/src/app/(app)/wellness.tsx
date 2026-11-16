import { Redirect } from "expo-router";
import { CARE_V2_COPY } from "@content/patient-app/care";

import { Screen } from "@/components/tide";
import { WellnessBody } from "@/features/v2/my-care-routes";
import { flag } from "@/lib/flags";

/** Wellness, v2 (gate A4): the patient's own logging (move, mood, eat), shared by both modes. */
export default function Wellness() {
  if (!flag("appV2Mobile")) return <Redirect href="/care" />;
  return (
    <Screen title={CARE_V2_COPY.wellness.title} back={{}}>
      <WellnessBody />
    </Screen>
  );
}
