import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { AppProviders } from "@/providers/app-providers";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: { default: "Helio", template: "%s · Helio" },
  description: "AI-powered customer communication platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn("font-sans", geist.variable)}
      suppressHydrationWarning
    >
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
