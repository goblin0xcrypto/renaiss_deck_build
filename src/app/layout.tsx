import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Renaiss Deck Build — Deck Construction Simulator",
  description:
    "Build, test and analyze your decks: search cards, manage your collection, track deck value, and buy missing cards in one click.",
};

const NAV = [
  { href: "/", label: "Search" },
  { href: "/collection", label: "Collection" },
  { href: "/decks", label: "Decks" },
  { href: "/analytics", label: "Analytics" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-40 border-b border-edge bg-background/85 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="font-mono text-sm font-semibold tracking-[0.25em] text-accent">
                RENAISS
              </span>
              <span className="text-xs uppercase tracking-widest text-muted">
                Deck Build
              </span>
            </Link>
            <nav className="ml-auto flex items-center gap-1 text-sm">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="rounded-md px-3 py-1.5 text-muted transition-colors hover:bg-elevated hover:text-ink"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
        <footer className="border-t border-edge py-6 text-center text-xs text-muted">
          Renaiss Deck Build · Card data &amp; images from OPTCG API
          (optcgapi.com) · Prices by Renaiss OS Index (index.renaissos.com) ·
          Shop OS checkout is simulated
        </footer>
      </body>
    </html>
  );
}
