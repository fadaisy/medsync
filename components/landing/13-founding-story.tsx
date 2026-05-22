import { cn } from "@/lib/utils";

/**
 * §13 — Founding story.
 *
 * Quiet credibility anchor. No stock photo, no founder portrait we don't
 * have. A typographic block in Fraunces that names the founder, the role,
 * and the two gaps MedSync exists to close. Attribution matches the §03
 * floating quote so the page reads as one voice end-to-end.
 *
 * Per GATE A decision: Usama Fadhul, Founder + Clinical Safety Officer.
 */

export function FoundingStory() {
  return (
    <section
      id="founding-story"
      aria-labelledby="founding-story-headline"
      className="border-border bg-background relative w-full border-y"
    >
      <div className="mx-auto w-full max-w-300 px-5 py-20 sm:px-8 sm:py-28">
        <div className="grid gap-10 md:grid-cols-12 md:gap-16">
          {/* Left — section label + signature block */}
          <aside className="flex flex-col gap-6 md:col-span-4">
            <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
              <span className="size-1 rounded-full bg-teal-500" />
              Why MedSync exists
            </span>

            {/* Avatar abstraction: an initial-monogram tile rather than a
                stock portrait. Honest about not having a marketing photo. */}
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className={cn(
                  "font-display flex size-14 items-center justify-center rounded-xl",
                  "bg-teal-50 text-teal-800 dark:bg-teal-50/15 dark:text-teal-200",
                  "text-[20px] font-medium",
                )}
              >
                UF
              </span>
              <div className="flex flex-col">
                <span className="font-display text-foreground text-[16px] font-medium">
                  Usama Fadhul
                </span>
                <span className="text-muted-foreground text-[12px]">
                  Founder &amp; Clinical Safety Officer
                </span>
              </div>
            </div>

            <p className="text-muted-foreground text-[12.5px] italic">
              Built with the MedSync founding team in Kampala, Uganda.
            </p>
          </aside>

          {/* Right — narrative */}
          <div className="flex flex-col gap-5 md:col-span-8">
            <h2
              id="founding-story-headline"
              className="font-display text-foreground max-w-[24ch] text-[34px] leading-[1.08] tracking-[-0.025em] text-balance sm:text-[48px]"
              style={{ fontWeight: 400 }}
            >
              We kept hitting the same{" "}
              <span className="text-teal-700 italic dark:text-teal-300">two gaps</span>.
            </h2>

            <div className="text-foreground/85 flex flex-col gap-4 text-[15.5px] leading-[1.65] sm:text-[16.5px]">
              <p>
                MedSync started in Mulago&rsquo;s wards. Specifically: the moment a patient walked
                out, and the moment the next clinician walked in. Two doors, both with the same
                problem &mdash; the record didn&rsquo;t come through them.
              </p>
              <p>
                On the way out, a patient with a five-day antibiotic course stopped after two good
                days, and nobody found out. On the way in, a Cardiology consult asked the patient
                what Diabetology had said, because the chart hadn&rsquo;t made it across the
                corridor yet.
              </p>
              <p>
                We had spreadsheets to paper over both. WhatsApp groups, paper notebooks in
                white-coat pockets, an Excel tab for appointment reminders. They were everywhere and
                they were lying to us; they were almost always out of date.
              </p>
              <p>
                MedSync is the answer we wished existed: one record that doesn&rsquo;t care which
                door you came through &mdash; the hospital gate, the home, the clinic, the pharmacy,
                the phone number on file. One adaptive object model, one audit log, one truth.
              </p>
              <p className="text-muted-foreground italic">
                Built quietly. Shipped honestly. No fake testimonials, no fake logos, no badges we
                haven&rsquo;t earned. The page you are reading is the receipt.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
