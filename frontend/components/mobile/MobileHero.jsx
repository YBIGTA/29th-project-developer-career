import Compass from "@/components/Compass";
import { formatPeriod } from "@/lib/ecosystem";

export default function MobileHero({ techCount, meta }) {
  return (
    <header className="mv-hero">
      <div className="mv-hero__eyebrow">
        <span className="mv-hero__eyebrow-dot" />
        기술 스택 수요조사
      </div>

      <h1 className="mv-hero__wordmark">DevCompass</h1>

      <div className="mv-hero__visual">
        <Compass />
      </div>

      <p className="mv-hero__tagline">
        <strong>개발자 커리어 나침반</strong>
        채용 시장 <span className="mv-hero__tagline-x">×</span> 개발 생태계 데이터를 결합한 기술
        스택 수요조사 서비스
      </p>

      <a className="mv-hero__cta" href="#quadrants">
        지도 열기
        <svg viewBox="0 0 16 16" aria-hidden="true" width="15" height="15">
          <path
            d="M8 2.6v10.8M3.4 8.8 8 13.4l4.6-4.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </a>

      <dl className="mv-hero__facts">
        <div className="mv-hero__fact">
          <dt>수집 채용공고</dt>
          <dd>{meta?.totalPostings ? `${meta.totalPostings.toLocaleString("ko-KR")}건` : "—"}</dd>
        </div>
        <div className="mv-hero__fact">
          <dt>추적 기술</dt>
          <dd>{techCount ? `${techCount}개` : "—"}</dd>
        </div>
        <div className="mv-hero__fact">
          <dt>기준 기간</dt>
          <dd>{formatPeriod(meta)}</dd>
        </div>
      </dl>
    </header>
  );
}
