// 응답에 실린 생태계 점수를 사다리 점수로 갈아끼운다.
//
// lib/notes.js의 withNotes(), lib/techExtras.js의 withExtras()와 같은 자리에서
// 도는 마지막 단계다. 원시 건수(ecosystem.*.raw)는 API도 mockData도 똑같이
// 싣고 오므로, 여기서 계산하면 두 경로가 저절로 일치한다. DW가 내려주는
// ecosystem_score(세 지표 각각 백분위 후 평균)는 더 이상 쓰지 않는다 — 왜
// 바꿨는지는 lib/ecosystem.js의 ECOSYSTEM_ANCHORS 주석에 있다.
//
// **quadrant도 여기서 다시 매긴다.** 원래 이 값은 서버가 계산해 내려주고
// 프론트는 매핑만 하는 것이 규칙이었다(lib/quadrants.js 주석). 가로축 점수를
// 바꾸면서 서버가 준 quadrant와 화면의 x좌표가 어긋나게 됐으므로, 축을 바꾼
// 쪽에서 분류도 함께 책임진다. 생태계 점수 계산이 API로 옮겨가면 이 파일과
// 함께 규칙도 원래대로 돌려놓으면 된다.
//
// 경계는 50점이 아니라 **그 응답 안의 중앙값**이다. 백분위였을 때는 50이 곧
// 중앙값이라 둘이 같았지만, 사다리 점수는 절대값이라 50이 중앙이 아니다
// (실측 200개 기준 중앙값 55.2, 50을 쓰면 119 대 81로 갈린다). 사분면의
// 질문 자체가 "다른 기술들에 비해 활발한가"라 중앙값이 맞는 기준이다.
import { ecosystemComposite } from "./ecosystem";

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function quadrantOf(demand, ecosystem, threshold) {
  if (demand >= 50) return ecosystem >= threshold ? "필수" : "희소가치";
  return ecosystem >= threshold ? "선점 후보" : "저관심";
}

/** getGapMapData() 응답의 ecosystemScore / quadrant를 사다리 기준으로 다시 만든다. */
export function withEcosystemScore(gapMapData) {
  if (!gapMapData?.items) return gapMapData;

  const scores = new Map();
  for (const item of gapMapData.items) {
    const score = ecosystemComposite(item);
    if (score !== null) scores.set(item, score);
  }
  // 지표가 하나도 없는 기술은 경계 계산에서 빼야 한다. 0으로 세면 중앙값이
  // 아래로 끌려 내려가 멀쩡한 기술들이 통째로 오른쪽 사분면으로 넘어간다.
  const threshold = median([...scores.values()]);
  if (threshold === null) return gapMapData;

  const items = gapMapData.items.map((item) => {
    const score = scores.get(item);
    if (score === undefined) return item;

    return {
      ...item,
      ecosystemScore: score,
      quadrant: quadrantOf(item.demand ?? 0, score, threshold),
      // 직군 필터를 걸면 세로축이 그 직군 안 백분위로 바뀌면서 사분면도 함께
      // 바뀐다. 가로축은 직군과 무관하게 같은 점수를 쓰므로 여기서 함께 고쳐
      // 두지 않으면 필터를 걸 때만 옛 분류가 되살아난다.
      ...(item.roleBreakdown && {
        roleBreakdown: item.roleBreakdown.map((row) => ({
          ...row,
          quadrant: quadrantOf(row.demand ?? 0, score, threshold),
        })),
      }),
    };
  });

  return {
    ...gapMapData,
    meta: { ...gapMapData.meta, ecosystemThreshold: threshold },
    items,
  };
}
