import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pure EQ",
  description:
    "Handle hard conversations better. Build self-awareness, emotional regulation, and empathic accuracy.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
