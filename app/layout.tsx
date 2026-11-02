import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Montserrat } from "next/font/google";
import "./globals.css";
import SmoothScroll from "@/components/SmoothScroll";
import { company } from "@/lib/content";
import Providers from "./providers";

// Self-hosted at build time (works with the static export): no render-blocking third-party CSS.
// Montserrat matches the geometric wordmark in the AAM logo.
const sans = Montserrat({ subsets: ["latin"], variable: "--font-montserrat", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: `${company.name} — ${company.tagline}`,
  description:
    "HVAC, exhaust and outside air, EMS controls, maintenance and architectural sheet metal for Bay Area builders since 1994 — shown system by system in a 3D building model. An SBE & MBE company, headquartered in South San Francisco.",
  // Concept draft: reachable by link, kept out of search results until AAM approves it.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#04070D",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The inline script tags <html> before paint; suppressHydrationWarning covers that class.
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
        {/* Scroll reveals start hidden; without JS they never run, so show them. */}
        <noscript>
          <style>{`[data-reveal]{opacity:1!important;transform:none!important}`}</style>
        </noscript>
      </head>
      <body>
        <Providers>
          <SmoothScroll />
          {children}
        </Providers>
      </body>
    </html>
  );
}
