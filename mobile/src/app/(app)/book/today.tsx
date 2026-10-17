import type { Clinic, DemoLine, Ticket as TicketData, Today } from "@/data/visits";
import type { LiveIntake } from "@/lib/booking";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";

import {
  Avatar,
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
  loadToday,
  payments,
  shownOffline,
  todaysQueueTicket,
  useTickets,
} from "@/data/visits";
import {
  clockOf,
  dayKeyOf,
  feeText,
  shortDayOf,
  shortestLine,
  yourNumber,
} from "@/features/visits/logic";
import { HONEST, HonestNote, pickStyle, StepTitle, TravelCard } from "@/features/visits/parts";
import { STAGE_WORD } from "@/lib/booking";
import { flag } from "@/lib/flags";
import { useSession } from "@/lib/session";
import { useNow } from "@/lib/use-now";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

/**
 * Come today (board TBookToday, prompt §8.3, PRD F-10 and F-12).
 *
 * REAL: the clinics taking walk-ins now (`fetchWalkInDepartments`), saving
 * your place (`pt-declare-intake`), its stage (`fetchLiveIntake`) and giving
 * it up (`ha-cancel-intake`). The ticket code is your MedSync number, the one
 * the desk matches.
 *
 * DEMO, under the ribbon: how many are before you and each doctor's line.
 * `patient_intakes` RLS shows a patient their own row only, so the count
 * needs a server-side read that does not exist yet; and an intake goes to a
 * clinic, not a doctor, so the doctor is a preference on the ticket.
 *
 * Never an hour (law L8). Payments are simulated (`payments`).
 */
type Pay = "momo" | "desk";

export default function BookTodayScreen() {
  const t = useTide();
  const router = useRouter();
  const now = useNow();
  const { session } = useSession();
  const { doctor } = useLocalSearchParams<{ doctor?: string }>();
  const fullName = session?.user.user_metadata?.full_name;
  const patient =
    typeof fullName === "string" && fullName.trim() ? fullName : "[First name] [Surname]";

  const [today, setToday] = useState<Today | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [offline, setOffline] = useState(false);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [lineId, setLineId] = useState<string | null>(null);
  const [pay, setPay] = useState<Pay>("momo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(false);
  // The ticket saved on this screen shows at once, before a re-read confirms it.
  const [issuedId, setIssuedId] = useState<string | null>(null);
  const all = useTickets();
  const held = todaysQueueTicket(all, now);

  useFocusEffect(
    useCallback(() => {
      // The saved ticket first, from the phone; then the server.
      void hydrateTickets().then((cached) =>
        loadToday().then(
          (next) => {
            setToday(next);
            setLoadError(false);
            setOffline(false);
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
    }, []),
  );

  // A real ticket shows while the server still holds the place (or while offline).
  const live = today?.live ?? null;
  const ticket =
    held && (held.demo || offline || held.id === issuedId || live?.id === held.id) ? held : null;

  if (ticket)
    return (
      <Held
        tk={ticket}
        live={today?.live ?? null}
        offline={offline}
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
          <Note tone="plain">
            {"Couldn't load the clinics. Check your connection and try again."}
          </Note>
        ) : (
          <ActivityIndicator color={t.ink} accessibilityLabel="Loading the clinics open now" />
        )}
      </Screen>
    );
  }

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
        </Card>
        <HonestNote />
        <Button label="Done" onPress={() => router.dismissTo("/(app)/(tabs)")} />
      </Screen>
    );
  }

  const clinics = today.clinics;
  const fromDoctor = doctor ? clinics.find((c) => c.lines.some((l) => l.id === doctor)) : undefined;
  const clinic: Clinic | undefined =
    clinics.find((c) => c.id === clinicId) ?? fromDoctor ?? clinics[0];
  const lines = clinic?.lines ?? [];
  const shortest = shortestLine(lines);
  const pickedId = lineId ?? (doctor && lines.some((l) => l.id === doctor) ? doctor : "any");
  const line: DemoLine | null =
    pickedId === "any" ? null : (lines.find((l) => l.id === pickedId) ?? null);
  const ahead = line ? line.ahead : (shortest?.ahead ?? 0);
  const fee = line?.fee ?? null;
  const save = fee && pay === "momo" ? `Pay ${feeText(fee)} and save my place` : "Save my place";

  const onSave = async () => {
    if (!clinic || busy) return;
    setBusy(true);
    setError(null);
    const res = await joinLine({
      today,
      clinic,
      line,
      ahead,
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
      demo
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
                  onPress={() => {
                    setClinicId(c.id);
                    setLineId("any");
                  }}
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${c.name}, ${c.sub}`}
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
                    {c.sub}
                  </Text>
                </Press>
              );
            })}
          </ScrollView>
        )}
      </View>

      {clinic ? (
        <View style={{ gap: tSpace[2] }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <StepTitle>Who do you want to see?</StepTitle>
            <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.ink3 }]}>
              Line now · your number
            </Text>
          </View>
          <LineRow
            on={pickedId === "any"}
            onPress={() => setLineId("any")}
            lead={<IconDisc name="users" size={40} color={t.accentText} bg={t.accentTint} />}
            name="Any doctor"
            meta="Fastest · first one free sees you"
            ahead={shortest?.ahead ?? 0}
            best
          />
          {lines.map((l) => (
            <LineRow
              key={l.id}
              on={pickedId === l.id}
              onPress={() => setLineId(l.id)}
              lead={
                <Avatar
                  initials={l.initials}
                  size={40}
                  bg={l.yours ? t.info.tint : t.surface2}
                  fg={l.yours ? t.info.text : t.ink2}
                />
              }
              name={l.name}
              meta={`${l.role} · ${feeText(l.fee)}`}
              ahead={l.ahead}
              best={l.ahead === shortest?.ahead}
            />
          ))}
        </View>
      ) : null}

      {clinic ? (
        <View
          style={{
            borderRadius: tRadius.panel,
            padding: tSpace[4],
            backgroundColor: t.band,
            gap: tSpace[2.5],
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: tSpace[2] }}>
            <Text style={[tType.bodyS, { flex: 1, color: t.onBand2 }]} numberOfLines={1}>
              {`${clinic.name} · ${line?.name ?? "Any doctor"}`}
            </Text>
            <Text style={[tType.bodyS, { color: t.onBand2 }]}>{`${ahead} before you`}</Text>
          </View>
          <View
            accessible
            accessibilityLabel={`${ahead} people before you`}
            style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: 4 }}
          >
            {Array.from({ length: Math.min(ahead, 14) }, (_, i) => (
              <View
                key={i}
                style={{
                  width: 18,
                  height: 26,
                  borderTopLeftRadius: 9,
                  borderTopRightRadius: 9,
                  borderBottomLeftRadius: 5,
                  borderBottomRightRadius: 5,
                  backgroundColor: t.onBand2,
                  opacity: i === 0 ? 1 : 0.35,
                }}
              />
            ))}
            <View
              style={{
                width: 26,
                height: 34,
                borderTopLeftRadius: 13,
                borderTopRightRadius: 13,
                borderBottomLeftRadius: 7,
                borderBottomRightRadius: 7,
                backgroundColor: t.accent,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontFamily: tFont.bold, fontSize: 10, color: t.onAccent }}>You</Text>
            </View>
          </View>
          <Text
            style={[tType.heading, { color: t.onBand }]}
          >{`You would be number ${yourNumber(ahead)}`}</Text>
        </View>
      ) : null}

      <HonestNote after="Doctors take longer with some people." />

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
              {feeText(fee)}
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
          {["Your medicines", "Clinic book", "Your sugar meter"].map((b) => (
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

/** The saved place: the ticket, how the line stands, the way there, and leaving it. */
function Held({
  tk,
  live,
  offline,
  onLeft,
}: {
  tk: TicketData;
  live: LiveIntake | null;
  offline: boolean;
  onLeft: () => void;
}) {
  const t = useTide();
  const router = useRouter();
  const now = useNow();
  const [paying, setPaying] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const n = yourNumber(tk.ahead ?? 0);
  const room = tk.room;
  return (
    <Screen
      back={{ label: "Book a visit" }}
      overline="Your place is saved"
      overlineColor={t.accentText}
      title={`You are number ${n}`}
      helpSource="ticket"
      demo={tk.countDemo || tk.demo}
    >
      {offline ? (
        <Note tone="plain">No internet. This is your saved ticket; it works at the desk.</Note>
      ) : null}
      <Ticket
        kind="queue"
        hospitalName={tk.hospitalName}
        number={n}
        ahead={tk.ahead ?? 0}
        details={[
          { label: "Clinic", value: tk.clinic },
          { label: "See", value: tk.see },
          { label: "Room", value: room },
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
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text
            style={[tType.label, { fontSize: 15, color: t.ink }]}
          >{`${tk.ahead ?? 0} people before you`}</Text>
          <Text style={[tType.bodyS, { color: t.ink3 }]}>
            {live ? (STAGE_WORD[live.status] ?? "In the line") : "Saved on this phone"}
          </Text>
        </View>
        <View
          style={{ height: 8, borderRadius: 4, backgroundColor: t.surface3, overflow: "hidden" }}
        >
          <View
            style={{
              width: `${Math.max(8, Math.round(100 / ((tk.ahead ?? 0) + 2)))}%`,
              height: "100%",
              borderRadius: 4,
              backgroundColor: t.accent,
            }}
          />
        </View>
        <Text style={[tType.bodyS, { color: t.ink2 }]}>{HONEST}</Text>
      </Card>
      <TravelCard
        room={room}
        footer={
          <Text style={[tType.caption, { flex: 1, fontFamily: tFont.medium, color: t.ink2 }]}>
            Map and travel times illustrative. If you are far, leave in good time.
          </Text>
        }
      />
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

/** One line: who, their fee, how many wait, and the number you would hold. */
function LineRow({
  on,
  onPress,
  lead,
  name,
  meta,
  ahead,
  best,
}: {
  on: boolean;
  onPress: () => void;
  lead: ReactNode;
  name: string;
  meta: string;
  ahead: number;
  best: boolean;
}) {
  const t = useTide();
  return (
    <Press
      onPress={onPress}
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${name}, ${meta}, ${ahead} waiting, you would be number ${yourNumber(ahead)}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: tSpace[3],
        padding: tSpace[2.5],
        paddingHorizontal: tSpace[3],
        borderRadius: tRadius.row,
        ...pickStyle(t, on),
      }}
    >
      {lead}
      <View style={{ flex: 1 }}>
        <Text style={[tType.label, { fontSize: 15, color: t.ink }]}>{name}</Text>
        <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.ink2 }]}>{meta}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text
          style={[
            tType.label,
            { fontFamily: tFont.bold, fontSize: 15, color: t.ink, fontVariant: ["tabular-nums"] },
          ]}
        >
          {`${ahead} waiting`}
        </Text>
        <Text
          style={[tType.micro, { fontFamily: tFont.semibold, color: best ? t.accentText : t.ink2 }]}
        >
          {`You: #${yourNumber(ahead)}`}
        </Text>
      </View>
    </Press>
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
