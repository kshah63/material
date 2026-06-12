import type { Metadata } from "next";
import { Montserrat, Nunito_Sans, DM_Mono } from "next/font/google";
import "./globals.css";

// Montserrat echoes the geometric MathVision wordmark; Nunito keeps the body
// warm and friendly; DM Mono for labels/figures.
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  display: "swap",
});

const nunito = Nunito_Sans({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
  display: "swap",
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "MathVision Materials",
  description: "Course materials for MathVision — notes, worksheets, and more.",
  icons: {
    icon: [{ url: "/mathvision-icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/mathvision-icon.svg" }],
  },
};

export const viewport = {
  themeColor: "#F15A29",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${montserrat.variable} ${nunito.variable} ${dmMono.variable}`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
