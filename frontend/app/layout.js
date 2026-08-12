import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata = {
  title: "DevCompass | 개발자 커리어 나침반",
  description:
    "채용 시장 × 개발 생태계 데이터를 결합한 기술 스택 수요조사 서비스",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        {/* 한글 본문용 Pretendard. next/font/google은 한글 서브셋을 내려주지 못해서
            CDN으로 붙인다. 로드에 실패해도 globals.css의 --font-sans 폴백
            (Apple SD Gothic Neo / 맑은 고딕)으로 자연스럽게 대체된다. */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
