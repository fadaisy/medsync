import type { IconName } from "@/components/tide/icon";
import type { AppointmentReason } from "@/lib/booking";

/**
 * Book's "Planned care" door (board "C · Two doors first", owner 19 Oct 2026):
 * every Appendix A reason in the patient's words, grouped, with the line
 * shown under the chosen one. No condition is singled out: "Check on a
 * condition I have" names diabetes beside asthma, HIV, epilepsy and the rest.
 * `new_concern` is not here: it is the other door, "Something is wrong",
 * which goes through the symptom checker first.
 */
export interface PlannedReason {
  reason: AppointmentReason;
  label: string;
  hint: string;
  icon: IconName;
}

export const PLANNED_GROUPS: readonly { title: string; reasons: readonly PlannedReason[] }[] = [
  {
    title: "Your health",
    reasons: [
      {
        reason: "follow_up",
        label: "Check on a condition I have",
        hint: "Diabetes, blood pressure, asthma, HIV, epilepsy, heart or kidney: any condition a clinic follows.",
        icon: "replay",
      },
      {
        reason: "routine",
        label: "Check-up or screening",
        hint: "When nothing is wrong: blood pressure, sugar, eyes, cancer screening.",
        icon: "check",
      },
      {
        reason: "refill",
        label: "Refill my medicines",
        hint: "More of a medicine, or a review of it.",
        icon: "pill",
      },
      {
        reason: "test_results",
        label: "A test or my results",
        hint: "A lab test only, or to go through results with the clinic.",
        icon: "flask",
      },
    ],
  },
  {
    title: "Pregnancy and children",
    reasons: [
      {
        reason: "antenatal",
        label: "Pregnancy check",
        hint: "Antenatal visits while you are pregnant.",
        icon: "heart",
      },
      {
        reason: "immunisation",
        label: "My child's vaccines",
        hint: "A vaccine on the schedule.",
        icon: "shield",
      },
      {
        reason: "child_wellness",
        label: "My child's growth check",
        hint: "Weight, growth and development.",
        icon: "trend",
      },
    ],
  },
  {
    title: "After care",
    reasons: [
      {
        reason: "post_discharge",
        label: "After a hospital stay",
        hint: "A review after you were admitted.",
        icon: "building",
      },
      {
        reason: "specialist_review",
        label: "I was referred",
        hint: "A doctor sent you to a specialist clinic.",
        icon: "send",
      },
      {
        reason: "procedure",
        label: "A procedure or dressing",
        hint: "A planned procedure, or a wound dressing.",
        icon: "plus",
      },
    ],
  },
  {
    title: "Support",
    reasons: [
      {
        reason: "counselling",
        label: "Talk to someone",
        hint: "Counselling or support.",
        icon: "message",
      },
      {
        reason: "second_opinion",
        label: "A second opinion",
        hint: "Another clinician's view.",
        icon: "eye",
      },
    ],
  },
];
