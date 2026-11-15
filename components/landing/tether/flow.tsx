import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { ICON } from "@/components/tide/kit";
import { AUTH } from "@/content/tether-landing/copy";
import { LINKS } from "@/content/tether-landing/links";
import { cn } from "@/lib/utils";
import { AuthPage, FOCUS } from "./auth";
import { TetherShell } from "./landing";

/**
 * Sign-up and its "awaiting approval" pages on the Tether domain (ADR 0510): the Tether bar, Help and footer
 * around the hospital app's own forms, which `data-ds="tide"` redraws in Tide (globals.css re-pins the tokens).
 */
/** `back` adds the link to the four ways to join (the sign-up forms; not the pages after them). */
export function TetherFlow({ children, back }: { children: ReactNode; back?: boolean }) {
  return (
    <TetherShell>
      <div data-ds="tide" className="contents">
        <AuthPage wide>
          {back ? (
            <Link
              href={LINKS.signIn}
              className={cn(
                "text-pw-ink-2 hover:text-pw-ink group -mt-6 mb-6 inline-flex items-center gap-1.5 rounded-full text-[15px] leading-5 font-medium max-[760px]:-mt-2",
                FOCUS,
              )}
            >
              <ArrowLeftIcon
                className="ease-expo-out size-4 transition-transform duration-250 group-hover:-translate-x-0.5 motion-reduce:transition-none"
                {...ICON}
              />
              {AUTH.otherDoors}
            </Link>
          ) : null}
          {children}
        </AuthPage>
      </div>
    </TetherShell>
  );
}
