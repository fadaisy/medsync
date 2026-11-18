/**
 * Me, v2 on the phone (patient app v2 §5.9, M10, M11; Step 10): the membership card with a
 * QR of a short-lived token (S24, refreshed before it ends), the plans from approved prices, the 30-day trial
 * with its reveal (no card, nothing charged when it ends, S25), and paying a plan through the engine. What is
 * always free is said beside the plans (MR9, S26). No new dependency: the server sends the QR as a grid.
 */
import type { MedicalId } from "@/components/tide/v2";
import type { MembershipRow, Plan, PlusTier, PriceRow, Tier } from "@patient-core/membership";
import type { Network, PromptView } from "@patient-core/payments";
import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { HOME_V2_COPY } from "@content/patient-app/home";
import { MEMBERSHIP_COPY } from "@content/patient-app/membership";
import { feeText } from "@patient-core/fees";
import { memberNumber, plansFrom, tierNow } from "@patient-core/membership";
import { maskMsisdn, NETWORK_NAME } from "@patient-core/payments";
import { shortDayOf } from "@patient-core/visits-calendar";

import { Button, Chip, Icon, Press } from "@/components/tide";
import { MembershipCard, PromptStatus, TierCard } from "@/components/tide/v2";
import { loadMembership, medicalIdToken, payPlus, startTrial } from "@/data/membership-v2";
import { myMobile } from "@/data/visit-v2";
import { requestId } from "@/lib/edge";
import { flag } from "@/lib/flags";
import { useTide } from "@/theme/theme";
import { tRadius, tSpace, tType } from "@/theme/tide";

const M = MEMBERSHIP_COPY;
const TIER_WORDS: Record<PlusTier, string> = {
  plus_family: M.tiers.plusFamily,
  plus_care: M.tiers.plusCare,
  family_care: M.tiers.familyCare,
};

/**
 * Which part of the section a screen shows (redraw of 18 Nov 2026). Me shows `card`: the one card and a line
 * that opens the plans. The plans page shows `plans`: the plans, the trial and paying, with no card. `all` is
 * the whole section on one page, as the dev gallery and the tests draw it.
 */
export type MembershipPart = "all" | "card" | "plans";

export function QrGrid({ modules, size = 104 }: { modules: string[]; size?: number }) {
  const t = useTide();
  const n = modules.length;
  if (!n) return null;
  return (
    <Svg viewBox={`-2 -2 ${n + 4} ${n + 4}`} width={size} height={size} accessibilityLabel={M.card.back.qrNote} style={{ backgroundColor: "white" }}>
      {modules.flatMap((row, r) =>
        [...row].map((c, x) => (c === "1" ? <Rect key={`${r}-${x}`} x={x} y={r} width={1} height={1} fill={t.ticket.navy} /> : null)),
      )}
    </Svg>
  );
}

export function MeMembershipV2(p: {
  tier: Tier;
  trial: boolean;
  endsLabel: string | null;
  trialUsed: boolean;
  name: string;
  memberNo: string;
  id: Omit<MedicalId, "qr">;
  part?: MembershipPart;
  /** `card` only: opens the plans page. */
  onSeePlans?: () => void;
  /**
   * `card` only: Me's one card, drawn by the screen from what the phone holds, given the plan and the code
   * this section loads. Without it the section draws the kit's own membership card.
   */
  renderCard?: (x: { tier: Tier | null; qr: React.ReactNode | null }) => React.ReactNode;
  plans: Plan[];
  msisdn: string | null;
  /** Said when a plan is chosen and there is no way to pay from the app (`mobilePayments` off, or no number). */
  payOff?: string;
  qrToken: () => Promise<{ ok: true; modules: string[]; expiresAt: string } | { ok: false }>;
  startTrial: (tier: PlusTier) => Promise<{ ok: true } | { ok: false; error: string }>;
  pay: (i: { tier: PlusTier; period: "monthly" | "yearly"; network: Network; msisdn: string; idempotencyKey: string }) => Promise<
    { ok: true; view: PromptView } | { ok: false; error: string }
  >;
}) {
  const t = useTide();
  const [qr, setQr] = useState<string[]>([]);
  const [revealed, setRevealed] = useState<PlusTier | null>(null);
  const [paying, setPaying] = useState<PlusTier | null>(null);
  const [network, setNetwork] = useState<Network>("mtn");
  const [view, setView] = useState<PromptView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(() => requestId());
  const qrToken = p.qrToken;
  const trialOpen = !p.trialUsed && p.tier === "basic";
  const part = p.part ?? "all";

  useEffect(() => {
    // The plans page draws no card, so it asks for no Medical ID token.
    if (part === "plans") return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      const r = await qrToken();
      if (!live || !r.ok) return;
      setQr(r.modules);
      // Refresh 30 s before it ends; never sooner than 30 s, never later than the 5-minute life (a far date would overflow).
      timer = setTimeout(load, Math.min(270_000, Math.max(30_000, new Date(r.expiresAt).getTime() - Date.now() - 30_000)));
    };
    void load();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [qrToken, part]);

  if (revealed)
    return (
      <View accessibilityLiveRegion="polite" style={{ alignItems: "center", gap: tSpace[3], paddingVertical: tSpace[6] }}>
        <Text accessibilityRole="header" style={[tType.title, { color: t.ink, textAlign: "center" }]}>
          {M.reveal.title.replace("{tier}", TIER_WORDS[revealed])}
        </Text>
        <Text style={[tType.body, { color: t.ink2, textAlign: "center" }]}>{M.reveal.note.replace("{date}", p.endsLabel ?? "")}</Text>
        <Text style={[tType.bodyS, { color: t.ink3 }]}>{M.plans.neverAhead}</Text>
        <Button label={M.reveal.done} onPress={() => setRevealed(null)} />
      </View>
    );

  const plan = p.plans.find((x) => x.tier === paying);
  const tierName = p.tier === "basic" ? M.tiers.basic : TIER_WORDS[p.tier];
  const ends =
    p.endsLabel && p.tier !== "basic"
      ? (p.trial ? M.plans.trialEnds : M.plans.paidUntil).replace("{date}", p.endsLabel)
      : null;
  const card = (
    <MembershipCard tier={p.tier} name={p.name} memberNo={p.memberNo} id={{ ...p.id, qr: <QrGrid modules={qr} /> }} />
  );

  if (part === "card") {
    // One line under the card: the plan held, and the way to the plans.
    const line = [tierName, ends ?? (trialOpen ? M.plans.trial : null)].filter(Boolean).join(" · ");
    return (
      <View style={{ gap: tSpace[3] }}>
        {p.renderCard
          ? p.renderCard({ tier: p.tier, qr: qr.length ? <QrGrid modules={qr} size={68} /> : null })
          : card}
        <Press
          onPress={p.onSeePlans}
          haptic={false}
          accessibilityRole="link"
          accessibilityLabel={`${M.plans.current}. ${line}`}
          style={{
            minHeight: 60,
            paddingHorizontal: tSpace[4],
            paddingVertical: tSpace[2.5],
            borderRadius: tRadius.cardLg,
            flexDirection: "row",
            alignItems: "center",
            gap: tSpace[3],
            backgroundColor: t.surface,
            boxShadow: t.shadow.card,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[tType.label, { fontSize: 15, color: t.ink }]}>{M.plans.current}</Text>
            <Text style={[tType.bodyS, { color: t.ink2 }]}>{line}</Text>
          </View>
          <Icon name="forward" size={18} color={t.ink3} />
        </Press>
      </View>
    );
  }

  return (
    <View style={{ gap: tSpace[5] }}>
      {part === "all" ? card : null}
      {ends ? <Text style={[tType.bodyS, { color: t.ink2, textAlign: "center" }]}>{ends}</Text> : null}
      <Text style={[tType.bodyS, { color: t.ink2 }]}>{M.plans.alwaysFree}</Text>
      {error ? (
        <Text accessibilityRole="alert" style={[tType.bodyS, { color: t.ink2 }]}>
          {error}
        </Text>
      ) : null}
      {p.plans.map((x) => (
        <TierCard
          key={x.tier}
          tier={x.tier}
          monthlyUgx={x.monthlyUgx}
          yearlyUgx={x.yearlyUgx ?? x.monthlyUgx * 10}
          features={[...M.plans.features[x.tier]]}
          current={p.tier === x.tier}
          chooseLabel={trialOpen ? M.plans.trial : M.plans.choose.replace("{tier}", TIER_WORDS[x.tier])}
          onChoose={async () => {
            setError(null);
            setView(null);
            if (trialOpen) {
              const r = await p.startTrial(x.tier);
              if (r.ok) setRevealed(x.tier);
              else setError(r.error);
            } else if (!p.msisdn) setError(p.payOff ?? null);
            else setPaying(x.tier);
          }}
        />
      ))}
      {trialOpen ? <Text style={[tType.caption, { color: t.ink3 }]}>{M.plans.trialNote}</Text> : null}
      {paying && plan && p.msisdn ? (
        <View style={{ gap: tSpace[3] }}>
          {view ? <PromptStatus view={view} /> : null}
          {view !== "paid" ? (
            <>
              <View style={{ flexDirection: "row", gap: tSpace[2], alignItems: "center", flexWrap: "wrap" }}>
                {(["mtn", "airtel"] as const).map((n) => (
                  <Chip key={n} label={NETWORK_NAME[n]} selected={network === n} onPress={() => setNetwork(n)} />
                ))}
                <Text style={[tType.caption, { color: t.ink3 }]}>{maskMsisdn(p.msisdn)}</Text>
              </View>
              <Button
                label={M.plans.pay.replace("{amount}", feeText(plan.monthlyUgx).replace("UGX ", ""))}
                variant="accent"
                busy={view === "approve_on_phone"}
                onPress={async () => {
                  setView("approve_on_phone");
                  const r = await p.pay({ tier: paying, period: "monthly", network, msisdn: p.msisdn!, idempotencyKey: key });
                  if (r.ok) setView(r.view);
                  else {
                    setView(null);
                    setError(r.error);
                  }
                }}
              />
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Loads the patient's membership and prices, and binds the section to `pt-plus` and the token. */
export function MeMembershipRoute(p: {
  name: string;
  code: string | null;
  id: Omit<MedicalId, "qr">;
  part?: MembershipPart;
  onSeePlans?: () => void;
  renderCard?: (x: { tier: Tier | null; qr: React.ReactNode | null }) => React.ReactNode;
}) {
  const [data, setData] = useState<{ row: MembershipRow | null; prices: PriceRow[]; msisdn: string | null } | null>(null);
  const [nonce, setNonce] = useState(0);
  // On focus as well as on a change here: a plan chosen on the plans page shows on the card on the way back.
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void Promise.all([loadMembership(), myMobile().catch(() => null)]).then(
        ([m, msisdn]) => live && setData({ ...m, msisdn }),
        () => {},
      );
      return () => {
        live = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps -- `nonce` re-runs the read after a trial or a payment
    }, [nonce]),
  );
  // Me's card shows before the plan is known, and with no connection at all: the plan and the code join it.
  if (!data) return p.part === "card" && p.renderCard ? <>{p.renderCard({ tier: null, qr: null })}</> : null;
  const now = new Date();
  const held = tierNow(data.row, now);
  return (
    <MeMembershipV2
      tier={held.tier}
      trial={held.trial}
      // Kampala's day (UTC+3), said the way every other date in the app is: "Thu 17 Dec".
      endsLabel={held.endsIso ? shortDayOf(new Date(new Date(held.endsIso).getTime() + 3 * 3600_000).toISOString().slice(0, 10)) : null}
      trialUsed={data.row?.trialUsed ?? false}
      name={p.name}
      memberNo={memberNumber(p.code)}
      id={p.id}
      part={p.part}
      onSeePlans={p.onSeePlans}
      renderCard={p.renderCard}
      plans={plansFrom(data.prices, now.toISOString().slice(0, 10))}
      // Paying from the app only where it is switched on; the free month needs no payment.
      msisdn={flag("mobilePayments") ? data.msisdn : null}
      payOff={HOME_V2_COPY.phone.payOff}
      qrToken={medicalIdToken}
      startTrial={async (tier) => {
        const r = await startTrial(tier);
        if (r.ok) setNonce((n) => n + 1);
        return r;
      }}
      pay={async (i) => {
        const r = await payPlus(i);
        if (r.ok && r.view === "paid") setNonce((n) => n + 1);
        return r;
      }}
    />
  );
}

/** The plans on their own page (`/plans`): the plans, the trial and paying, with no card to load. */
export function MePlansRoute() {
  return (
    <MeMembershipRoute
      part="plans"
      name=""
      code={null}
      id={{ emergencyContact: "", bloodGroup: null, allergies: [], conditions: [], hospitalLine: "" }}
    />
  );
}
