"use client";

const SPARK_W = 100;
const SPARK_H = 40;
const SPARK_PAD = 4;

/** 2026-08-20 -> 8/20. 축 양 끝에만 쓴다. */
function shortDate(iso) {
  const [, m, d] = String(iso).split("-");
  return `${Number(m)}/${Number(d)}`;
}

/**
 * Stack Overflow 최근 30일 비중 지수.
 *
 * TrendSpark(월별 생태계 활동)와 답하는 질문이 다르다. 월별 지수는 "첫 달
 * 대비 얼마나 컸나"이고, 이쪽은 **"평소 대비 지금 뜨나"** 다. 그래서 기준선의
 * 뜻도 다르다 — 저쪽은 첫 달의 자기 자신, 이쪽은 조회 구간 180일 전체의 평균
 * 비중이다. 두 그림을 나란히 두되 각주로 이 차이를 밝힌다.
 *
 * 값이 어떻게 나오는지는 lib/api.js의 getDailyIndex() 주석에 있다. 계산은
 * 전부 서버(TIMESERIES_DAILY_SQL)가 한다.
 *
 * 점이 180개라 TrendSpark처럼 마지막 값에 표시를 찍지 않는다 — 선이 촘촘해
 * 표시가 선을 가린다. 대신 오른쪽 숫자로 읽게 한다.
 */
export default function DailySpark({ series, prefix = "detail-panel" }) {
  const { dates, index } = series;
  if (index.length < 2) return null;

  const lo = Math.min(...index, 100);
  const hi = Math.max(...index, 100);
  const span = hi - lo;
  const yOf = (v) =>
    span === 0
      ? SPARK_H / 2
      : SPARK_H - SPARK_PAD - ((v - lo) / span) * (SPARK_H - SPARK_PAD * 2);
  const xOf = (i) => (i / (index.length - 1)) * SPARK_W;

  const last = index[index.length - 1];
  const hot = last >= 100;
  const stroke = hot ? "var(--status-good-text)" : "var(--status-error-text)";
  const points = index.map((v, i) => `${xOf(i).toFixed(2)},${yOf(v).toFixed(2)}`).join(" ");

  return (
    <div className={`${prefix}__trend`}>
      <div className={`${prefix}__trend-head`}>
        <span className={`${prefix}__section-title`}>Stack Overflow 최근 30일 비중</span>
        <span className={`${prefix}__trend-range`}>
          {shortDate(dates[0])} → {shortDate(dates[dates.length - 1])}
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
            {`180일 평균 비중을 100으로 볼 때 현재 지수 ${Math.round(last)}, ${
              hot ? "평소보다 높음" : "평소보다 낮음"
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
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        <div className={`${prefix}__trend-figures`}>
          <div className={`${prefix}__trend-value`} style={{ color: stroke }}>
            지수 {Math.round(last)}
          </div>
          <div className={`${prefix}__trend-sub`}>{hot ? "평소보다 높음" : "평소보다 낮음"}</div>
        </div>
      </div>

      <p className={`${prefix}__trend-note`}>
        그날 기준 최근 30일 질문 수가 전체 기술 질문 수에서 차지하는 비중입니다. 하루 값은 0이
        너무 많아 그대로 쓰지 않습니다.
      </p>
      <p className={`${prefix}__trend-note`}>
        180일 평균 비중 = 100 기준 · 위 월별 지수와 기준선의 뜻이 다릅니다.
      </p>
    </div>
  );
}
