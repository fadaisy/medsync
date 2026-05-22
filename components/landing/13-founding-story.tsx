import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * §13 — Founding story.
 *
 * Two cofounders, two clinical encounters that gave MedSync its mandate.
 * Each FounderBlock is a portrait + a verbatim story written by that
 * founder, with a closing pull-quote that sets out their specific belief.
 *
 * Add more founders by appending to the FOUNDERS array. Layout repeats
 * deliberately so the page reads as one voice, not two competing bios.
 *
 * Photos live in /public/founder-<slug>.jpg. Same scale-[1.2] origin-top
 * crop applied to handle studio-vignette edges on the source JPGs.
 */

interface Founder {
  slug: string;
  name: string;
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
  return (
    <section
      id="founding-story"
      aria-labelledby="founding-story-headline"
      className="border-border bg-background relative w-full border-y"
    >
      <div className="mx-auto w-full max-w-300 px-5 py-20 sm:px-8 sm:py-28">
        {/* Section header */}
        <header className="mb-14 flex flex-col gap-5 sm:mb-20">
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
            warnings nobody had ever opened. These are the stories we wrote on the way home.
          </p>
        </header>

        {/* Founder blocks */}
        <ol role="list" className="flex flex-col">
          {FOUNDERS.map((founder, i) => (
            <li key={founder.slug}>
              {i > 0 ? <div aria-hidden className="border-border my-14 border-t sm:my-20" /> : null}
              <FounderBlock founder={founder} />
            </li>
          ))}
        </ol>

        <p className="text-muted-foreground mt-14 text-center text-[12.5px] italic sm:mt-20">
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
