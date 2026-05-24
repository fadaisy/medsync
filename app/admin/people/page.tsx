import type { Metadata } from "next";

import { PlaceholderPanel } from "../_components/placeholder-panel";

export const metadata: Metadata = {
  title: "People · Superadmin · MedSync",
  robots: { index: false, follow: false },
};

export default function PeoplePage() {
  return (
    <PlaceholderPanel
      gate="D"
      eyebrow="Area 3 · People &amp; access"
      title="People &amp; access"
      tag="MVP"
      intro="Manage users and the who-can-do-what across tenants. Every action operates on operational fields only — never decrypted PHI. The most powerful actions (create a superadmin, scope a hospital admin) are four-eyes-aware from day one."
      mvpBullets={[
        "Search / list users across tenants with their affiliations and lifecycle state.",
        "Suspend a compromised account (soft; recoverable within the window).",
        "Reset a user's MFA enrolment (Supabase Auth admin API).",
        "Deactivate a leaver (soft; sets users.state = deactivated, recoverable for 30 days).",
        "View a user's affiliation / role / state history.",
        "Create &amp; scope a hospital admin — four-eyes-aware, maximum audit visibility.",
        "Create another superadmin — single most powerful action; maximum friction + four-eyes (auto-satisfies until a 2nd real superadmin exists).",
      ]}
      deferredBullets={[
        "Editing PHI-bearing columns. None of this surface touches decrypted patient data — only operational fields. Break-glass (GATE F) is the only path that can ever surface PHI.",
      ]}
    />
  );
}
