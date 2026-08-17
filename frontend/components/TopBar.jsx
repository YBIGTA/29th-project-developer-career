import Link from "next/link";

/**
 * 두 페이지(메인 / 기술 사전)가 함께 쓰는 상단바.
 * solid=false면 배경이 투명해 히어로 위에 겹쳐 보인다.
 */
export default function TopBar({ links, solid = true, searchActive = false }) {
  return (
    <nav className="topbar" data-solid={solid}>
      <Link className="topbar__brand" href="/">
        <span className="topbar__brand-mark" />
        DevCompass
      </Link>

      <div className="topbar__nav">
        <div className="topbar__links">
          {links.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
        </div>

        {/* 아이콘만 두면 무엇으로 가는 버튼인지 알 수 없어 사전 페이지가
            묻힌다. 이름을 함께 적는다. 좁은 화면에서는 CSS가 글자를 숨겨
            원래의 원형 아이콘 버튼으로 되돌린다. */}
        <Link
          className="topbar__search"
          href="/dictionary"
          data-active={searchActive}
          aria-current={searchActive ? "page" : undefined}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" width="15" height="15">
            <circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="m10.5 10.5 3 3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <span className="topbar__search-text">기술 사전</span>
        </Link>
      </div>
    </nav>
  );
}
