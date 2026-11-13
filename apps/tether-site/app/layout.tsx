import type { ReactNode } from "react";
import { Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { ThemeProvider } from "next-themes";

import { TetherShell } from "@/components/landing/tether/landing";

import "./globals.css";

/** Geist Mono for the ticket's code; Figtree comes with the shell. */
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-medsync-mono", display: "swap" });

/** The site's own address (TETHER_SITE_URL), for canonical links and sharing cards. */
export const metadata = {
  metadataBase: new URL(process.env.TETHER_SITE_URL ?? "http://localhost:3010"),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={mono.variable} suppressHydrationWarning>
      <body className="m-0">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          storageKey="medsync-theme"
        >
          <TetherShell>{children}</TetherShell>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
