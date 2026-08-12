import Compass from "@/components/Compass";

export default function Hero({ techCount }) {
  return (
    <header className="hero">
      <div className="hero__inner">
        <div className="hero__copy">
          <div className="hero__eyebrow">
            <span className="hero__eyebrow-dot" />
            기술 스택 수요조사
          </div>

          <h1 className="hero__wordmark">DevCompass</h1>

          <div className="hero__rule">
            <span className="hero__rule-marker" />
          </div>

          <p className="hero__tagline">
            <strong>개발자 커리어 나침반</strong>
            <span className="hero__tagline-dash"> — </span>
            채용 시장 <span className="hero__tagline-x">×</span> 개발 생태계 데이터를 결합한 기술
            스택 수요조사 서비스
          </p>

          <div className="hero__actions">
            <a className="hero__cta" href="#quadrants">
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
            <dl className="hero__facts">
              <div>
                <dt>수집 채용공고</dt>
                <dd>5,781건</dd>
              </div>
              <div>
                <dt>추적 기술</dt>
                <dd>{techCount ? `${techCount}개` : "—"}</dd>
              </div>
              <div>
                <dt>기준 시점</dt>
                <dd>2026.07</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="hero__visual">
          <Compass />
        </div>
      </div>
    </header>
  );
}
