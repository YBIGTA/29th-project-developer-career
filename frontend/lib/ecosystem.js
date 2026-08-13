// 생태계 점수의 3분해 — GitHub 저장소 / GitHub 이슈·PR 활동 / Stack Overflow 질문.
//
// ecosystemScore는 이 세 점수(각각 0~100으로 정규화된 값)의 단순 평균이다.
// 상세 패널·바텀시트·기술 사전이 모두 같은 막대를 그리므로 라벨과 단위를
// 여기서 한 번만 정의한다.
//
// 주의: 세 점수 모두 27개 기술 안에서의 Min-Max 정규화라 최하위가 0.0으로
// 눌린다. 0점이 "쓰이지 않는다"는 뜻이 아니므로 화면에는 항상 raw 카운트를
// 함께 보여준다.
export const ECOSYSTEM_SOURCES = [
  { key: "githubRepo", label: "GitHub 저장소", unit: "개" },
  { key: "githubActivity", label: "GitHub 이슈·PR", unit: "건" },
  { key: "stackoverflow", label: "Stack Overflow 질문", unit: "개" },
];

// 22,869,713처럼 자릿수가 큰 raw 카운트를 한 줄에 담기게 줄인다.
export function formatCount(n) {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)}억`;
  if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString("ko-KR")}만`;
  return n.toLocaleString("ko-KR");
}

/** meta의 수집 기간을 히어로 통계에 들어갈 짧은 형태로 줄인다. */
export function formatPeriod(meta) {
  if (!meta?.fromDate || !meta?.toDate) return "—";
  const [fy, fm] = meta.fromDate.split("-");
  const [ty, tm] = meta.toDate.split("-");
  return fy === ty ? `${fy}.${fm}–${tm}` : `${fy}.${fm}–${ty}.${tm}`;
}

/** 상세 화면에서 그대로 map 돌릴 수 있는 형태로 3분해를 펴준다. */
export function ecosystemBars(tech) {
  if (!tech?.ecosystem) return [];
  return ECOSYSTEM_SOURCES.map(({ key, label, unit }) => {
    const source = tech.ecosystem[key] ?? {};
    return {
      key,
      label,
      score: source.score ?? 0,
      rawText: `${formatCount(source.raw)}${unit}`,
    };
  });
}
