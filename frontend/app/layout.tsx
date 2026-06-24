import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { CompanyBootstrap } from "@/components/layout/company-bootstrap";
import "./globals.css";

export const metadata: Metadata = {
  title: "Copilot Actuariel",
  description: "Plateforme d'intelligence financière pour compagnies d'assurance",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">
        <CompanyBootstrap />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
