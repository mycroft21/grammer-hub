import type { Metadata } from "next";
import { AppProviders } from "@/components/providers/AppProviders";
import { Shell } from "@/components/Shell";
import "./globals.css";

export const metadata: Metadata = { title: "Grammar Hub", description: "상황 프로필에 맞춘 어투·문법 교정" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <AppProviders>
          <Shell>{children}</Shell>
        </AppProviders>
      </body>
    </html>
  );
}
