import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "사진 고르기 | 개인·단체 베스트 사진 정리",
  description: "아이 설정과 사진 업로드부터 개인·단체 베스트 추천, 아이별·단체 정리, 실제 사진 저장까지 이어지는 보육 사진 도구.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
