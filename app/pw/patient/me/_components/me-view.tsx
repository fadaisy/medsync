"use client";

import type { HealthCardData } from "@/components/tide/me-health-card";
import Link from "next/link";
import { useState, useTransition } from "react";
import {
  BellIcon,
  CreditCardIcon,
  EyeIcon,
  FileTextIcon,
  GlobeIcon,
  HeartIcon,
  MapPinIcon,
  MessageSquareIcon,
  MoonIcon,
  PillIcon,
  PlusIcon,
  RefreshCwIcon,
  SunIcon,
  TriangleAlertIcon,
  TypeIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import { useTheme } from "next-themes";

import { Segments } from "@/components/tide/controls";
import { Avatar, Button, ICON } from "@/components/tide/kit";
import { MeHealthCard } from "@/components/tide/me-health-card";
import { ME_COPY as C } from "@/content/patient/me";
import { PATIENT_WEB_COPY as W } from "@/content/patient/web";
import { setSmsConsentAction } from "@/lib/patient-web/me-actions";
import { Group, Row, Switch } from "./rows";

export interface MeViewProps {
  /** The card with its conditions line already filtered (S18); shown only while the toggle is on. */
  card: Omit<HealthCardData, "conditions">;
  cardConditions: string;
  sex: string | null;
  rows: {
    conditions: string;
    allergies: string;
    family: string;
    medicines: string;
    places: string;
    language: string;
  };
  me: { initials: string; label: string };
  household: { id: string; label: string; initials: string }[];
  /** Null until the SMS consent text is seeded: the row hides, as on the old settings page. */
  smsOn: boolean | null;
  version: string;
}

type Theme = "system" | "light" | "dark";

/**
 * Me's interactive half: the card and its "Show conditions" toggle share one state (kept only for this
 * page view, W3), SMS consent through pt-set-sms-consent (S20), and the theme through next-themes.
 */
export function MeView(p: MeViewProps) {
  // PRD Q6: hidden until the holder shows them.
  const [show, setShow] = useState(false);
  const [smsOn, setSmsOn] = useState(p.smsOn);
  const [smsError, setSmsError] = useState<string | null>(null);
  const [smsBusy, startSms] = useTransition();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const pref: Theme = theme === "light" || theme === "dark" ? theme : "system";

  const toggleSms = (next: boolean) =>
    startSms(async () => {
      setSmsError(null);
      const res = await setSmsConsentAction(next).catch(() => ({
        ok: false as const,
        error: W.offline,
      }));
      if (res.ok) setSmsOn(res.on);
      else setSmsError(res.error);
    });

  return (
    <div className="grid items-start gap-7 max-[760px]:gap-5 min-[1101px]:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-2.5">
          <MeHealthCard data={{ ...p.card, conditions: show ? p.cardConditions : null }} />
          <p className="text-pw-ink-3 flex max-w-[460px] items-center justify-between gap-2 px-1 text-[13px] font-medium">
            <span className="inline-flex items-center gap-1.5">
              <RefreshCwIcon className="size-3.5" {...ICON} />
              {C.turnHint}
            </span>
            {p.sex ? <span>{p.sex}</span> : null}
          </p>
        </div>

        <Group label={C.myHealth}>
          <Row
            icon={HeartIcon}
            iconClass="text-pw-area-readings"
            title={C.conditions}
            sub={p.rows.conditions}
            href="/patient/me/conditions"
          />
          <Row
            icon={TriangleAlertIcon}
            title={C.allergies}
            sub={p.rows.allergies}
            href="/patient/me/allergies"
          />
          <Row
            icon={UsersIcon}
            iconClass="text-pw-area-team"
            title={C.family}
            sub={p.rows.family}
            href="/patient/me/family"
          />
          <Row
            icon={PillIcon}
            iconClass="text-pw-area-medicines"
            title={C.medicines}
            sub={p.rows.medicines}
            href="/patient/care/medicines"
          />
          <Row
            icon={FileTextIcon}
            iconClass="text-pw-area-team"
            title={C.records}
            sub={C.recordsSub}
            href="/patient/me/records"
          />
        </Group>

        <section className="flex flex-col gap-2" aria-labelledby="me-people">
          <h2
            id="me-people"
            className="text-pw-ink-3 px-1 text-[13px] leading-[18px] font-semibold"
          >
            {C.people}
          </h2>
          <div className="rounded-pw-card bg-pw-surface shadow-pw-card flex flex-col gap-2 p-3.5">
            <ul className="flex flex-wrap gap-2.5">
              <li className="flex w-16 flex-col items-center gap-1">
                <span className="ring-pw-accent rounded-full p-0.5 ring-2">
                  <Avatar initials={p.me.initials} label={p.me.label} />
                </span>
                <span className="text-xs font-semibold">{C.peopleMe}</span>
              </li>
              {p.household.map((m) => (
                <li key={m.id}>
                  <Link
                    href="/patient/me/household"
                    className="focus-visible:outline-pw-focus flex w-16 flex-col items-center gap-1 rounded-lg focus-visible:outline-2"
                  >
                    <span className="p-0.5">
                      <Avatar
                        initials={m.initials}
                        label={m.label}
                        className="bg-pw-place-tint text-pw-place-text"
                      />
                    </span>
                    <span className="w-full truncate text-center text-xs font-semibold">
                      {m.label}
                    </span>
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/patient/me/household"
                  className="focus-visible:outline-pw-focus flex w-16 flex-col items-center gap-1 rounded-lg focus-visible:outline-2"
                >
                  <span className="p-0.5">
                    <span className="ring-pw-line-strong grid size-12 place-items-center rounded-full ring-[1.5px] ring-inset">
                      <PlusIcon className="size-5" {...ICON} />
                    </span>
                  </span>
                  <span className="text-pw-ink-2 text-xs font-semibold">{C.peopleAdd}</span>
                </Link>
              </li>
            </ul>
            <p className="text-pw-ink-2 text-[13px] leading-[18px] font-medium">{C.peopleNote}</p>
          </div>
        </section>
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <Group label={C.places}>
          <Row
            icon={MapPinIcon}
            title={C.placesRow}
            sub={p.rows.places}
            href="/patient/me/places"
          />
        </Group>

        <Group label={C.details}>
          <Row icon={UserIcon} title={C.detailsRow} sub={C.detailsSub} href="/patient/me/profile" />
        </Group>

        <Group label={C.privacy}>
          <Row
            icon={CreditCardIcon}
            title={C.showOnCard}
            sub={
              <>
                {show ? C.showOnCardOn : C.showOnCardOff}
                <span className="text-pw-ink-3 block">{C.showOnCardWeb}</span>
              </>
            }
            right={<Switch label={C.showOnCard} checked={show} onChange={setShow} />}
          />
          <Row
            icon={EyeIcon}
            iconClass="text-pw-accent-text"
            title={C.whoSees}
            sub={
              <dl className="mt-1 flex flex-col gap-1">
                {[
                  [C.whoSeesLogLabel, W.whoSeesLog],
                  [C.whoSeesHistoryLabel, W.whoSeesHistory],
                  [C.whoSeesRecordsLabel, W.whoSeesRecords],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-pw-ink font-semibold">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            }
          />
        </Group>

        <Group label={C.app}>
          <Row
            icon={BellIcon}
            iconClass="text-pw-accent-text"
            title={C.notifications}
            sub={C.notificationsSub}
            href="/patient/notifications"
          />
          {smsOn !== null ? (
            <Row
              icon={MessageSquareIcon}
              title={C.smsTitle(smsOn)}
              sub={C.smsSub(smsOn)}
              note={smsError}
              right={
                <Switch label={C.sms.label} checked={smsOn} busy={smsBusy} onChange={toggleSms} />
              }
            />
          ) : null}
          <Row
            icon={GlobeIcon}
            iconClass="text-pw-area-readings"
            title={C.language}
            sub={p.rows.language}
            href="/patient/me/profile"
          />
          <Row icon={TypeIcon} title={C.textSize} sub={C.textSizeSub} />
          <Row
            icon={resolvedTheme === "dark" ? MoonIcon : SunIcon}
            title={C.theme}
            sub={C.themeWords[pref]}
            right={
              <Segments
                label={C.theme}
                value={pref}
                onChange={setTheme}
                className="max-[420px]:w-full"
                options={(["system", "light", "dark"] as const).map((v) => ({
                  value: v,
                  label: C.themeOptions[v],
                }))}
              />
            }
          />
        </Group>

        <form action="/sign-out" method="post" className="flex flex-col">
          <Button type="submit" tone="outline">
            {C.signOut}
          </Button>
        </form>
        <p className="text-pw-ink-3 text-center text-[13px] font-medium">{C.version(p.version)}</p>
      </div>
    </div>
  );
}
