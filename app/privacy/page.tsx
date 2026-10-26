import { legalMetadata, LegalPage } from "@/components/legal/legal-page";
import { PRIVACY } from "@/content/legal";
import { legalConfig } from "@/lib/legal";

export const metadata = legalMetadata(PRIVACY, "/privacy", legalConfig.privacyPublished);

export default function PrivacyPage() {
  return <LegalPage doc={PRIVACY} published={legalConfig.privacyPublished} />;
}
