import { SectionStub } from "./_section-stub";

/**
 * §10b — Patient enrichment card. The richest single card on the page.
 * Fictional patient: Amina N., 54, Type 2 Diabetes + Hypertension.
 */
export function PatientCard() {
  return (
    <SectionStub
      n={10}
      name="Patient enrichment card (Amina N.)"
      intent="Rich patient card mirroring Attio's enrichment card: header (name + dx + primary doctor) + auto-summary + care team avatars + Upcoming row + Recent activity feed."
      runtime="server"
      buildAt="GATE D"
      todo={[
        "Header: Amina N., 54, Type 2 Diabetes + Hypertension, primary Dr. Okello",
        "Auto-Summary block (worsening glucose, adherence, new symptom, urgent review suggested)",
        "Care team avatar row (doctor + nephrologist + nurse + pharmacist)",
        "Upcoming: Tele-follow-up today 14:20",
        "Recent activity feed (4 entries with timestamps)",
        '"Illustrative" affordance',
      ]}
    />
  );
}
