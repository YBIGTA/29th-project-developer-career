// 지도에 찍는 점의 상한.
//
// 점이 많아지면 서로 겹쳐 읽을 수 없어지므로 채용 수요 상위 N개만 그리고,
// 잘린 기술은 기술 사전으로 넘긴다. 지금 데이터는 27개라 아무것도 잘리지
// 않지만, DW의 SKILL 185개가 붙으면 곧바로 걸린다.
export const MAP_LIMIT = 30;

export function pickMapPoints(items, limit = MAP_LIMIT) {
  if (items.length <= limit) return items;
  return [...items].sort((a, b) => b.demand - a.demand).slice(0, limit);
}

/** 사전에서 "지도 미표시"를 판정할 때 쓴다. */
export function mapCodeSet(items, limit = MAP_LIMIT) {
  return new Set(pickMapPoints(items, limit).map((d) => d.skillCode));
}

// 점을 0%/100% 자리에 그대로 찍으면 원의 절반이 판 밖으로 잘린다
// (.gap-map__plane / .mv-map__plane 이 overflow: hidden). 그래서 0~100 점수를
// 판 안쪽 PLOT_PAD~(100-PLOT_PAD) 구간에 대응시킨다.
//
// 좌우 대칭이라 50점은 그대로 50%에 남는다 — 배경 사분면과 십자선이 그리는
// 50% 경계선과 어긋나지 않는 것이 중요하다.
export const PLOT_PAD = 4;

export function plot(value, pad = PLOT_PAD) {
  const v = Math.min(100, Math.max(0, value ?? 0));
  return pad + (v * (100 - 2 * pad)) / 100;
}

// 판 바닥에 가까운 점은 이름표를 위로 뒤집는다. 아래로 두면 이름이 잘린다.
export function labelFlipsUp(demand) {
  return (demand ?? 0) < 12;
}
