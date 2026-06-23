import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { DisclaimerBanner } from "@/components/Disclaimer";

export const metadata: Metadata = {
  title: "World Cup Streak Value Finder",
  description:
    "FIFA World Cup-only betting research. Estimated probability, value and streak suitability per market. Research, not financial advice.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <DisclaimerBanner />
        <Nav />
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
