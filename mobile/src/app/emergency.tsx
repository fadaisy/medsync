import { useLocalSearchParams, useRouter } from "expo-router";

import { EmergencySheet } from "@/components/emergency/emergency-sheet";
import { PreAlertForm } from "@/components/emergency/pre-alert-form";
import { StatusPanel } from "@/components/emergency/status-panel";
import { useEmergencySheet } from "@/lib/emergency";
import { useSession } from "@/lib/session";

/**
 * The PRE-AUTH Emergency sheet (ADR 0098 ruling 7): reachable from the
 * welcome and sign-in screens' red disc, with no hospital — verified
 * national contacts only, never a draft. The pre-alert and its status live
 * on this same route behind `view=` (a bystander must be able to act, PRD
 * §8.7, and the `(app)` routes are gated on a session), so a signed-out
 * reporter never leaves this screen.
 */
export default function PreAuthEmergencyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    view?: "tell" | "status";
    picks?: string;
    id?: string;
    token?: string;
    sentAt?: string;
    smsBody?: string;
  }>();
  const { status } = useSession();
  const { sheet } = useEmergencySheet(null);

  if (params.view === "status" && params.id) {
    return (
      <StatusPanel
        id={params.id}
        token={params.token}
        sentAt={params.sentAt ?? new Date().toISOString()}
        smsBody={params.smsBody || null}
        onBack={() => router.navigate("/emergency")}
      />
    );
  }

  if (params.view === "tell") {
    return (
      <PreAlertForm
        sheet={sheet}
        hospitalId={null}
        initialPicks={params.picks ? params.picks.split(",").filter(Boolean) : []}
        signedIn={status === "signedIn"}
        onBack={router.back}
        onSent={(r) =>
          router.replace({
            pathname: "/emergency",
            params: {
              view: "status",
              id: r.pre_arrival_id,
              token: r.token,
              sentAt: new Date().toISOString(),
              smsBody: r.sms_fallback_body ?? "",
            },
          })
        }
      />
    );
  }

  return (
    <EmergencySheet
      hospitalId={null}
      showDrafts={false}
      onBack={router.back}
      onTell={(picks) =>
        router.push({ pathname: "/emergency", params: { view: "tell", picks: picks.join(",") } })
      }
      onOpenStatus={(p) =>
        router.push({
          pathname: "/emergency",
          params: {
            view: "status",
            id: p.id,
            token: p.token,
            sentAt: p.sentAt,
            smsBody: p.smsBody ?? "",
          },
        })
      }
    />
  );
}
