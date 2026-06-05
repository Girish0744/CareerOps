import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Career-Ops",
  description: "Personal job application command center",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#f8fafc]" suppressHydrationWarning>
        <Nav />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
