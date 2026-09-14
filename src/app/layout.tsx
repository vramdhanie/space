import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  metadataBase: new URL("https://space.vincentramdhanie.com"),
  title: "Space — Vincent Ramdhanie",
  description:
    "Vincent Ramdhanie's weekly space digest — the latest mission news, findings, and images from NASA, ESA, JAXA, and other space agencies, sorted by agency and mission.",
  authors: [{ name: "Vincent Ramdhanie", url: "https://vincentramdhanie.com" }],
  creator: "Vincent Ramdhanie",
  openGraph: {
    type: "website",
    url: "https://space.vincentramdhanie.com/",
    siteName: "Space",
    title: "Space — Vincent Ramdhanie",
    description:
      "A weekly digest of mission news and images from the world's space agencies, sorted by agency and mission.",
  },
  twitter: {
    card: "summary",
    title: "Space — Vincent Ramdhanie",
    description:
      "A weekly digest of mission news and images from the world's space agencies, sorted by agency and mission.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
