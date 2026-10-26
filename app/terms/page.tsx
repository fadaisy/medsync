import { legalMetadata, LegalPage } from "@/components/legal/legal-page";
import { TERMS } from "@/content/legal";
import { legalConfig } from "@/lib/legal";

export const metadata = legalMetadata(TERMS, "/terms", legalConfig.termsPublished);

export default function TermsPage() {
  return <LegalPage doc={TERMS} published={legalConfig.termsPublished} />;
}
