"use client";

import { SPREAD_VERDICTS } from "@/lib/adoption";

/**
 * "기술 채택 범위" 탭의 본문.
 *
 * 답하는 질문은 하나다 — **공고 20건이 몇 개 회사에서 나왔는가.** 공고 건수만
 * 보면 12개 회사에 퍼진 20건과 한 회사가 올린 20건이 똑같아 보이는데, 배우는
 * 사람에게 이 둘은 완전히 다른 신호다.
 *
 * 두 축으로 본다.
 *   커버리지 — 몇 회사가 쓰나 (company_count / 표본 기업 수)
 *   편중     — 그 수요가 얼마나 한쪽에 쏠렸나 (HHI, 실질 회사 수 = 1/HHI)
 *
 * 해석 세 줄을 항상 다 그리고 지금 기술에 해당하는 줄만 강조한다. 한 줄만
 * 보여주면 "그래서 이게 좋은 건가"를 가늠할 기준이 없다.
 *
 * prefix는 클래스 이름 앞머리다(components/TrendSpark.jsx와 같은 이유).
 */
export default function AdoptionBreadth({ view, techName, prefix = "detail-panel" }) {
  const { companies, sample, coveragePct, hhi, effective, spread } = view;

  return (
    <>
      <p className={`${prefix}__summary`}>
        같은 공고 20건이어도 12개 회사에 퍼진 수요와 한 회사가 만든 수요는 뜻이 다릅니다.
        {techName}의 수요를 건수가 아니라 회사 단위로 다시 셉니다.
      </p>

      <div className={`${prefix}__stats`}>
        <div className={`${prefix}__stat`}>
          <div className={`${prefix}__stat-label`}>회사 커버리지</div>
          <div className={`${prefix}__stat-value`}>
            {companies}/{sample}개사
          </div>
          <div className={`${prefix}__stat-note`}>
            표본 기업의 {coveragePct}%가 이 기술을 요구합니다.
          </div>
        </div>
        <div className={`${prefix}__stat`}>
          <div className={`${prefix}__stat-label`}>실질 회사 수</div>
          <div className={`${prefix}__stat-value`}>
            {effective === null ? "—" : `${effective.toFixed(1)}개사`}
          </div>
          <div className={`${prefix}__stat-note`}>
            {effective === null
              ? "편중을 잴 자료가 없습니다."
              : `${companies}개사에 걸쳐 있지만 편중을 감안하면 ${effective.toFixed(
                  1
                )}개사가 고르게 쓰는 정도입니다.`}
          </div>
        </div>
      </div>

      <div className={`${prefix}__metrics`}>
        <div>
          <div className={`${prefix}__metric-row`}>
            <span className={`${prefix}__metric-label`}>회사 커버리지</span>
            <span className={`${prefix}__metric-value`}>
              {coveragePct}
              <span className={`${prefix}__metric-raw`}>%</span>
            </span>
          </div>
          <div className={`${prefix}__metric-track`}>
            {/* 폭이 0이면 트랙만 남아 값이 없는 것처럼 보인다. */}
            <div
              className={`${prefix}__metric-fill`}
              style={{ width: `${Math.max(2, coveragePct)}%`, background: "var(--accent)" }}
            />
          </div>
        </div>
      </div>

      <div className={`${prefix}__section-title`}>해석</div>
      <ul className={`${prefix}__verdicts`}>
        {SPREAD_VERDICTS.map((v) => (
          <li
            className={`${prefix}__verdict`}
            key={v.spread}
            data-active={v.spread === spread}
            aria-current={v.spread === spread ? "true" : undefined}
          >
            <div className={`${prefix}__verdict-axis`}>{v.axis}</div>
            <div className={`${prefix}__verdict-title`}>{v.verdict}</div>
            <p className={`${prefix}__verdict-body`}>{v.body}</p>
          </li>
        ))}
      </ul>

      <p className={`${prefix}__trend-note`}>
        회사 커버리지 = 이 기술이 등장한 서로 다른 기업 수 ÷ 표본 기업 수. HHI = Σ(회사별 공고
        비율)²로, 높을수록 한 기업에 쏠려 있고 낮을수록 고르게 나뉩니다. 실질 회사 수는 1/HHI로,
        같은 편중을 &quot;몇 개 회사가 똑같이 나눠 쓰는 셈인가&quot;로 옮긴 값입니다.
        {hhi !== null && ` 이 기술의 HHI는 ${hhi.toFixed(3)}입니다.`}
      </p>
      <p className={`${prefix}__footnote`}>
        표본 {sample}개사 기준입니다. 한 회사가 비슷한 공고를 여러 건 올리면 공고 수는 시장
        수요처럼 부풀지만 커버리지는 1개사에 머무릅니다.
      </p>
    </>
  );
}
