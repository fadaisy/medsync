import { MEMBERSHIP_COPY } from "@content/patient-app/membership";
import { useRouter } from "expo-router";

import { Screen } from "@/components/tide";
import { MePlansRoute } from "@/features/v2/me-membership";

/**
 * The plans, on their own page (patient app v2 §5.9, M11; moved off Me in the redraw of 18 Nov 2026, from the
 * owner's approved prototype). Me shows the one card and a line that opens this page, so the plans no longer
 * stand between the patient and their own settings. The plans, the free month and paying are the same section
 * as before (`MeMembershipV2`, part `plans`); what is always free is said beside them (MR9).
 */
export default function PlansScreen() {
  const router = useRouter();
  return (
    <Screen
      // Opened from a link with nothing behind it, Back still leads to Me.
      back={{
        label: "Me",
        onPress: () => (router.canGoBack() ? router.back() : router.replace("/me")),
      }}
      title={MEMBERSHIP_COPY.plans.current}
      helpSource="plans"
    >
      <MePlansRoute />
    </Screen>
  );
}
