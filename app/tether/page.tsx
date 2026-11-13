import type { Metadata } from "next";

import { Chrome } from "@/components/landing/tether/chrome";
import {
  COMING,
  DUO,
  FOOTER,
  META,
  MODES_SECTION,
  QUESTIONS_SECTION,
  STEPS,
} from "@/content/tether-landing/copy";
import { preAlertLive } from "@/lib/emergency/feature";

/**
 * The Tether landing page (ADR 0477), served at `/` while LANDING_TETHER is on. Step 2 is the shell: the chrome,
 * and each section's anchor and heading. Steps 3 to 6 fill the sections from content/tether-landing.
 */
export const metadata: Metadata = {
  title: { absolute: META.title },
  description: META.description,
  alternates: { canonical: "/" },
  openGraph: { title: META.title, description: META.description, url: "/" },
  twitter: { card: "summary_large_image", title: META.title, description: META.description },
};

/** Until a step fills it, a section is its heading and a screen of room, so the shell scrolls like the page. */
const SECTIONS = [
  { id: undefined, title: undefined },
  { id: "how", title: STEPS.kicker },
  { id: "modes", title: MODES_SECTION.kicker },
  { id: "who", title: DUO.kicker },
  { id: undefined, title: COMING.kicker },
  { id: "questions", title: QUESTIONS_SECTION.kicker },
] as const;

export default function TetherLandingPage() {
  return (
    <div id="top">
      <Chrome preAlert={preAlertLive()} />
      <main>
        {SECTIONS.map((s, i) => (
          <section
            key={i}
            id={s.id}
            className="mx-auto min-h-[80svh] max-w-[1080px] scroll-mt-24 px-5 pt-16 max-[760px]:scroll-mt-[72px]"
          >
            {s.title ? (
              <h2 className="text-[40px] leading-[44px] font-medium tracking-[-0.035em]">
                {s.title}
              </h2>
            ) : null}
          </section>
        ))}
      </main>
      <footer id="join" className="mx-auto max-w-[1080px] scroll-mt-24 px-5 pt-16 pb-10">
        <p className="text-[40px] leading-[44px] font-medium tracking-[-0.035em]">
          {FOOTER.closing}
        </p>
        <p className="text-pw-ink-3 mt-16 text-[13px] leading-5">
          <span className="max-[760px]:hidden">
            {FOOTER.copyright} · {FOOTER.legal}
          </span>
          <span className="min-[761px]:hidden">{FOOTER.copyrightPhone}</span>
        </p>
      </footer>
    </div>
  );
}
