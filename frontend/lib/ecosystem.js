// 생태계 점수의 분해 — GitHub 저장소 / GitHub 이슈·PR 활동 / Stack Overflow 질문.
//
// ecosystemScore는 "응답에 실제로 들어 있는" 지표들의 단순 평균이다. 세 개가
// 항상 다 오지는 않는다: 최신 Task B가 성공한 운영 응답은 세 개를 모두 갖지만,
// 부분 데이터나 로컬 fixture는 일부만 가질 수 있다. 화면은 응답에 있는 지표만 그린다.
// 없는 지표를 0점 막대로 그리면 "GitHub 저장소 0개"처럼 사실과 다른 값이 된다.
//
// 상세 패널·바텀시트·기술 사전이 모두 같은 막대를 그리므로 라벨과 단위를
// 여기서 한 번만 정의한다.
//
// 주의: 점수는 모두 수집된 기술 집합 안에서의 백분위 순위라 최하위가 0.0이 된다.
// 0점이 "쓰이지 않는다"는 뜻이 아니라 "이 집합에서 가장 낮다"는 뜻이므로,
// 화면에는 항상 raw 카운트를 함께 보여준다.
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

/** 1842초 -> "30분", 7341초 -> "2시간 2분". 추천 영상 길이에 쓴다. */
export function formatDuration(seconds) {
  const total = Math.round(seconds / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h}시간 ${m}분` : `${m}분`;
}

/** meta의 수집 기간을 짧은 형태로 줄인다. */
export function formatPeriod(meta) {
  if (!meta?.fromDate || !meta?.toDate) return "—";
  const [fy, fm] = meta.fromDate.split("-");
  const [ty, tm] = meta.toDate.split("-");
  return fy === ty ? `${fy}.${fm}–${tm}` : `${fy}.${fm}–${ty}.${tm}`;
}

/** 상세 화면에서 그대로 map 돌릴 수 있는 형태로 3분해를 펴준다. */
export function ecosystemBars(tech) {
  if (!tech?.ecosystem) return [];
  return ECOSYSTEM_SOURCES.filter(({ key }) => tech.ecosystem[key]).map(
    ({ key, label, unit }) => {
      const source = tech.ecosystem[key];
      return {
        key,
        label,
        score: source.score ?? 0,
        rawText: `${formatCount(source.raw)}${unit}`,
      };
    }
  );
}

/** 생태계 종합 점수 아래에 붙는, 몇 개를 평균냈는지 밝히는 한 줄. */
export function ecosystemNote(tech) {
  const count = ecosystemBars(tech).length;
  if (count === 0) return "생태계 지표가 아직 연결되지 않았습니다.";
  if (count === 1) return "아래 지표(0~100)를 그대로 씁니다.";
  return `아래 ${count}개 지표(각 0~100)의 평균입니다.`;
}
