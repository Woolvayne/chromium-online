import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WebPilot AI — Dein KI-Browser-Agent",
  description:
    "Integrierter Chromium-Browser mit KI-Agent: Recherchieren, Zusammenfassen und Aufgaben im Web erledigen — mit Mistral, OpenAI, Qwen oder kompatiblen APIs.",
};

export const viewport: Viewport = {
  themeColor: "#06060b",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body className="bg-abyss text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
