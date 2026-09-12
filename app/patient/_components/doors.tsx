import Link from "next/link";

/**
 * ⚠ RATIFIED PATIENT-FACING COPY — ADR 0084 §1 and §2. ⚠
 *
 * The words below are the decision, not an illustration of it. Do not
 * paraphrase them, do not translate them into another register, do not add a
 * number to either door. They live in one component because they appear on
 * `/patient` and on the primary-hospital card in `/patient/hospitals`, and a
 * second hand-written copy is how ratified clinical copy drifts.
 *
 * Every phrase has a reason under §2:
 *
 *   - **"Coming to the hospital today"** names the act — travelling there and
 *     waiting. "Join today's queue" named a data structure. It is deliberately
 *     **not first person**: 76.1% of women in one Ugandan cohort owned a phone
 *     while 92.7% had access to one, so "I am coming" tapped by a daughter on
 *     her father's logged-in account declares the daughter.
 *   - **"You will be seen in turn. We cannot tell you the hour."** replaces an
 *     English antithesis ("it is a place, not a time") that did not survive a
 *     relative paraphrasing it aloud. At Mulago the line genuinely re-orders by
 *     acuity, so any hint of a time promise is worse here than in the products
 *     the idea was borrowed from.
 *   - **"Ask for a day — the clinic confirms."** Booking is approval-required
 *     unless the clinician auto-confirms, so this door's real output is
 *     frequently a request rather than a day. Not "come back": a first-time
 *     patient cannot come back.
 *   - **"Choose from the days the clinic has open."** Names real availability,
 *     never the 14-day horizon (§8) — the horizon is a rule, not a promise.
 *   - **No count on either door.** The queue is department-scoped, so there is
 *     no hospital-wide line to be twelfth in, and no slot scarcity is ever
 *     shown (§6, §12).
 *
 * Two structural rules, both load-bearing:
 *
 *   1. **Asymmetry is layout, not assertion.** The same-day door is full width
 *      and first in source order on every surface; the booking door is a
 *      quieter block beneath it. A door declared primary while the layout puts
 *      it last on a phone is not primary (§1).
 *   2. **No icons.** Action icons are documented as misread, and both doors
 *      used to carry the same calendar glyph for two different acts. §1
 *      settles it: a distinct subordinate icon or none, and the label carries
 *      the meaning.
 *
 * A `<nav>` rather than a heading + list: it is two links to two routes, it
 * renders at three different nesting depths (a page column, a hospital card),
 * and a heading would be wrong at one of them wherever it was right at
 * another. The landmark gives a screen-reader user the same jump target at
 * every depth without constraining the surrounding heading order.
 */
export function PatientDoors() {
  return (
    <nav aria-label="How to be seen" className="flex flex-col gap-2">
      <Link
        href="/patient/queue"
        className="bg-card tap ring-brand-300 flex flex-col gap-1.5 rounded-xl p-5 ring-1 md:hover:brightness-[0.98] dark:md:hover:brightness-110"
      >
        <span className="text-foreground text-heading-s">Coming to the hospital today</span>
        <span className="text-muted-foreground text-body-s leading-relaxed">
          We save your place in line. You will be seen in turn. We cannot tell you the hour.
        </span>
      </Link>

      {/* No card, no ring, no fill: the secondary door is demoted by having
          less of everything, which is the one demotion that survives being
          rendered on a white page and inside a tinted hospital card. `px-5`
          lines its text up with the primary door's. The label takes the link
          colour so a plain block of text still reads as tappable — the house
          idiom, and the ADR's own word for what this door becomes (§11). */}
      <Link href="/patient/book" className="group tap flex flex-col gap-0.5 rounded-xl px-5 py-4">
        <span className="text-primary text-body-m font-medium underline-offset-4 md:group-hover:underline">
          Ask for a day — the clinic confirms
        </span>
        <span className="text-muted-foreground text-body-s">
          Choose from the days the clinic has open.
        </span>
      </Link>
    </nav>
  );
}
