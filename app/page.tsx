import {
  AdaptiveModel,
  AnnouncementBar,
  ClinicianHomeMock,
  CtaBandMid,
  Ecosystem,
  Enrichment,
  Faq,
  FinalCta,
  FloatingQuote,
  Footer,
  FoundingStory,
  Hero,
  Nav,
  PatientCard,
  PlatformShowcase,
  SubBanner,
  TrustGovernance,
  TrustStrip,
  UgandaCapabilities,
  Vision,
  Voices,
} from "@/components/landing";

/**
 * Landing page composition — mirrors Attio.com's section order, repurposed
 * for MedSync. 17 components, in the gate order from the landing-page spec.
 *
 * Each component is a stub at GATE A; real content + visual treatment lands
 * per-component at GATEs B–E. This page just composes them.
 */
export default function HomePage() {
  return (
    <div className="bg-background flex min-h-svh flex-col">
      <AnnouncementBar />
      <Nav />
      <main className="flex-1">
        <FloatingQuote />
        <SubBanner />
        <Hero />
        <ClinicianHomeMock />
        <TrustStrip />

        <PlatformShowcase />
        <CtaBandMid />

        <AdaptiveModel />
        <Voices />

        <Enrichment />
        <PatientCard />
        <Ecosystem />

        <UgandaCapabilities />
        <TrustGovernance />

        <FoundingStory />
        <Vision />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
