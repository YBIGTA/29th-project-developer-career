"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  {
    href: "/m",
    label: "홈",
    icon: (
      <svg viewBox="0 0 16 16" width="19" height="19" aria-hidden="true">
        <path
          d="M2.5 7.4 8 2.8l5.5 4.6V13a.6.6 0 0 1-.6.6H9.6V9.8H6.4v3.8H3.1a.6.6 0 0 1-.6-.6V7.4Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    href: "/m#gapmap",
    label: "지도",
    icon: (
      <svg viewBox="0 0 16 16" width="19" height="19" aria-hidden="true">
        <circle cx="5.4" cy="10.4" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="10.8" cy="5.6" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M6.6 9.4 9.6 6.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/m/dictionary",
    label: "사전",
    icon: (
      <svg viewBox="0 0 16 16" width="19" height="19" aria-hidden="true">
        <circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="m10.5 10.5 3 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
];

/** 화면 하단 고정 탭바. 엄지 반경 안에서 홈/지도/사전을 오갈 수 있게 한다. */
export default function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav className="mv-tabbar" aria-label="주요 이동">
      {TABS.map((tab) => {
        const basePath = tab.href.split("#")[0];
        const active = pathname === basePath;
        return (
          <Link key={tab.href} href={tab.href} className="mv-tabbar__item" data-active={active}>
            {tab.icon}
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
