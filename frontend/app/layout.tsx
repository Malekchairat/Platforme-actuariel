import type { Metadata } from "next";
import { Inter, DM_Mono } from "next/font/google";
import { AppShell } from "@/components/layout/app-shell";
import { CompanyBootstrap } from "@/components/layout/company-bootstrap";
import { ThemeProvider } from "@/components/layout/theme-provider";
import "./globals.css";

/* ── Inter: geometric sans — headlines bold, body regular ── */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

/* ── DM Mono: clean monospace for KPI values & data ── */
const dmMono = DM_Mono({
  subsets: ["latin"],
  variable: "--font-dm-mono",
  display: "swap",
  weight: ["300", "400", "500"],
});

export const metadata: Metadata = {
  title: "Solva — BH Assurance",
  description: "Plateforme d'intelligence actuarielle pour BH Assurance",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`h-full antialiased ${inter.variable} ${dmMono.variable}`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <ThemeProvider>
          <CompanyBootstrap />
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
