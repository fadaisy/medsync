"use client";

import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * §13 — Founding story.
 *
 * Single section, tabbed switcher between cofounders. Each founder gets
 * the full portrait + story + pull-quote layout but only one shows at a
 * time — clicking the tab cross-fades to the other.
 *
 * Why tabs over a horizontal carousel: each story is 4–5 paragraphs, so
 * a swipe-through would fight vertical scrolling. Tabs let the reader
 * pick a founder, then read uninterrupted in normal page flow.
 *
 * Both founder blocks are grid-stacked (col-start-1 row-start-1) so the
 * container sizes to the longer story and there are no layout jumps on
 * swap. Inactive block carries aria-hidden so screen readers don't read
 * both at once. Keyboard arrows cycle between tabs.
 *
 * Add more cofounders by appending to FOUNDERS — tabs + cross-fade pick
 * up automatically.
 */

interface Founder {
  slug: string;
  name: string;
  shortName: string;
  title: string;
  portraitSrc: string;
  portraitAlt: string;
  headlineLead: string;
  headlineEnd: string;
  story: React.ReactNode;
  pullQuote: string;
}

const FOUNDERS: Founder[] = [
  {
    slug: "usama-fadhul",
    name: "Dr. Usama Fadhul",
    shortName: "Usama",
    title: "Co-founder & Clinical Safety Officer, MedSync",
    portraitSrc: "/founder-usama-fadhul.jpg",
    portraitAlt:
      "Dr. Usama Fadhul, MedSync co-founder and Clinical Safety Officer, in a white coat with a stethoscope.",
    headlineLead: "A patient's notebook held two months of warnings.",
    headlineEnd: "Nobody saw them.",
    story: (
      <>
        <p>
          The idea for MedSync came to me during my first week on the wards as a fifth-year medical
          student. I was clerking an elderly woman, an amputee with long-standing diabetes and
          hypertension. Her left leg had already been amputated below the knee, and now her
          symptoms, signs, and investigations all pointed to peripheral artery disease in her
          remaining limb. As I reviewed her management plan, I saw what was coming: amputation of
          the right leg, alongside efforts to finally control her blood sugar.
        </p>
        <p>
          What struck me most was her notebook. In it, she had faithfully recorded her pre-breakfast
          and pre-supper blood sugar readings for two months. Every single one was above{" "}
          <span className="tabular font-mono">11 mmol/L</span>. She had been doing everything asked
          of her, yet no one had been alerted to act on those numbers.
        </p>
        <p>
          I couldn&rsquo;t stop thinking that if something had flagged those readings in time, this
          second amputation might never have made it onto her treatment plan. Perhaps she would
          simply be coming in for a routine quarterly review to check her HbA1c. Instead, she was
          also losing her vision, and her kidney function was failing.
        </p>
        <p>
          These are preventable complications of diabetes. With proper follow-up, they can be caught
          early, but once they take hold, they change a person&rsquo;s life forever.
        </p>
      </>
    ),
    pullQuote:
      "MedSync exists so that no patient's data sits silent in a notebook while their health quietly slips away.",
  },
  {
    slug: "nelson-nuwagira",
    name: "Dr. Nelson Nuwagira",
    shortName: "Nelson",
    title: "Co-founder, MedSync",
    portraitSrc: "/founder-nelson-nuwagira.jpg",
    portraitAlt: "Dr. Nelson Nuwagira, MedSync co-founder, portrait.",
    headlineLead: "Four years of blind refills.",
    headlineEnd: "A lifetime of paralysis.",
    story: (
      <>
        <p>
          The true cost of fragmented care hit me during my medical internship. I was on duty when a
          51-year-old widow from a remote village in Luuka was rushed to our emergency ward. She
          arrived completely paralyzed on one side, the victim of a massive PCA hemorrhagic stroke.
        </p>
        <p>
          What broke my heart was the digital blood pressure monitor her family brought along
          &mdash; a device gifted by good Samaritans that she had used faithfully. For over four
          years, she had religiously swallowed her oral amlodipine every single day without fail.
          Yet, because her home was so isolated, her contact with the healthcare system had been
          reduced to far and in-between clinic visits just to get drug refills.
        </p>
        <p>
          Over those four years, she had received no actual clinical consultations. No one had ever
          reviewed the skyrocketing readings quietly stored in that machine&rsquo;s electronic
          memory, no one had personalized her care, and no one had truly engaged her in her own
          management plan.
        </p>
        <p>
          This tragedy was entirely preventable. It was not a failure of patient compliance, but a
          profound failure of healthcare connectivity. Today, she is permanently disabled, unable to
          do anything for herself or provide for the four helpless children who depend entirely on
          her.
        </p>
        <p>
          We built MedSync to bridge these devastating gaps. Chronic disease management cannot
          survive on blind data and detached guidelines; it demands real-time patient engagement and
          responsive, personalized treatment.
        </p>
      </>
    ),
    pullQuote:
      "The future of global chronic disease management isn't just digital — it is entirely synchronized.",
  },
];

export function FoundingStory() {
  const [active, setActive] = useState(0);

  // Arrow-key navigation across the tablist (WAI-ARIA tabs pattern).
  function onTabKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setActive((p) => (p + 1) % FOUNDERS.length);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setActive((p) => (p - 1 + FOUNDERS.length) % FOUNDERS.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(FOUNDERS.length - 1);
    }
  }

  return (
    <section
      id="founding-story"
      aria-labelledby="founding-story-headline"
      className="border-border bg-background relative w-full border-y"
    >
      <div className="mx-auto w-full max-w-300 px-5 py-20 sm:px-8 sm:py-28">
        {/* Section header */}
        <header className="mb-10 flex flex-col gap-5">
          <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
            <span className="size-1 rounded-full bg-teal-500" />
            Why MedSync exists
          </span>
          <h2
            id="founding-story-headline"
            className="font-display text-foreground max-w-[26ch] text-[34px] leading-[1.08] tracking-[-0.025em] text-balance sm:text-[48px]"
            style={{ fontWeight: 400 }}
          >
            Two cofounders.{" "}
            <span className="text-teal-700 italic dark:text-teal-300">Two patients</span> we
            couldn&rsquo;t unsee.
          </h2>
          <p className="text-muted-foreground max-w-[60ch] text-[15px] leading-[1.55] sm:text-[16.5px]">
            MedSync didn&rsquo;t start in a deck. It started in two ward encounters &mdash; one with
            a notebook full of warnings nobody had read, one with a digital BP monitor full of
            warnings nobody had ever opened.
          </p>
        </header>

        {/* Tab strip */}
        <div
          role="tablist"
          aria-label="Switch cofounder story"
          onKeyDown={onTabKeyDown}
          className="border-border mb-8 flex flex-wrap gap-1 border-b sm:gap-2"
        >
          {FOUNDERS.map((founder, i) => {
            const isActive = active === i;
            return (
              <button
                key={founder.slug}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`founder-panel-${founder.slug}`}
                id={`founder-tab-${founder.slug}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActive(i)}
                className={cn(
                  "group relative flex items-center gap-3 px-3 py-3 text-left",
                  "transition-colors duration-150",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground/80",
                )}
              >
                {/* Active underline — animated via translate/scale */}
                <span
                  aria-hidden
                  className={cn(
                    "absolute bottom-[-1px] left-0 h-[2px] bg-teal-500",
                    "transition-all duration-300 ease-out",
                    isActive ? "right-0 opacity-100" : "right-full opacity-0",
                  )}
                />
                <span
                  className={cn(
                    "tabular inline-flex size-6 items-center justify-center rounded-full font-mono text-[10px]",
                    "transition-colors duration-200",
                    isActive
                      ? "bg-teal-100 text-teal-800 dark:bg-teal-50/15 dark:text-teal-200"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  0{i + 1}
                </span>
                <span className="flex flex-col">
                  <span className="font-display text-[14px] leading-tight font-medium">
                    {founder.name}
                  </span>
                  <span className="text-muted-foreground hidden text-[11.5px] leading-tight sm:inline">
                    {founder.title.split(",")[0]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Stacked founder panels — only active one is visible (opacity)
            but both stay in the grid so the parent sizes to the longer
            story. Inactive panel gets aria-hidden + pointer-events-none. */}
        <div className="grid">
          {FOUNDERS.map((founder, i) => {
            const isActive = active === i;
            return (
              <div
                key={founder.slug}
                role="tabpanel"
                id={`founder-panel-${founder.slug}`}
                aria-labelledby={`founder-tab-${founder.slug}`}
                aria-hidden={!isActive}
                className={cn(
                  "col-start-1 row-start-1",
                  "transition-[opacity,transform] duration-500",
                  "[transition-timing-function:cubic-bezier(0.4,0,0.2,1)]",
                  "motion-reduce:transition-none",
                  isActive
                    ? "translate-y-0 opacity-100"
                    : "pointer-events-none translate-y-1 opacity-0",
                )}
              >
                <FounderBlock founder={founder} />
              </div>
            );
          })}
        </div>

        <p className="text-muted-foreground mt-14 text-center text-[12.5px] italic sm:mt-16">
          Built with the MedSync founding team in Kampala, Uganda.
        </p>
      </div>
    </section>
  );
}

function FounderBlock({ founder }: { founder: Founder }) {
  return (
    <article className="grid gap-10 md:grid-cols-12 md:gap-12 lg:gap-16">
      {/* Portrait + signature */}
      <aside className="flex flex-col gap-4 md:col-span-4">
        <figure className="flex flex-col gap-4">
          <div className="relative aspect-[3/4] w-full max-w-xs overflow-hidden rounded-xl">
            <Image
              src={founder.portraitSrc}
              alt={founder.portraitAlt}
              fill
              sizes="(min-width: 1024px) 320px, (min-width: 768px) 30vw, 80vw"
              className="origin-top scale-[1.2] object-cover"
              priority={false}
            />
          </div>
          <figcaption className="flex flex-col gap-0.5">
            <span className="font-display text-foreground text-[17px] font-medium">
              {founder.name}
            </span>
            <span className="text-muted-foreground text-[12.5px]">{founder.title}</span>
          </figcaption>
        </figure>
      </aside>

      {/* Story */}
      <div className="flex flex-col gap-5 md:col-span-8">
        <h3
          className="font-display text-foreground max-w-[28ch] text-[30px] leading-[1.08] tracking-[-0.025em] text-balance sm:text-[42px]"
          style={{ fontWeight: 400 }}
        >
          {founder.headlineLead}{" "}
          <span className="text-teal-700 italic dark:text-teal-300">{founder.headlineEnd}</span>
        </h3>

        <div className="text-foreground/85 flex flex-col gap-4 text-[15.5px] leading-[1.65] sm:text-[16.5px]">
          {founder.story}
          <p
            className={cn(
              "border-l-2 border-teal-500/70 pl-4 italic",
              "text-foreground text-[16.5px] leading-[1.55] sm:text-[18px]",
            )}
          >
            {founder.pullQuote}
          </p>
        </div>
      </div>
    </article>
  );
}
