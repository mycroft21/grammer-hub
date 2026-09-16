import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Grammar Hub", description: "상황 프로필에 맞춘 어투·문법 교정" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
