"use client";

import { EVIDENCE_LABELS } from "@/lib/api";

/**
 * "함께 요구되는 기술".
 *
 * 값은 두 곳에서 온다.
 *
 * 1. `tech.stack` — 이름 문자열 목록. 지도 응답에 이미 실려 있어 바로 그린다
 *    (app/api/routes.py의 build_stacks가 같은 군집 분석에서 뽑는다).
 * 2. `cluster` — /api/v1/tech/{code}/cluster 를 상세가 열릴 때만 따로 부른 것.
 *    이웃마다 유사도(score)와 몇 개 회사 공고에서 함께 나왔는지(companies)가
 *    붙어 있고, 군집 자체의 크기와 근거 등급도 온다.
 *
 * 2가 오기 전에는 1을 그리고, 오면 2로 바꾼다. 그래야 API가 없거나 느린
 * 환경에서도 이 칸이 비지 않는다. 이름만 있는 칩과 근거가 붙은 줄은 생김새가
 * 다르므로 무엇을 보고 있는지는 아래 한 줄이 밝힌다.
 *
 * evidenceLabel과 membershipQuality는 다른 축이라 섞지 않는다 — 군집 안에서
 * 중심적인데(core_member) 산업 연결 근거는 빈약한(weak_evidence) 경우가 실제로
 * 있다. 여기서는 근거 등급만 쓴다.
 *
 * prefix는 클래스 이름 앞머리다(components/TrendSpark.jsx와 같은 이유).
 * onPick이 있으면 칩이 버튼이 된다 — 사전에서 그 이름으로 검색을 건다.
 */
export default function StackList({ tech, cluster, prefix = "detail-panel", onPick }) {
  const names = tech.stack ?? [];
  const neighbors = cluster?.neighbors ?? [];
  if (!names.length && !neighbors.length) return null;

  const Chip = onPick ? "button" : "span";
  const chipProps = onPick ? { type: "button" } : {};

  return (
    <>
      <div className={`${prefix}__section-title`}>함께 요구되는 기술</div>

      {neighbors.length > 0 ? (
        <ul className={`${prefix}__neighbors`}>
          {neighbors.map((n) => (
            <li className={`${prefix}__neighbor`} key={n.tech}>
              <Chip
                {...chipProps}
                className={`${prefix}__neighbor-name`}
                onClick={onPick ? () => onPick(n.tech) : undefined}
              >
                {n.tech}
              </Chip>
              {/* score는 0~1 유사도다. 막대 하나면 "누가 더 가까운가"가 숫자를
                  읽지 않아도 보인다. 폭이 0이 되지 않게 최소값을 준다. */}
              <span className={`${prefix}__neighbor-track`}>
                <span
                  className={`${prefix}__neighbor-fill`}
                  style={{ width: `${Math.max(4, Math.min(100, n.score * 100))}%` }}
                />
              </span>
              <span className={`${prefix}__neighbor-meta`}>
                {n.companies.toLocaleString("ko-KR")}개사
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className={`${prefix}__stack`}>
          {names.map((s) => (
            <Chip
              {...chipProps}
              className={`${prefix}__chip`}
              key={s}
              onClick={onPick ? () => onPick(s) : undefined}
            >
              {s}
            </Chip>
          ))}
        </div>
      )}

      {cluster && (
        <p className={`${prefix}__trend-note`}>
          {[
            `같은 군집 ${cluster.clusterSize ?? neighbors.length}개 기술 중 가까운 순`,
            EVIDENCE_LABELS[cluster.evidenceLabel],
            cluster.asOfDate ? `${cluster.asOfDate} 기준` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
    </>
  );
}
