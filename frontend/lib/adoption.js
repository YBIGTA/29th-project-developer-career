// 채택 범위(Adoption Breadth) — "공고 20건"이 12개 회사에 퍼진 수요인지 한
// 회사가 혼자 만든 수요인지를 갈라 준다. 지도 상세 패널과 모바일 바텀시트가
// 같은 필드를 읽으므로 여기서 한 번만 정의한다.
//
// 값은 API가 준다(app/api/routes.py의 vw_skill_adoption_breadth). 판정
// (adoption.spread)도 **서버가 한다** — 이 저장소는 사분면과 같은 규칙으로
// 분류를 서버에 두고 화면은 문구로 옮기기만 한다. 임계값을 프론트에 복사해
// 두면 서버 기준이 바뀔 때 둘이 조용히 어긋난다.

// 확장자를 붙여 둔다 — test/*.test.mjs가 번들러 없이 node로 바로 불러온다.

/**
 * 서버가 내려주는 세 분류를 화면 문구로 옮긴다. 순서가 곧 화면에 놓이는
 * 순서다 — 커버리지가 넓은 쪽에서 좁은 쪽으로 내려간다.
 *
 * axis는 그 분류가 두 축(커버리지 · 편중)의 어느 조합인지를 적은 것이다.
 * 판정 근거를 숫자 없이 한 줄로 되짚게 해 준다.
 */
export const SPREAD_VERDICTS = [
  {
    spread: "확산형",
    axis: "커버리지 높음 · 편중 낮음",
    verdict: "시장 확산 근거가 강함",
    body: "여러 기업에서 관측되고 수요도 비교적 고르게 분산돼 있습니다.",
  },
  {
    spread: "집중형",
    axis: "커버리지 높음 · 편중 높음",
    verdict: "선도기업 중심의 채택",
    body: "여러 기업에서 보이지만 실제 수요 대부분이 일부 기업에 집중돼 있습니다.",
  },
  {
    spread: "단일기업",
    axis: "커버리지 낮음 · 편중 높음",
    verdict: "산업 전반의 채택 근거 부족",
    body: "소수 기업에서만 관측되고 특정 기업 의존도가 큽니다.",
  },
];

/**
 * 화면이 쓸 형태로 펴 놓는다. 값이 없거나 표본이 비면 null이고, 화면은
 * null이면 탭 자체를 만들지 않는다.
 *
 * 커버리지는 coverage_rate 컬럼이 아니라 정수 두 개로 다시 낸다 — 저 컬럼이
 * 0~1인지 0~100인지 뷰 소유자 쪽 정의가 아직 확인되지 않았다(routes.py의
 * spread_label도 같은 이유로 정수 두 개만 본다).
 */
export function adoptionView(tech) {
  const a = tech?.adoption;
  if (!a || !a.sampleCompanyCount) return null;

  const companies = a.companyCount ?? 0;
  const sample = a.sampleCompanyCount;
  return {
    companies,
    sample,
    coveragePct: Math.round((companies / sample) * 100),
    hhi: typeof a.hhi === "number" ? a.hhi : null,
    effective: typeof a.effectiveCompanyCount === "number" ? a.effectiveCompanyCount : null,
    spread: a.spread ?? null,
  };
}
