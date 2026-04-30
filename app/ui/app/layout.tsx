import type React from "react";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "아이디어스 CS 에이전트 PoC",
  description: "핸드메이드 마켓플레이스 CS — 환불 안내 + 선물 추천 단일 에이전트",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
