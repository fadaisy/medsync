import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * §13 — Founding story.
 *
 * Anchor of the page. Uses Usama Fadhul's actual portrait + the
 * verbatim founding story he wrote (the diabetic amputee patient whose
 * notebook held two months of >11 mmol/L readings nobody acted on).
 * Photo lives at /public/founder-usama-fadhul.jpg.
 */

export function FoundingStory() {
  return (
    <section
      id="founding-story"
      aria-labelledby="founding-story-headline"
      className="border-border bg-background relative w-full border-y"
    >
      <div className="mx-auto w-full max-w-300 px-5 py-20 sm:px-8 sm:py-28">
        <div className="grid gap-10 md:grid-cols-12 md:gap-12 lg:gap-16">
          {/* Left — portrait + signature */}
          <aside className="flex flex-col gap-5 md:col-span-4">
            <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
              <span className="size-1 rounded-full bg-teal-500" />
              Why MedSync exists
            </span>

            <figure className="flex flex-col gap-4">
              {/* Portrait. 3:4 portrait crop; muted background blends into
                  the section. Uses next/image for AVIF/WebP optimisation
                  and responsive srcset. */}
              <div
                className={cn(
                  "border-border bg-muted/40 relative aspect-[3/4] w-full overflow-hidden rounded-xl border",
                  "max-w-xs",
                )}
              >
                <Image
                  src="/founder-usama-fadhul.jpg"
                  alt="Dr. Usama Fadhul, MedSync founder and Clinical Safety Officer, in a white coat with a stethoscope."
                  fill
                  sizes="(min-width: 1024px) 320px, (min-width: 768px) 30vw, 80vw"
                  className="object-cover"
                  priority={false}
                />
              </div>

              <figcaption className="flex flex-col gap-0.5">
                <span className="font-display text-foreground text-[17px] font-medium">
                  Dr. Usama Fadhul
                </span>
                <span className="text-muted-foreground text-[12.5px]">
                  Founder &amp; Clinical Safety Officer, MedSync
                </span>
              </figcaption>
            </figure>

            <p className="text-muted-foreground text-[12px] italic">
              Built with the MedSync founding team in Kampala, Uganda.
            </p>
          </aside>

          {/* Right — story */}
          <div className="flex flex-col gap-5 md:col-span-8">
            <h2
              id="founding-story-headline"
              className="font-display text-foreground max-w-[28ch] text-[34px] leading-[1.08] tracking-[-0.025em] text-balance sm:text-[48px]"
              style={{ fontWeight: 400 }}
            >
              A patient&rsquo;s notebook held two months of warnings.{" "}
              <span className="text-teal-700 italic dark:text-teal-300">Nobody saw them.</span>
            </h2>

            <div className="text-foreground/85 flex flex-col gap-4 text-[15.5px] leading-[1.65] sm:text-[16.5px]">
              <p>
                The idea for MedSync came to me during my first week on the wards as a fifth-year
                medical student. I was clerking an elderly woman, an amputee with long-standing
                diabetes and hypertension. Her left leg had already been amputated below the knee,
                and now her symptoms, signs, and investigations all pointed to peripheral artery
                disease in her remaining limb. As I reviewed her management plan, I saw what was
                coming: amputation of the right leg, alongside efforts to finally control her blood
                sugar.
              </p>
              <p>
                What struck me most was her notebook. In it, she had faithfully recorded her
                pre-breakfast and pre-supper blood sugar readings for two months. Every single one
                was above <span className="tabular font-mono">11 mmol/L</span>. She had been doing
                everything asked of her, yet no one had been alerted to act on those numbers.
              </p>
              <p>
                I couldn&rsquo;t stop thinking that if something had flagged those readings in time,
                this second amputation might never have made it onto her treatment plan. Perhaps she
                would simply be coming in for a routine quarterly review to check her HbA1c.
                Instead, she was also losing her vision, and her kidney function was failing.
              </p>
              <p>
                These are preventable complications of diabetes. With proper follow-up, they can be
                caught early, but once they take hold, they change a person&rsquo;s life forever.
              </p>
              <p
                className={cn(
                  "border-l-2 border-teal-500/70 pl-4 italic",
                  "text-foreground text-[16.5px] leading-[1.55] sm:text-[18px]",
                )}
              >
                MedSync exists so that no patient&rsquo;s data sits silent in a notebook while their
                health quietly slips away.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
