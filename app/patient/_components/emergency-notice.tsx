import { AlertTriangleIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * ⚠ PROVISIONAL — PENDING CLINICAL SAFETY OFFICER SIGN-OFF. ⚠
 *
 * The red-flag symptoms named above both doors (ADR 0084 §3). This list is
 * clinical content, governed exactly like a drug dose: it is **CSO-authored
 * and CSO-signed, not engineer-authored**. What is written here came from the
 * ADR, which states plainly that it gives "the shape and the register, not the
 * ratified content". Nothing has been added to it, reworded, reordered or
 * "improved" since.
 *
 * It lives in one exported constant so the review that ratifies it is a single
 * edit in a single place. If you are that reviewer: replace the array, leave
 * the component alone.
 *
 * Two properties of this list are load-bearing and survive any revision:
 *   1. Each entry NAMES a symptom in plain words a frightened relative can
 *      recognise. The patient is never asked to rate their own urgency — every
 *      accuracy figure in the corpus (47.3–62.4%, kappa 0.166 / 0.07) measures
 *      exactly that instrument, and the one platform that did well "asked
 *      clinical questions rather than asking the patient to rate urgency".
 *   2. Nothing branches on an entry. The list is read, never evaluated: no
 *      checklist, no checkbox, no input, no score. An instruction that makes no
 *      decision cannot under-triage anyone, which is what keeps this block a
 *      static notice rather than a red-flag engine.
 */
export const EMERGENCY_SYMPTOMS: readonly string[] = [
  "chest pain or pressure",
  "trouble breathing",
  "weakness on one side",
  "a fit",
  "bleeding that will not stop",
  "a child who will not wake",
];

export interface EmergencyNoticeProps {
  /**
   * The hospital this notice is scoped to, when there is one. It names the
   * landmark and tells a screen-reader user whose emergency line the number
   * belongs to. It is never substituted into the body copy — "the hospital's
   * emergency entrance" is the ratified wording, with a name or without one.
   *
   * **Optional, because the patient with no primary hospital is the patient
   * who most needs this block**: no doors, no visits, nothing else on the
   * screen to act on, and — if this were gated on a hospital — no emergency
   * instruction either. With no name the landmark is just "Emergency"; no
   * surface ever renders a dangling "Emergency — ".
   */
  hospitalName?: string | null;
  /**
   * `hospitals.emergency_phone` — nullable, no default, populated per hospital
   * during activation (ADR 0084 §3). Pass it straight through; the value is
   * displayed exactly as the hospital verified it and only the `tel:` href is
   * normalised.
   *
   * **Until a number is verified for a given hospital, pass nothing.** The
   * block then shows the destination alone, which is the correct failure: an
   * invented, guessed or hardcoded number here would be the most dangerous
   * fabricated datum in the product.
   */
  emergencyPhone?: string | null;
  /** Layout only — margins and width from the page that owns the column. */
  className?: string;
}

/**
 * The emergency block: named symptoms, one destination, one number, no
 * question (ADR 0084 §3). It sits above both doors, first thing on the screen,
 * on `/patient`, `/patient/hospitals` and the head of each door page — a
 * patient mid-stroke may be on the booking page.
 *
 * What it deliberately is not:
 *
 *   - **Not a question.** No heading asks "Very unwell right now?" — that is
 *     the self-rating instrument the evidence indicts. The symptoms are named
 *     and the patient recognises one, or does not.
 *   - **Not a router.** It takes no input, holds no state, writes nothing,
 *     branches nowhere, and files nothing. One unconditional statement, named
 *     examples, one destination.
 *   - **Not red.** Red on a MedSync surface means a clinician has declared a
 *     life threat. A permanent red band on a patient's home screen trains the
 *     patient to discount red exactly where red must keep meaning something,
 *     so this is an amber ring on a plain card and the words carry the weight.
 *   - **Not a promise about the emergency department.** "They see the sickest
 *     people first" stands; "no one waits in line" is deleted and must not
 *     reappear — MedSync holds no data about that queue, and a daughter who
 *     takes her father there on the app's word, finds thirty people waiting,
 *     and concludes the app lied will take him home.
 *
 * A Server Component with no client JavaScript at all: three pages with three
 * different scopes render it, so it fetches nothing and takes what it shows as
 * props. The `tel:` link is a bare anchor for the same reason the ADR chose a
 * phone number over a form — one tap, works in a feature-phone browser, costs
 * no data.
 *
 * It renders with a hospital name or without one. Unaffiliated is not a
 * lesser case to be gated out: it is the least-set-up patient, on the screen
 * with the least on it, and the instruction is unconditional by design.
 */
export function EmergencyNotice({ hospitalName, emergencyPhone, className }: EmergencyNoticeProps) {
  // Rendered verbatim, never reformatted — the hospital verified this string.
  // A value with no digit in it is not a number anyone can ring, so it shows
  // nothing rather than a dead link.
  // ponytail: digit-presence is the whole check. Format validation belongs at
  // activation, where a human verifies the number, not on the read path.
  const phone = emergencyPhone?.trim();
  const dialable = phone && /\d/.test(phone) ? phone : null;

  return (
    <aside
      aria-label={hospitalName ? `Emergency — ${hospitalName}` : "Emergency"}
      className={cn(
        "bg-card ring-status-caution-fg/40 flex items-start gap-3 rounded-xl p-4 shadow-xs ring-1",
        className,
      )}
    >
      <span
        aria-hidden
        className="bg-status-caution-bg text-status-caution-fg grid size-9 shrink-0 place-items-center rounded-full"
      >
        <AlertTriangleIcon className="size-4" strokeWidth={1.5} />
      </span>

      <div className="flex min-w-0 flex-col gap-2">
        {/* ADR 0084 §2 and §3. The words are the decision. Do not paraphrase,
            do not translate into another register, do not add a promise. */}
        <p className="text-foreground text-body-m font-medium">
          If you are very sick now, do not use this page. Go to the hospital&rsquo;s emergency
          entrance. They see the sickest people first.
        </p>

        {/* Not muted: the symptom names are the payload of this block, and a
            man with forty minutes of crushing chest pain has to be able to
            read them. */}
        <p className="text-foreground text-body-s leading-relaxed">
          Very sick means things like: {EMERGENCY_SYMPTOMS.join(" · ")}.
        </p>

        {dialable ? (
          <a
            href={`tel:${dialable.replace(/[^\d+]/g, "")}`}
            className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "mt-1 w-fit")}
          >
            Call <span className="tabular font-mono">{dialable}</span>
            {hospitalName ? <span className="sr-only">, {hospitalName}</span> : null}
          </a>
        ) : null}
      </div>
    </aside>
  );
}
