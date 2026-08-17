// 직군 필터.
//
// "전체"에서 y축(채용 수요)은 200개 기술 전부를 놓고 매긴 백분위다. 직군을 하나
// 고르면 그 기준이 바뀐다 — 그 직군 공고에 실제로 등장한 기술끼리만 다시 백분위를
// 매긴다. Frontend 직군에서 React가 몇 위인지는 전체 순위와 다른 질문이고,
// 직군을 고른 사람이 알고 싶은 쪽은 후자다.
//
// 생태계 점수(x축)는 직군과 무관하므로 그대로 둔다. 두 축 중 하나만 움직이므로
// 사분면도 함께 바뀌며, 그 값은 scripts/build_gapmap_data.py가 미리 계산해
// roleBreakdown[].quadrant에 넣어 둔다. 프론트는 여기서도 좌표로부터 재계산하지
// 않고 데이터에 실린 값을 고른다.

export const ALL_ROLES = "all";

/**
 * 선택한 직군 기준으로 항목을 걸러내고 y축 값을 갈아끼운다.
 *
 * postings / postingsNote / summary처럼 전체 공고 모집단을 설명하는 필드는
 * 그대로 둔다. 대신 그 직군 안에서의 건수·순위를 roleContext로 따로 실어,
 * 화면이 "전체 기준"과 "직군 기준"을 섞어 보여주지 않게 한다.
 */
export function projectByRole(items, role) {
  if (!role || role === ALL_ROLES) return items;

  const projected = [];
  for (const item of items) {
    const hit = item.roleBreakdown?.find((b) => b.role === role);
    if (!hit) continue;
    projected.push({
      ...item,
      demand: hit.demand,
      demandRank: hit.rank,
      quadrant: hit.quadrant,
      roleContext: { role, count: hit.count, rank: hit.rank },
    });
  }
  return projected;
}

/** 해당 직군에 등장하는 기술 수 — 필터 문구의 분모로 쓴다. */
export function roleTechCount(items, role) {
  if (!role || role === ALL_ROLES) return items.length;
  return items.filter((i) => i.roleBreakdown?.some((b) => b.role === role)).length;
}
