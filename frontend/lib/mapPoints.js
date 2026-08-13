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
