import type { Metadata, Viewport } from "next";
import { DM_Sans, Fraunces, Fredoka } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
});

const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-fredoka",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#D6EEFF",
};

export const metadata: Metadata = {
  title: "SpeakEasy",
  description:
    "Handle hard conversations better. Build self-awareness, emotional regulation, and empathic accuracy.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SpeakEasy",
  },
  openGraph: {
    title: "SpeakEasy",
    description:
      "Handle hard conversations better. Build self-awareness, emotional regulation, and empathic accuracy.",
    type: "website",
  },
  // `apple` intentionally omitted — Next.js picks up `app/apple-icon.tsx`
  // and serves a PNG, which iOS requires (it ignores SVG apple-touch-icons).
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${dmSans.variable} ${fraunces.variable} ${fredoka.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
