import Link from "next/link";

/** 모바일 상단바 — 브랜드만 노출한다. 내비게이션은 하단 탭바가 담당한다. */
export default function MobileTopBar() {
  return (
    <div className="mv-topbar">
      <Link className="mv-topbar__brand" href="/m">
        <span className="mv-topbar__brand-mark" />
        DevCompass
      </Link>
    </div>
  );
}
