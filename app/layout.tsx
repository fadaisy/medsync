import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "MedSync — Digital Hospital OS",
    template: "%s · MedSync",
  },
  description:
    "Digital hospital operating system for Uganda. Built to run Mulago-scale national referral hospitals.",
  applicationName: "MedSync",
  authors: [{ name: "Usama Fadhul" }],
  category: "health",
  keywords: ["hospital", "EHR", "Uganda", "Mulago", "clinical", "MedSync"],
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="bg-background text-foreground flex min-h-full flex-col font-sans">
        {children}
      </body>
    </html>
  );
}
