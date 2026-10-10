import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const siteUrl = "https://stacknova.in";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "StackNova Technologies — We Build Technology That Moves Businesses Forward",
    template: "%s | StackNova Technologies",
  },
  description:
    "StackNova Technologies is a technology startup delivering modern, scalable, business-focused digital solutions — web development, software engineering, UI/UX, cloud technologies and product modernization.",
  keywords: [
    "StackNova Technologies",
    "web development",
    "software engineering",
    "UI UX design",
    "cloud technologies",
    "product modernization",
    "India technology company",
  ],
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "StackNova Technologies",
    title: "StackNova Technologies — We Build Technology That Moves Businesses Forward",
    description:
      "From idea to scalable digital product — modern engineering, thoughtful design and business thinking.",
    images: [{ url: "/logo.png", width: 480, height: 160, alt: "StackNova Technologies logo" }],
  },
  twitter: {
    card: "summary",
    title: "StackNova Technologies",
    description:
      "We build technology that moves businesses forward. Web, software, cloud and product engineering.",
    images: [{ url: "/logo.png", alt: "StackNova Technologies logo" }],
  },
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png", sizes: "180x180" }],
    apple: [{ url: "/favicon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#070B14",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={manrope.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
