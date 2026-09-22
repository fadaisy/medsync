import type { EmergencySheetContact } from "@/lib/emergency/queries";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import {
  BabyIcon,
  BandageIcon,
  BoneIcon,
  BrainIcon,
  Building2Icon,
  CircleAlertIcon,
  CircleDotIcon,
  DropletIcon,
  EyeIcon,
  GaugeIcon,
  HandIcon,
  HeartIcon,
  MicIcon,
  PhoneIcon,
  ThermometerIcon,
  WindIcon,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { telHref } from "../_lib/client";
import { KIND_LABEL } from "../_lib/sheet";
import { CallLink } from "./call-link";

/**
 * E1 — the Emergency sheet (PRD MS-PRD-SYM-001 §8.2; ADR 0098 rulings 7–8).
 * The ONE web file besides the pill and E2's Send that paints red: the
 * header's primary call and "Tell a hospital I'm coming". Every number is a
 * bare `tel:` anchor (works offline, one tap), labelled by kind, and every
 * one came from data — the file never names a digit string. With nothing
 * verified the primary is the destination alone: never a fabricated number.
 */
export interface Tile {
  key: string;
  label: string;
  icon: string;
}

export interface EmergencySheetProps {
  primary: EmergencySheetContact | null;
  secondaries: EmergencySheetContact[];
  /** Unverified rows, non-production only — rendered under the Unsigned watermark. */
  drafts: EmergencySheetContact[];
  /** "What's happening?" tiles (entered from the pill); null skips them (from the catalog, or pre-alert off). */
  tiles: Tile[] | null;
  /** Where "Tell a hospital I'm coming" goes; null when FEATURE_PRE_ALERT is off. */
  tellHref: string | null;
  submissionId: string | null;
}

const TILE_ICON: Record<string, LucideIcon> = {
  lungs: WindIcon,
  heart: HeartIcon,
  brain: BrainIcon,
  thermometer: ThermometerIcon,
  bandage: BandageIcon,
  child: BabyIcon,
  gauge: GaugeIcon,
  eye: EyeIcon,
  throat: MicIcon,
  droplet: DropletIcon,
  bone: BoneIcon,
  hand: HandIcon,
  mind: BrainIcon,
  belly: CircleDotIcon,
};

const TELL_CLASS = cn(
  // PRD §8.2: white fill, red text and border. The `alert` variant carries
  // the red pair; the fill is pinned to the card white.
  buttonVariants({ variant: "alert", size: "lg" }),
  "bg-card border-status-critical-fg min-h-14 w-full rounded-xl",
);

export function EmergencySheet({
  primary,
  secondaries,
  drafts,
  tiles,
  tellHref,
  submissionId,
}: EmergencySheetProps) {
  return (
    <section aria-labelledby="emergency-heading" className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <h1
          id="emergency-heading"
          className="font-display text-foreground text-heading-l font-medium tracking-[-0.015em]"
        >
          Get help now
        </h1>
        <p className="text-foreground text-body-m">
          If the person is not breathing or can&rsquo;t be woken, call now.
        </p>
      </header>

      {primary ? (
        <CallLink
          href={telHref(primary.number)}
          contactId={primary.id}
          className={cn(
            buttonVariants({ variant: "emergency", size: "lg" }),
            "min-h-16 w-full flex-col gap-0.5 rounded-xl py-3 whitespace-normal",
          )}
        >
          <span className="text-body-l inline-flex items-center gap-2">
            <PhoneIcon aria-hidden className="size-5" />
            Call {KIND_LABEL[primary.kind]}
          </span>
          <span className="text-body-s font-normal opacity-90">
            <span className="tabular font-mono">{primary.number}</span> · {primary.label}
          </span>
        </CallLink>
      ) : (
        <div
          role="status"
          className="bg-status-critical-bg text-status-critical-fg flex items-start gap-3 rounded-xl p-4"
        >
          <Building2Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
          <div className="flex flex-col gap-1">
            <p className="text-body-l font-medium">Go to the nearest emergency unit</p>
            <p className="text-body-s">
              No verified emergency number is available here yet. They see the sickest people first.
            </p>
          </div>
        </div>
      )}

      {secondaries.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label="Other numbers">
          {secondaries.map((c) => (
            <li key={c.id}>
              <CallLink
                href={telHref(c.number)}
                contactId={c.id}
                className={cn(
                  buttonVariants({ variant: "secondary", size: "lg" }),
                  "min-h-12 w-full justify-between rounded-xl whitespace-normal",
                )}
              >
                <span className="inline-flex items-center gap-2 text-left">
                  <PhoneIcon aria-hidden className="size-4" />
                  {KIND_LABEL[c.kind]}
                  <span className="text-muted-foreground text-body-s font-normal">{c.label}</span>
                </span>
                <span className="tabular font-mono">{c.number}</span>
              </CallLink>
            </li>
          ))}
        </ul>
      ) : null}

      {drafts.length > 0 ? <DraftStrip contacts={drafts} /> : null}

      {tellHref ? (
        tiles ? (
          <form action="/emergency/tell" method="get" className="flex flex-col gap-3">
            {submissionId ? <input type="hidden" name="submission" value={submissionId} /> : null}
            <fieldset className="flex flex-col gap-2">
              <legend className="text-foreground text-body-m font-medium">
                What&rsquo;s happening?{" "}
                <span className="text-muted-foreground font-normal">(optional — tap any)</span>
              </legend>
              <ul className="grid grid-cols-2 gap-2">
                {tiles.map((tile) => {
                  const Icon = TILE_ICON[tile.icon] ?? CircleAlertIcon;
                  return (
                    <li key={tile.key}>
                      <label
                        className={cn(
                          "border-border bg-card text-foreground flex min-h-14 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 select-none",
                          "has-checked:bg-foreground has-checked:text-background has-checked:border-foreground",
                          "has-focus-visible:shadow-focus",
                        )}
                      >
                        <input type="checkbox" name="items" value={tile.key} className="sr-only" />
                        <Icon aria-hidden className="size-5 shrink-0" strokeWidth={1.75} />
                        <span className="text-body-s leading-snug">{tile.label}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
            <button type="submit" className={TELL_CLASS}>
              Tell a hospital I&rsquo;m coming
            </button>
          </form>
        ) : (
          <Link href={tellHref} className={TELL_CLASS}>
            Tell a hospital I&rsquo;m coming
          </Link>
        )
      ) : null}
    </section>
  );
}

/** Gate CS: unverified numbers show in non-production only, and say so. */
function DraftStrip({ contacts }: { contacts: EmergencySheetContact[] }) {
  return (
    <section
      aria-label="Unsigned clinical content"
      className="border-border flex flex-col gap-2 rounded-xl border border-dashed p-3"
    >
      <p className="text-muted-foreground text-caption font-mono tracking-[0.16em] uppercase">
        Unsigned clinical content — not yet verified
      </p>
      <ul className="flex flex-col gap-1">
        {contacts.map((c) => (
          <li key={c.id}>
            <CallLink
              href={telHref(c.number)}
              contactId={c.id}
              className={cn(
                buttonVariants({ variant: "ghost", size: "md" }),
                "w-full justify-between whitespace-normal",
              )}
            >
              <span className="text-left">
                {KIND_LABEL[c.kind]} · {c.label}
              </span>
              <span className="tabular font-mono">{c.number}</span>
            </CallLink>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** PRD §5.6 — the two draft first-aid cards, behind FEATURE_FIRST_AID_CARDS, watermarked. */
export const FIRST_AID_CARDS: readonly string[] = [
  "Press firmly on bleeding with a clean cloth",
  "Note the time the weakness started",
];

export function FirstAidCards() {
  return (
    <section
      aria-label="First aid — unsigned clinical content"
      className="border-border flex flex-col gap-2 rounded-xl border border-dashed p-3"
    >
      <p className="text-muted-foreground text-caption font-mono tracking-[0.16em] uppercase">
        Unsigned clinical content — first aid
      </p>
      <ul className="flex flex-col gap-2">
        {FIRST_AID_CARDS.map((card) => (
          <li key={card} className="bg-card text-foreground text-body-m rounded-lg p-3 shadow-xs">
            {card}
          </li>
        ))}
      </ul>
    </section>
  );
}
