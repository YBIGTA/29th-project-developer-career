import Link from "next/link";

/**
 * 두 페이지(지도 / 기술 사전)가 함께 쓰는 상단바.
 *
 * 예전에는 페이지마다 링크 구성이 달랐다(메인은 앵커 두 개 + 사전 버튼, 사전은
 * 돌아가기 링크). 어디에 있는지, 갈 수 있는 곳이 어디인지가 화면마다 달라
 * 읽히지 않았다. 이제 목적지가 둘뿐이므로 알약 토글 하나로 합친다 — 지금 있는
 * 칸에 표시가 얹혀 있고, 누르면 그쪽으로 간다.
 */
export default function TopBar({ active = "map" }) {
  return (
    <nav className="topbar" data-solid="true">
      <Link className="topbar__brand" href="/">
        DevCompass
      </Link>

      {/* 표시(thumb)는 별도 요소다. 배경을 활성 항목에 직접 칠하면 페이지를
          오갈 때 그냥 켜졌다 꺼지지만, 따로 두면 CSS가 좌우로 미끄러뜨린다. */}
      <div className="topbar__toggle" data-active={active}>
        <span className="topbar__toggle-thumb" aria-hidden="true" />
        <Link
          className="topbar__toggle-item"
          href="/"
          aria-current={active === "map" ? "page" : undefined}
        >
          지도
        </Link>
        <Link
          className="topbar__toggle-item"
          href="/dictionary"
          aria-current={active === "dictionary" ? "page" : undefined}
        >
          기술 사전
        </Link>
      </div>
    </nav>
  );
}
