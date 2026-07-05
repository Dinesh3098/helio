import type { Metadata } from "next";

export const metadata: Metadata = { title: "Help Center" };

/** Public pages — deliberately outside the authenticated dashboard shell. */
export default function HelpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="bg-background min-h-svh">{children}</div>;
}
