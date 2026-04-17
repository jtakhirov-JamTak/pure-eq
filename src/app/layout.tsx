import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#18181b",
};

export const metadata: Metadata = {
  title: "Pure EQ",
  description:
    "Handle hard conversations better. Build self-awareness, emotional regulation, and empathic accuracy.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Pure EQ",
  },
  openGraph: {
    title: "Pure EQ",
    description:
      "Handle hard conversations better. Build self-awareness, emotional regulation, and empathic accuracy.",
    type: "website",
  },
  icons: {
    apple: "/icon-192.svg",
  },
};

// Applied before React hydrates so the easy-mode sky gradient paints
// on first render instead of flashing default white then switching.
const themeBootstrap = `(function(){try{var t=localStorage.getItem("pure_eq_theme");if(t==="easy")document.documentElement.classList.add("easy-mode");}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
