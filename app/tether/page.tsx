import { TetherLanding, tetherMetadata } from "@/components/landing/tether/landing";

/** The Tether landing page in the hospital app, served at `/` while LANDING_TETHER is on (ADR 0477). */
export const metadata = tetherMetadata;
export const revalidate = 3600;
export default TetherLanding;
