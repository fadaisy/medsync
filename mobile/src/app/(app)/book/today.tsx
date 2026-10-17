import type { Clinic, Ticket as TicketData, Today } from "@/data/visits";
import type { LiveIntake } from "@/lib/booking";
import { useCallback, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";

import {
  Button,
  Card,
  FieldError,
  IconDisc,
  Note,
  Press,
  Screen,
  TextLink,
  Ticket,
} from "@/components/tide";
import {
  hydrateTickets,
  joinLine,
  leaveLine,
  loadAhead,
  loadToday,
  payments,
  shownOffline,
  todaysQueueTicket,
  useTickets,
} from "@/data/visits";
import { HospitalPicker } from "@/features/visits/hospital-picker";
import {
  AHEAD_NOTE,
  aheadWords,
  clockOf,
  dayKeyOf,
  feeText,
  shortDayOf,
} from "@/features/visits/logic";
import { HONEST, HonestNote, pickStyle, StepTitle } from "@/features/visits/parts";
import { STAGE_WORD } from "@/lib/booking";
import { flag } from "@/lib/flags";
import { useSession } from "@/lib/session";
import { useNow } from "@/lib/use-now";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

/**
 * Come today (board TBookToday, prompt §8.3, PRD F-10 and F-12).
 *
 * All real: the clinics taking walk-ins now (`fetchWalkInDepartments`) and
 * their fee (the clinic's own price list), saving your place
 * (`pt-declare-intake`), its stage (`fetchLiveIntake`), giving it up
 * (`ha-cancel-intake`), and, once you are at the hospital, "N ahead of you"
 * (`patient_intake_ahead`, ADR 0084 §6). The ticket code is your MedSync
 * number, the one the desk matches.
 *
 * No count before a clinic is chosen and none on the clinic picker; never a
 * place number, a total, a wait or an hour (law L8). An intake goes to a
 * clinic, never to a doctor, so no doctor is offered here. Without a hospital
 * the patient chooses one first. Payments are simulated (`payments`).
 */
type Pay = "momo" | "desk";

export default function BookTodayScreen() {
  const t = useTide();
  const router = useRouter();
  const now = useNow();
  const { session } = useSession();
  // Home's "Come today" on a doctor's card names their clinic.
  const { clinic: fromHome } = useLocalSearchParams<{ clinic?: string }>();
  const fullName = session?.user.user_metadata?.full_name;
  const patient =
    typeof fullName === "string" && fullName.trim() ? fullName : "[First name] [Surname]";

  const [today, setToday] = useState<Today | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [offline, setOffline] = useState(false);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [ahead, setAhead] = useState<number | null>(null);
  const [pay, setPay] = useState<Pay>("momo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(false);
  // The ticket saved on this screen shows at once, before a re-read confirms it.
  const [issuedId, setIssuedId] = useState<string | null>(null);
  const all = useTickets();
  const held = todaysQueueTicket(all, now);

  // On focus, on "Check again" and after a hospital is chosen (ADR 0084 §15: never on a timer).
  const load = useCallback(() => {
    // The saved ticket first, from the phone; then the server.
    void hydrateTickets().then((cached) =>
      loadToday().then(
        (next) => {
          setToday(next);
          setLoadError(false);
          setOffline(false);
          if (next.live) void loadAhead(next.live.id).then(setAhead);
          else setAhead(null);
        },
        () => {
          setLoadError(true);
          const mine = todaysQueueTicket(cached, new Date());
          if (mine) {
            setOffline(true);
            shownOffline(mine);
          }
        },
      ),
    );
  }, []);
  useFocusEffect(load);

  // A real ticket shows while the server still holds the place (or while offline).
  const live = today?.live ?? null;
  const ticket = held && (offline || held.id === issuedId || live?.id === held.id) ? held : null;

  if (ticket)
    return (
      <Held
        tk={ticket}
        live={today?.live ?? null}
        ahead={ahead}
        offline={offline}
        onRefresh={load}
        onLeft={() => {
          setLeft(true);
          setToday((d) => (d ? { ...d, live: null } : d));
        }}
      />
    );

  if (!today) {
    return (
      <Screen back={{ label: "Book a visit" }} title="Join today's line" helpSource="book-today">
        {loadError ? (
          <View style={{ gap: tSpace[3] }}>
            <Note tone="plain">
              {"Couldn't load the clinics. Check your connection and try again."}
            </Note>
            <Button label="Try again" variant="outline" onPress={load} />
          </View>
        ) : (
          <ActivityIndicator color={t.ink} accessibilityLabel="Loading the clinics open now" />
        )}
      </Screen>
    );
  }

  if (!today.profile?.hospitalId || !today.hospitalName) {
    return (
      <Screen back={{ label: "Book a visit" }} title="Join today's line" helpSource="book-today">
        <HospitalPicker onChosen={load} />
        <HonestNote />
      </Screen>
    );
  }
  const profile = { ...today.profile, hospitalId: today.profile.hospitalId };
  const hospitalName = today.hospitalName;

  if (live) {
    return (
      <Screen
        back={{ label: "Book a visit" }}
        overline="Your place is saved"
        title="You are in today's line"
        helpSource="book-today"
      >
        <Card>
          <Text style={[tType.label, { color: t.ink }]}>
            {live.departmentName ?? "Today's clinic"}
          </Text>
          <Text style={[tType.bodyM, { color: t.ink2 }]}>
            {STAGE_WORD[live.status] ?? "In the line"}
          </Text>
          <AheadLines status={live.status} ahead={ahead} />
        </Card>
        <HonestNote />
        <View style={{ alignItems: "center" }}>
          <TextLink label="Check again" onPress={load} />
        </View>
        <Button label="Done" onPress={() => router.dismissTo("/(app)/(tabs)")} />
      </Screen>
    );
  }

  const clinics = today.clinics;
  const clinic: Clinic | undefined =
    clinics.find((c) => c.id === clinicId) ?? clinics.find((c) => c.id === fromHome) ?? clinics[0];
  const fee = clinic?.fee ?? null;
  const money = clinic?.feeLabel ?? feeText(fee);
  const save = fee && pay === "momo" ? `Pay ${feeText(fee)} and save my place` : "Save my place";

  const onSave = async () => {
    if (!clinic || busy) return;
    setBusy(true);
    setError(null);
    const res = await joinLine({
      profile,
      hospitalName,
      clinic,
      patient,
      payNow: pay === "momo",
      now: new Date(),
    });
    setBusy(false);
    if (res.ok) setIssuedId(res.ticket.id);
    else setError(res.error);
  };

  return (
    <Screen
      back={{ label: "Book a visit" }}
      overline={`Today · ${shortDayOf(dayKeyOf(now))}`}
      overlineColor={t.accentText}
      title="Join today's line"
      helpSource="book-today"
    >
      {left ? (
        <Note tone="info" icon="check">
          We removed your place. Nothing is saved for you today.
        </Note>
      ) : null}

      <View style={{ gap: tSpace[2] }}>
        <StepTitle>Clinics open now</StepTitle>
        {clinics.length === 0 ? (
          <Note tone="plain">
            No clinic takes walk-ins right now. You can ask for a day instead.
          </Note>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -tSpace[5], flexGrow: 0 }}
            contentContainerStyle={{
              paddingHorizontal: tSpace[5],
              gap: tSpace[2],
              paddingBottom: 2,
            }}
          >
            {clinics.map((c) => {
              const on = c.id === clinic?.id;
              return (
                <Press
                  key={c.id}
                  onPress={() => setClinicId(c.id)}
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${c.name}, open now`}
                  style={{
                    minWidth: 128,
                    minHeight: 52,
                    paddingVertical: tSpace[2.5],
                    paddingHorizontal: tSpace[3],
                    borderRadius: tRadius.row,
                    backgroundColor: on ? t.primary : t.surface,
                    boxShadow: on ? undefined : t.shadow.card,
                    gap: 2,
                  }}
                >
                  <Text style={[tType.labelS, { color: on ? t.onPrimary : t.ink }]}>{c.name}</Text>
                  <Text
                    style={[
                      tType.caption,
                      { fontFamily: tFont.medium, color: on ? t.onPrimary : t.ink2 },
                    ]}
                  >
                    Open now
                  </Text>
                </Press>
              );
            })}
          </ScrollView>
        )}
      </View>

      <HonestNote after="Sicker people are seen first. Any doctor in the clinic may see you." />

      {fee ? (
        <View style={{ gap: tSpace[2] }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <StepTitle>Payment</StepTitle>
            <Text
              style={[
                tType.heading,
                { fontFamily: tFont.bold, color: t.ink, fontVariant: ["tabular-nums"] },
              ]}
            >
              {money}
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: tSpace[2] }}>
            <PayTile
              on={pay === "momo"}
              onPress={() => setPay("momo")}
              title="Mobile Money now"
              line="MTN or Airtel · skip the cash line"
            />
            <PayTile
              on={pay === "desk"}
              onPress={() => setPay("desk")}
              title="Pay at the desk"
              line="Cash or card before you are seen"
            />
          </View>
          {pay === "momo" ? (
            <Note tone="plain" icon="smartphone">
              {flag("mobilePayments")
                ? "A prompt comes to this phone. Enter your PIN to pay."
                : "Demo payment: no money moves, and your ticket says so."}
            </Note>
          ) : null}
          <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.ink3 }]}>
            Fee set by the hospital.
          </Text>
        </View>
      ) : null}

      <View style={{ gap: tSpace[2] }}>
        <StepTitle>Please bring</StepTitle>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tSpace[1.5] }}>
          {["Your medicines", "Clinic book"].map((b) => (
            <View
              key={b}
              style={{
                minHeight: 34,
                paddingHorizontal: tSpace[3],
                borderRadius: tRadius.pill,
                justifyContent: "center",
                backgroundColor: t.surface,
                borderWidth: 1,
                borderColor: t.line,
              }}
            >
              <Text style={[tType.bodyS, { color: t.ink }]}>{b}</Text>
            </View>
          ))}
        </View>
      </View>

      {error ? <FieldError>{error}</FieldError> : null}
      <Button
        label={save}
        iconRight="arrowRight"
        busy={busy}
        disabled={!clinic}
        onPress={() => void onSave()}
      />
      <View style={{ alignItems: "center" }}>
        <TextLink
          label="Cannot come today? Ask for a day"
          tone="info"
          onPress={() => router.replace("/book/day")}
        />
      </View>
    </Screen>
  );
}

/**
 * "N ahead of you" under the stage, only once the patient is present and the
 * count came back (`aheadWords`); with the reason it can move. Else nothing.
 */
function AheadLines({ status, ahead }: { status: string | null; ahead: number | null }) {
  const t = useTide();
  const words = aheadWords(status, ahead);
  if (!words) return null;
  return (
    <View accessibilityLiveRegion="polite" style={{ gap: 2 }}>
      <Text style={[tType.label, { fontSize: 15, color: t.ink }]}>{words}</Text>
      <Text style={[tType.bodyS, { color: t.ink2 }]}>{AHEAD_NOTE}</Text>
    </View>
  );
}

/** The saved place: the ticket, where it stands, and leaving it. */
function Held({
  tk,
  live,
  ahead,
  offline,
  onRefresh,
  onLeft,
}: {
  tk: TicketData;
  live: LiveIntake | null;
  ahead: number | null;
  offline: boolean;
  onRefresh: () => void;
  onLeft: () => void;
}) {
  const t = useTide();
  const router = useRouter();
  const now = useNow();
  const [paying, setPaying] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const stage = live ? (STAGE_WORD[live.status] ?? "In the line") : "Place saved";
  // Offline the count is not read: a number kept on the phone would go stale.
  const aheadLine = offline ? null : aheadWords(live?.status ?? null, ahead);
  return (
    <Screen
      back={{ label: "Book a visit" }}
      overline="Your place is saved"
      overlineColor={t.accentText}
      title={stage}
      helpSource="ticket"
    >
      {offline ? (
        <Note tone="plain">No internet. This is your saved ticket; it works at the desk.</Note>
      ) : null}
      <Ticket
        kind="queue"
        hospitalName={tk.hospitalName}
        stage={stage}
        aheadLine={aheadLine}
        details={[
          { label: "Clinic", value: tk.clinic },
          { label: "Room", value: tk.room },
          {
            label: "Date",
            value: `${shortDayOf(tk.dayKey ?? dayKeyOf(now))} · joined ${clockOf(tk.issuedAtIso)}`,
          },
          { label: "Patient", value: tk.patient },
          { label: "Time", value: "Not promised" },
        ]}
        fee={tk.fee}
        feeLabel={tk.feeLabel}
        paid={tk.paid}
        demoPayment={tk.demoPayment}
        paying={paying}
        onPayNow={() => {
          setPaying(true);
          void payments.payTicket(tk).then((r) => {
            setPaying(false);
            if (!r.ok) setErr(r.error);
          });
        }}
        code={tk.code}
      />
      <Card>
        <Text style={[tType.label, { fontSize: 15, color: t.ink }]}>
          {live ? stage : "Saved on this phone"}
        </Text>
        {offline ? null : <AheadLines status={live?.status ?? null} ahead={ahead} />}
        {live?.status === "declared" ? (
          <Text style={[tType.bodyS, { color: t.ink2 }]}>
            Show your code at the desk when you arrive. Your place in line starts then.
          </Text>
        ) : null}
        <Text style={[tType.bodyS, { color: t.ink2 }]}>{HONEST}</Text>
        <TextLink label="Check again" onPress={onRefresh} />
      </Card>
      {err ? <FieldError>{err}</FieldError> : null}
      <Button
        label="Give up my place"
        variant="outline"
        busy={leaving}
        onPress={() => {
          setLeaving(true);
          void leaveLine(tk).then((r) => {
            setLeaving(false);
            if (r.ok) onLeft();
            else setErr(r.error);
          });
        }}
      />
      <Button label="Done" onPress={() => router.dismissTo("/(app)/(tabs)")} />
    </Screen>
  );
}

function PayTile({
  on,
  onPress,
  title,
  line,
}: {
  on: boolean;
  onPress: () => void;
  title: string;
  line: string;
}) {
  const t = useTide();
  return (
    <Press
      onPress={onPress}
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${title}. ${line}`}
      style={{
        flex: 1,
        padding: tSpace[3],
        borderRadius: tRadius.row,
        gap: tSpace[1.5],
        ...pickStyle(t, on),
      }}
    >
      <IconDisc name="wallet" size={32} color={t.area.medicines} bg={t.surface2} />
      <Text style={[tType.labelS, { color: t.ink }]}>{title}</Text>
      <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.ink2 }]}>{line}</Text>
    </Press>
  );
}
