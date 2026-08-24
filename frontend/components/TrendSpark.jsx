"use client";

import { formatCount } from "@/lib/ecosystem";

const SPARK_W = 100;
const SPARK_H = 44;
const SPARK_PAD = 5;

/**
 * 최근 8개월 생태계 활동 추이.
 *
 * 그리는 값은 원시 건수가 아니라 점유율 지수다(lib/techExtras.js 참고).
 * 원시값을 쓰면 8개월간 GitHub 전체가 +162%, Stack Overflow 전체가 -69%
 * 움직인 탓에, 개별 기술과 무관하게 GitHub는 거의 다 상승, SO는 거의 다
 * 하락으로 나온다.
 *
 * viewBox를 preserveAspectRatio="none"으로 늘려 쓰므로 선에는
 * vector-effect="non-scaling-stroke"를 준다. 같은 이유로 마지막 값 표시는
 * 원이 아니라 세로 선이다 — 원은 가로로 늘어나 찌그러진다.
 *
 * prefix는 클래스 이름 앞머리다. 데스크톱 상세 패널과 모바일 바텀시트가
 * 같은 그림을 서로 다른 자리에 그리는데, 두 화면의 CSS가 각자의 파일에
 * 스코프돼 있어(globals.css / mobile.css) 클래스를 공유할 수 없다. 마크업만
 * 한 벌로 두고 이름만 갈아 끼운다.
 */
export default function TrendSpark({ trend, prefix = "detail-panel" }) {
  const { months, index, github, stackoverflow, hasStackoverflow, delta } = trend;

  // 기준선 100이 항상 판 안에 들어오게 범위를 잡는다. 그래야 "100 위 = 시장
  // 평균보다 빨리 큰다"가 눈으로 읽힌다.
  const lo = Math.min(...index, 100);
  const hi = Math.max(...index, 100);
  const span = hi - lo;
  const yOf = (v) =>
    span === 0
      ? SPARK_H / 2
      : SPARK_H - SPARK_PAD - ((v - lo) / span) * (SPARK_H - SPARK_PAD * 2);
  const xOf = (i) => (index.length === 1 ? SPARK_W / 2 : (i / (index.length - 1)) * SPARK_W);

  const last = index[index.length - 1];
  const rising = last >= 100;
  const stroke = rising ? "var(--status-good-text)" : "var(--status-error-text)";
  const points = index.map((v, i) => `${xOf(i).toFixed(2)},${yOf(v).toFixed(2)}`).join(" ");

  const rawText = [
    `GitHub 이슈·PR ${formatCount(github[github.length - 1])}건`,
    hasStackoverflow
      ? `Stack Overflow ${formatCount(stackoverflow[stackoverflow.length - 1])}건`
      : null,
  ]
    .filter(Boolean)
    .join(" + ");

  return (
    <div className={`${prefix}__trend`}>
      <div className={`${prefix}__trend-head`}>
        <span className={`${prefix}__section-title`}>생태계 활동 추이</span>
        <span className={`${prefix}__trend-range`}>
          {months[0]} → {months[months.length - 1]}
        </span>
      </div>

      <div className={`${prefix}__trend-body`}>
        <svg
          className={`${prefix}__spark`}
          viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
          preserveAspectRatio="none"
          role="img"
        >
          <title>
            {`${months[0]} 대비 ${months[months.length - 1]} 지수 ${Math.round(last)}, ${
              rising ? "기준선 위" : "기준선 아래"
            }`}
          </title>
          <line
            x1="0"
            x2={SPARK_W}
            y1={yOf(100)}
            y2={yOf(100)}
            stroke="var(--line-strong)"
            strokeWidth="1"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points={points}
            fill="none"
            stroke={stroke}
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={SPARK_W}
            x2={SPARK_W}
            y1={yOf(last) - 4}
            y2={yOf(last) + 4}
            stroke={stroke}
            strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        <div className={`${prefix}__trend-figures`}>
          <div className={`${prefix}__trend-value`} style={{ color: stroke }}>
            지수 {Math.round(last)}
          </div>
          {delta && (
            <div className={`${prefix}__trend-sub`}>
              전월 대비 {delta.pct > 0 ? "+" : ""}
              {delta.pct}%
            </div>
          )}
        </div>
      </div>

      <p className={`${prefix}__trend-note`}>
        {months[0]} = 100 기준 · {months[months.length - 1]} {rawText}
      </p>
      <p className={`${prefix}__trend-note`}>
        {hasStackoverflow ? "GitHub·Stack Overflow 활동량" : "GitHub 활동량"}
      </p>
    </div>
  );
}
