import type { MoveOption } from "@/data/visits";
import type { AppointmentRow } from "@/lib/booking";
import { useEffect, useState } from "react";
import { cancellationSentence } from "@shared/cancel-reasons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  Avatar,
  BackLink,
  Button,
  Card,
  FieldError,
  Icon,
  Note,
  Press,
  Screen,
  Sheet,
  TextField,
  Ticket,
} from "@/components/tide";
import { loadVisit, moveOptions, payments, useTickets, visitActions } from "@/data/visits";
import { ShareLocationSheet } from "@/features/location-share/share-sheet";
import { BookingCalendar } from "@/features/visits/calendar";
import {
  clockOf,
  dayKeyOf,
  dayNumberOf,
  longDayOf,
  monthShortOf,
  partOf,
  shortDayOf,
  weekdayOf,
} from "@/features/visits/logic";
import { HONEST } from "@/features/visits/parts";
import { Countdown, TimeWheel } from "@/features/visits/time-wheel";
import {
  APPOINTMENT_REASONS,
  canArrive,
  CANCELLABLE,
  MIN_REASON_CHARS,
  RESCHEDULABLE,
  STATUS_LABEL,
} from "@/lib/booking";
import { flag } from "@/lib/flags";
import { confirmationPending } from "@/lib/notifications";
import { useNow } from "@/lib/use-now";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

/**
 * One visit (board TVisit/DVisit, PRD F-08): a navy band with the day tile
 * pulled out of the right edge, who you will see, how to get there, and three
 * actions, all real (`src/lib/booking.ts`):
 *
 * - "I'm coming" answers the clinic's day-before request (`pt-confirm-attendance`);
 *   on the day itself it becomes "I'm here" (`ha-mark-arrived`).
 * - "Move it" offers this clinician's open days as a day and a part of the
 *   day, never a clock time (law L8). A place in a clinic day cannot move
 *   (the server refuses), so the control is off there.
 * - "Cancel" asks why, as the server requires.
 *
 * A household member's visit is logistics only: no action is offered. The
 * visit shows its status, never a place number (ADR 0084 §6); no map or travel
 * time is drawn, because none is known. The message button shows only with
 * `mobileChat` on (ADR 0342 §4).
 */
type Mode = "idle" | "move" | "cancel";
type Outcome = { ok: true } | { ok: false; error: string };

export default function VisitScreen() {
  const t = useTide();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [visit, setVisit] = useState<AppointmentRow | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "failed">("loading");
  const [mode, setMode] = useState<Mode>("idle");
  const [options, setOptions] = useState<MoveOption[] | null>(null);
  const [chosen, setChosen] = useState<MoveOption | null>(null);
  const [moveDay, setMoveDay] = useState<string | null>(null);
  const now = useNow(60_000);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [paying, setPaying] = useState(false);
  // The ticket this phone issued for the visit, if it did: its fee, payment and patient line.
  const tickets = useTickets();

  useEffect(() => {
    let live = true;
    loadVisit(id).then(
      (row) => {
        if (!live) return;
        setVisit(row);
        setState(row ? "ready" : "missing");
      },
      () => {
        if (live) setState("failed");
      },
    );
    return () => {
      live = false;
    };
  }, [id, attempt]);

  if (state !== "ready" || !visit) {
    return (
      <Screen back={{ label: "Visits" }} title="Your visit" helpSource="visit">
        {state === "loading" ? (
          <ActivityIndicator color={t.ink} accessibilityLabel="Loading this visit" />
        ) : state === "failed" ? (
          <View style={{ gap: tSpace[3] }}>
            <Note tone="plain">
              {"Couldn't load this visit. Check your connection and try again."}
            </Note>
            <Button
              label="Try again"
              variant="outline"
              onPress={() => {
                setState("loading");
                setAttempt((n) => n + 1);
              }}
            />
          </View>
        ) : (
          <Note tone="plain">{"This visit isn't in your list. Go back and open it again."}</Note>
        )}
      </Screen>
    );
  }

  const mine = visit.forMember === null;
  const arrivable = mine && canArrive(visit);
  const confirmable = mine && !arrivable && confirmationPending(visit);
  const canMove = mine && RESCHEDULABLE.has(visit.status) && visit.sessionId === null;
  const canCancel = mine && CANCELLABLE.has(visit.status);
  const title =
    APPOINTMENT_REASONS.find((r) => r.value === visit.reason)?.title ?? visit.departmentName;
  const key = dayKeyOf(visit.startsAtIso);
  const ended = cancellationSentence(visit.status, visit.cancelledReason);
  const place = [STATUS_LABEL[visit.status], visit.bookingCode ? `code ${visit.bookingCode}` : null]
    .filter(Boolean)
    .join(" · ");
  const reasonShort = reason.trim().length < MIN_REASON_CHARS;
  // A doctor's slot has a time (ADR 0344); a place in a clinic day has a part of the day only.
  const slot = visit.sessionId === null;
  const issued = tickets.find((x) => x.id === visit.id) ?? null;
  const live = !ended && visit.status !== "completed" && visit.status !== "no_show";

  const closeSheet = () => {
    setMode("idle");
    setChosen(null);
    setMoveDay(null);
    setReason("");
    setError(null);
  };

  const openMove = () => {
    setMode("move");
    setError(null);
    if (options === null)
      moveOptions(visit).then(setOptions, () => {
        setOptions([]);
        setError("Couldn't load the days the clinic has open.");
      });
  };

  /** One write: the server's own sentence on a refusal, verbatim. */
  const run = async (act: () => Promise<Outcome>, done: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await act();
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    setNotice(done);
    return true;
  };

  const submitPrimary = () =>
    arrivable
      ? run(async () => {
          const res = await visitActions.arrive(visit.id);
          if (res.ok) setVisit({ ...visit, status: "arrived" });
          return res;
        }, "The clinic knows you are here.")
      : run(async () => {
          const res = await visitActions.confirm(visit.id);
          if (res.ok)
            setVisit({ ...visit, confirmedByPatientAtIso: res.data.confirmed_by_patient_at });
          return res;
        }, "Thank you. The clinic expects you.");

  // Move it: the calendar picks a day with open time, the wheel a time on it (as Ask for a day).
  const openDays = new Set((options ?? []).map((o) => o.dayKey));
  const moveDayKey = moveDay && openDays.has(moveDay) ? moveDay : (options?.[0]?.dayKey ?? null);
  const dayOptions = (options ?? []).filter((o) => o.dayKey === moveDayKey);
  const pick = (chosen && chosen.dayKey === moveDayKey ? chosen : dayOptions[0]) ?? null;

  const submitMove = async () => {
    const to = pick;
    if (!to) return;
    const ok = await run(async () => {
      const res = await visitActions.move(visit, to, reason);
      if (res.ok)
        setVisit({
          ...visit,
          id: res.data.new_appointment_id,
          startsAtIso: to.startsAtIso,
          endsAtIso: to.endsAtIso,
          status: res.data.new_status,
        });
      return res;
    }, "Your visit has moved.");
    if (ok) {
      setOptions(null);
      closeSheet();
    }
  };

  const submitCancel = async () => {
    const ok = await run(async () => {
      const res = await visitActions.cancel(visit.id, reason);
      if (res.ok) setVisit({ ...visit, status: res.data.status });
      return res;
    }, "Your visit is cancelled.");
    if (ok) closeSheet();
  };

  return (
    <Screen
      header={<BackLink label="Visits" color={t.onBand} />}
      help="pill"
      helpSource="visit"
      topBand={
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: insets.top + 56,
            backgroundColor: t.band,
          }}
        />
      }
      footer={
        mine ? (
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 30 }}>
            <RoundAction
              icon="check"
              label={arrivable ? "I'm here" : "I'm coming"}
              primary
              disabled={!(arrivable || confirmable) || busy}
              onPress={() => void submitPrimary()}
            />
            <RoundAction icon="calendar" label="Move it" disabled={!canMove} onPress={openMove} />
            <RoundAction
              icon="close"
              label="Cancel"
              disabled={!canCancel}
              onPress={() => {
                setMode("cancel");
                setError(null);
              }}
            />
          </View>
        ) : undefined
      }
    >
      {/* the band, continued under the header */}
      <View
        style={{
          marginHorizontal: -tSpace[5],
          marginTop: -tSpace[1] - 6,
          paddingTop: tSpace[2],
          paddingLeft: tSpace[5],
          paddingBottom: 48,
          backgroundColor: t.band,
          borderBottomLeftRadius: tRadius.xl,
          borderBottomRightRadius: tRadius.xl,
          flexDirection: "row",
          gap: tSpace[3.5],
          alignItems: "flex-start",
        }}
      >
        <View style={{ flex: 1, gap: tSpace[2] }}>
          <View
            style={{
              alignSelf: "flex-start",
              flexDirection: "row",
              alignItems: "center",
              gap: 7,
              minHeight: 28,
              paddingHorizontal: 11,
              borderRadius: tRadius.pill,
              backgroundColor: t.bandGlass,
            }}
          >
            <View
              style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.area.visits }}
            />
            <Text style={[tType.bodyS, { color: t.onBand }]}>
              {visit.forMember ? `Visit for ${visit.forMember}` : `Visit · ${visit.departmentName}`}
            </Text>
          </View>
          <Text accessibilityRole="header" style={[tType.display, { color: t.onBand }]}>
            {title}
          </Text>
          {place ? <Text style={[tType.bodyM, { color: t.onBand2 }]}>{place}</Text> : null}
          <Text
            style={[tType.bodyM, { fontFamily: tFont.regular, fontSize: 14, color: t.onBand2 }]}
          >
            {slot
              ? "Please arrive a little early. The doctor may see you later than your time."
              : HONEST}
          </Text>
        </View>
        {/* the day tile, pulled out of the right edge */}
        <View
          accessible
          accessibilityLabel={shortDayOf(key)}
          style={{
            width: 72,
            height: 84,
            backgroundColor: t.surface,
            borderTopLeftRadius: tRadius.cardLg,
            borderBottomLeftRadius: tRadius.cardLg,
            alignItems: "center",
            justifyContent: "center",
            paddingRight: 4,
          }}
        >
          <Text style={[tType.numeral, { color: t.ink }]}>{dayNumberOf(key)}</Text>
          <Text style={[tType.bodyS, { color: t.ink2 }]}>{weekdayOf(key)}</Text>
        </View>
      </View>

      {/* who you will see */}
      <Card
        radius={tRadius.cardLg}
        style={{
          marginTop: -28 - tSpace[4],
          flexDirection: "row",
          alignItems: "center",
          gap: tSpace[3],
          boxShadow: t.shadow.float,
        }}
      >
        <Avatar initials={initialsOf(visit.clinicianName)} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={[tType.heading, { color: t.ink }]}>{visit.clinicianName}</Text>
          <Text style={[tType.bodyM, { fontFamily: tFont.regular, fontSize: 14, color: t.ink2 }]}>
            Your clinician
          </Text>
        </View>
        {flag("mobileChat") ? (
          <Press
            onPress={() => router.push("/care/chat")}
            accessibilityLabel="Message your care team"
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              backgroundColor: t.accent,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="message" size={20} color={t.onAccent} />
          </Press>
        ) : null}
      </Card>

      {/* The ticket in the hand (ADR 0348): it leans, turns over and shares. */}
      {live ? (
        <Ticket
          kind="day"
          hospitalName={visit.hospitalName}
          day={dayNumberOf(key)}
          dayLine={`${weekdayOf(key)} · ${monthShortOf(key)}`.toUpperCase()}
          sessionLine={
            slot
              ? clockOf(visit.startsAtIso)
              : issued?.doors
                ? `${partOf(visit.startsAtIso)} · doors ${issued.doors}`
                : partOf(visit.startsAtIso)
          }
          status={STATUS_LABEL[visit.status]}
          details={[
            { label: "Clinic", value: visit.departmentName },
            { label: "See", value: visit.clinicianName },
            {
              label: "Time",
              value: slot
                ? `${clockOf(visit.startsAtIso)} · arrive a little early`
                : "Not promised",
            },
            ...(issued ? [{ label: "Patient", value: issued.patient }] : []),
          ]}
          // Only what this phone knows: no strip at all rather than a guessed fee.
          fee={issued ? issued.fee : undefined}
          feeLabel={issued?.feeLabel}
          paid={issued?.paid ?? false}
          demoPayment={issued?.demoPayment}
          paying={paying}
          onPayNow={
            issued && mine
              ? () => {
                  setPaying(true);
                  void payments.payTicket(issued).then((r) => {
                    setPaying(false);
                    if (!r.ok) setError(r.error);
                  });
                }
              : undefined
          }
          code={visit.bookingCode ?? issued?.code ?? "Ask at the desk"}
        />
      ) : null}

      {notice ? (
        <Note tone="info" icon="check">
          {notice}
        </Note>
      ) : null}
      {error && mode === "idle" ? <FieldError>{error}</FieldError> : null}
      {ended ? <Note tone="plain">{ended}</Note> : null}
      {!mine ? (
        <Note tone="plain">{`You booked this for ${visit.forMember}. It can be moved or cancelled at the desk.`}</Note>
      ) : null}

      <View style={{ gap: tSpace[2] }}>
        <Text accessibilityRole="header" style={[tType.heading, { fontSize: 18, color: t.ink }]}>
          Getting there
        </Text>
        <Text style={[tType.bodyM, { fontFamily: tFont.regular, color: t.ink2 }]}>
          {`${visit.hospitalName} · ${visit.departmentName}`}
        </Text>
        <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.ink3 }]}>
          {visit.bookingCode
            ? `Show code ${visit.bookingCode} at the desk when you arrive.`
            : "Show your MedSync number at the desk when you arrive."}
        </Text>
        {/* Upcoming and not yet arrived: family can follow the trip with a private link (ADR 0343). */}
        {mine && RESCHEDULABLE.has(visit.status) ? (
          <Button
            label="Share my location while I travel"
            variant="outline"
            icon="locate"
            onPress={() => setSharing(true)}
          />
        ) : null}
      </View>

      <ShareLocationSheet visible={sharing} onClose={() => setSharing(false)} purpose="visit" />

      <Sheet
        visible={mode === "move"}
        onClose={closeSheet}
        help={false}
        overline="Move it"
        title="Pick another day and time"
      >
        {options === null ? (
          <ActivityIndicator
            color={t.ink}
            accessibilityLabel="Finding the days the clinic has open"
          />
        ) : options.length === 0 ? (
          <Note tone="plain">No other day is open with this clinician on MedSync yet.</Note>
        ) : (
          <>
            <BookingCalendar
              today={dayKeyOf(now)}
              open={openDays}
              selected={moveDayKey}
              onSelect={(k) => {
                setMoveDay(k);
                setChosen(null);
              }}
            />
            {pick && moveDayKey ? (
              <Card padding={tSpace[3]} style={{ flexDirection: "row", gap: tSpace[3] }}>
                <Countdown
                  iso={pick.startsAtIso}
                  whenLine={`${shortDayOf(pick.dayKey)} at ${clockOf(pick.startsAtIso)}`}
                />
                <TimeWheel
                  key={moveDayKey}
                  label={`Times on ${longDayOf(moveDayKey)}`}
                  times={dayOptions.map((o) => clockOf(o.startsAtIso))}
                  index={dayOptions.indexOf(pick)}
                  onChange={(k) => setChosen(dayOptions[k] ?? null)}
                />
              </Card>
            ) : null}
          </>
        )}
        <Text style={[tType.bodyS, { color: t.ink2 }]}>
          Please arrive a little early. The doctor may see you later than your time.
        </Text>
        <ReasonField value={reason} onChange={setReason} />
        {error ? <FieldError>{error}</FieldError> : null}
        <Button
          label="Move my visit"
          busy={busy}
          disabled={!pick || reasonShort}
          onPress={() => void submitMove()}
        />
        <Button label="Keep it" variant="soft" onPress={closeSheet} />
      </Sheet>

      <Sheet
        visible={mode === "cancel"}
        onClose={closeSheet}
        overline="Cancel"
        title="Cancel this visit?"
      >
        <Text style={[tType.bodyM, { color: t.ink2 }]}>
          The clinic can give your place to someone else. Moving it keeps you in the line.
        </Text>
        <ReasonField value={reason} onChange={setReason} />
        {error ? <FieldError>{error}</FieldError> : null}
        <Button
          label="Cancel this visit"
          busy={busy}
          disabled={reasonShort}
          onPress={() => void submitCancel()}
        />
        <Button label="Keep it" variant="soft" onPress={closeSheet} />
      </Sheet>
    </Screen>
  );
}

/** "DR" for a name we cannot split; initials only, never a photo here. */
function initialsOf(name: string): string {
  const words = name
    .replace(/^Dr\.?\s+/i, "")
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w));
  return (
    words
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join("") || "DR"
  );
}

/** The reason both functions require (at least eight characters, for the audit log). */
function ReasonField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <TextField
      label="Why? The clinic reads this."
      value={value}
      onChangeText={onChange}
      placeholder="For example, I cannot travel that day"
      maxLength={300}
      multiline
    />
  );
}

/** One of the three round actions at the foot of the visit. */
function RoundAction({
  icon,
  label,
  onPress,
  primary = false,
  disabled = false,
}: {
  icon: "check" | "calendar" | "close";
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  const t = useTide();
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      style={{ alignItems: "center", gap: tSpace[1.5], opacity: disabled ? 0.45 : 1 }}
    >
      <View
        style={{
          width: 58,
          height: 58,
          borderRadius: 29,
          backgroundColor: primary ? t.accent : t.surface,
          alignItems: "center",
          justifyContent: "center",
          boxShadow: primary ? t.shadow.accent : t.shadow.card,
        }}
      >
        <Icon
          name={icon}
          size={primary ? 24 : 22}
          color={primary ? t.onAccent : t.ink}
          strokeWidth={primary ? 2.3 : 1.8}
        />
      </View>
      <Text
        style={[
          tType.bodyS,
          { fontFamily: primary ? tFont.semibold : tFont.medium, color: primary ? t.ink : t.ink2 },
        ]}
      >
        {label}
      </Text>
    </Press>
  );
}
