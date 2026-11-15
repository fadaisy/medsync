import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Figtree } from "next/font/google";

import { META } from "@/content/tether-landing/copy";
import { preAlertLive } from "@/lib/emergency/feature";
import { renderedAt } from "@/lib/landing/example-visit";
import { Chrome } from "./chrome";
import { Coming } from "./coming";
import { Duo } from "./duo";
import { Footer } from "./footer";
import { Hero } from "./hero";
import { Modes } from "./modes";
import { Questions } from "./questions";
import { Statement } from "./statement";
import { Steps } from "./steps";

/**
 * The Tether landing page (ADR 0477), shared by the hospital app's /tether and the standalone site
 * (apps/tether-site). Every string comes from content/tether-landing; every example says so (ADR 0479).
 */
export const tetherMetadata: Metadata = {
  title: { absolute: META.title },
  description: META.description,
  alternates: { canonical: "/" },
  openGraph: { title: META.title, description: META.description, url: "/" },
  twitter: { card: "summary_large_image", title: META.title, description: META.description },
};

/** The example visit is six days ahead of the server's clock at first paint (D-LP-08); pages revalidate hourly. */
export function TetherLanding() {
  const preAlert = preAlertLive();
  const now = renderedAt();
  return (
    <div id="top">
      <Chrome preAlert={preAlert} />
      <main>
        <Hero preAlert={preAlert} now={now} />
        <Statement />
        <Steps />
        <Modes now={now} />
        <Duo now={now} />
        <Coming />
        <Questions preAlert={preAlert} />
      </main>
      <Footer />
    </div>
  );
}

/** Figtree, Latin and Latin Extended-A (D-LP-15). The `--font-patient-web` variable is the one `font-pw` reads. */
const figtree = Figtree({
  subsets: ["latin", "latin-ext"],
  variable: "--font-patient-web",
  display: "swap",
});

/**
 * `data-pw` turns on the Tide tokens (light and Tide Navy) whatever TIDE_SURFACES says (D-LP-13). The page is
 * white in light and the Tide ground in dark, as the canvas draws it.
 */
export function TetherShell({ children }: { children: ReactNode }) {
  return (
    <div
      data-pw
      data-tether
      className={`${figtree.variable} bg-pw-surface dark:bg-pw-bg text-pw-ink font-pw min-h-svh text-[17px] leading-[25px] antialiased max-[760px]:pb-[calc(100px+env(safe-area-inset-bottom))]`}
    >
      {children}
    </div>
  );
}
