import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  BuildingIcon,
  IdCardIcon,
  StethoscopeIcon,
  UserRoundIcon,
} from "lucide-react";

import { ICON } from "@/components/tide/kit";
import { GET_STARTED } from "@/content/auth";
import { AUTH, FOOTER, NAV } from "@/content/tether-landing/copy";
import { cn } from "@/lib/utils";
import { HelpLink } from "./chrome";

/**
 * The Tether sign-in and authenticator-code pages (ADR 0498): the landing page's pill bar and Help, the page
 * heading, and the "New to Tether?" panel with the four ways to join. The forms themselves are the hospital app's
 * (app/(auth)/sign-in), drawn in this look; nothing about signing in changes.
 */

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pw-focus";

/** The text fields and labels on these pages: 52 px pills with the focus ring of the landing page's inputs. */
export const TETHER_INPUT =
  "h-[52px] w-full min-w-0 rounded-full bg-pw-surface px-5 text-[17px] text-pw-ink ring-[1.5px] ring-inset ring-pw-line-strong placeholder:text-pw-ink-4 focus:ring-2 focus:ring-pw-focus focus:outline-none aria-invalid:ring-2 aria-invalid:ring-pw-ink";
/** A bare input for the Tether look, which draws its own field (the Chroma Input brings its own edge and halo). */
export function PlainInput(props: ComponentProps<"input">) {
  return <input {...props} />;
}

export const TETHER_LABEL = "text-[15px] leading-5 font-semibold text-pw-ink";

export function AuthPage({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="px-5 pt-3">
        <div className="mx-auto flex max-w-[1080px] items-center gap-2.5">
          <div className="bg-pw-surface/90 border-pw-line flex min-w-0 flex-1 items-center rounded-full border py-2 pr-2 pl-[22px]">
            <Link
              href="/"
              aria-label={AUTH.home}
              className={cn(
                "text-pw-ink inline-flex min-h-11 items-center text-[22px] font-bold tracking-[-0.03em]",
                FOCUS,
              )}
            >
              {NAV.brand}
            </Link>
          </div>
          <div className="flex-none">
            <HelpLink />
          </div>
        </div>
      </header>
      <main
        className={cn(
          "mx-auto w-full flex-1 px-5 pt-12 pb-16 max-[760px]:pt-8",
          wide ? "max-w-[1180px]" : "max-w-[480px]",
        )}
      >
        {children}
      </main>
      <footer className="text-pw-ink-3 px-5 pt-6 pb-8 text-center text-[13px] leading-5">
        {FOOTER.copyrightPhone}
      </footer>
    </div>
  );
}

/** The heading block above a form: title, then a lead line or a notice. */
export function AuthHead({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[34px] leading-[1.1] font-medium tracking-[-0.03em] text-balance">
          {title}
        </h1>
        {lead ? <div className="text-pw-ink-2 mt-2 text-base leading-6">{lead}</div> : null}
      </div>
      {children}
    </div>
  );
}

const DOOR_ICONS = [UserRoundIcon, StethoscopeIcon, IdCardIcon, BuildingIcon];

/** The four ways to join: GET_STARTED's doors, each a tile to its sign-up form. */
export function JoinPanel() {
  const doors = GET_STARTED.groups.flatMap((g) => g.doors);
  return (
    <section
      aria-labelledby="join-h"
      className="bg-pw-surface-2 rounded-[32px] p-8 max-[560px]:px-4 max-[560px]:py-6"
    >
      <h2 id="join-h" className="text-[26px] leading-[1.15] font-medium tracking-[-0.025em]">
        {AUTH.join.title}
      </h2>
      <p className="text-pw-ink-2 mt-2 max-w-[46ch] text-base leading-6">{AUTH.join.sub}</p>
      <ul
        aria-label={AUTH.join.label}
        className="mt-6 grid grid-cols-2 gap-3 max-[560px]:grid-cols-1"
      >
        {doors.map((d, i) => {
          const Icon = DOOR_ICONS[i] ?? UserRoundIcon;
          return (
            <li key={d.href}>
              <Link
                href={d.href}
                className={cn(
                  "group bg-pw-surface border-pw-line flex h-full flex-col items-start gap-2.5 rounded-3xl border p-5",
                  "hover:border-pw-accent-text hover:ring-pw-accent-tint ease-expo-out transition-[border-color,box-shadow] duration-250 hover:ring-4 motion-reduce:transition-none",
                  FOCUS,
                )}
              >
                <span className="bg-pw-accent-tint text-pw-accent-text grid size-11 place-items-center rounded-[14px]">
                  <Icon className="size-[22px]" {...ICON} />
                </span>
                <span className="text-[17px] leading-[22px] font-semibold">{d.title}</span>
                <span className="text-pw-ink-2 text-sm leading-5">{d.description}</span>
                <span className="text-pw-ink-3 text-[13px] leading-[19px]">
                  {GET_STARTED.needLabel} {d.need}
                </span>
                <span className="text-pw-accent-text mt-auto inline-flex items-center gap-1.5 pt-1 text-[13px] leading-[18px] font-semibold">
                  {d.next}
                  <ArrowRightIcon
                    className="ease-expo-out size-3.5 transition-transform duration-250 group-hover:translate-x-1 motion-reduce:transition-none"
                    {...ICON}
                  />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
