# ADR 0511: Sign-up headings say Tether on the Tether domain

**Status:** Accepted, 15 Nov 2026. Fadhul, in chat, as CSO: "Yes, say Tether."

## Context

ADR 0510 put the sign-up forms in the Tether look on the Tether domain but left their wording, which names MedSync.

## Decision

On the domains in `TETHER_HOSTS` (`onTetherHost`, passed to each form as `tether`), from `TETHER_SIGNUP` in `content/onboarding.ts`:

- Patient: "Create your Tether account".
- Clinical staff: "Join your hospital on Tether", and its link "My hospital isn't on Tether".
- Hospital: "Apply to bring your hospital onto Tether".

## Consequences

- The data-processing consent ("I agree to MedSync's data-processing notice") and "MedSync support" still name MedSync: MedSync is who holds the data and answers.
- MedSync's domain is unchanged.
