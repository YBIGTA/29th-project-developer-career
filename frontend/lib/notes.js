// 상세 패널에 실리는 해설(summary / stack)을 API 응답에 덧붙인다.
//
// summary는 두 부분을 이어 붙인다 — techNotes.json의 손으로 쓴 description
// ("AWS는 아마존이 제공하는 클라우드 컴퓨팅 플랫폼입니다" 같은, 이 기술이
// 뭔지 설명하는 한 문장)과, 그 뒤에 항상 데이터에서 새로 조립하는 통계
// 문장. 통계 문장을 손으로 쓰지 않는 이유: 예전에는 27개 기술의 summary
// 전체를 손으로 써 놓았는데, 안에 "공고 428건(17.7%)" 같은 숫자가 박혀
// 있어서 데이터가 갱신될 때마다 실제 값과 어긋났다(AWS는 이후 695건으로
// 늘었는데 문장은 428건에 머물러 있었다). 그래서 숫자가 들어가는 절은
// 매번 여기서 새로 만들고, description처럼 숫자가 없어 안 낡는 텍스트만
// techNotes.json에 손으로 남긴다.
//
// stack(함께 요구되는 기술)은 이제 API가 군집 분석에서 계산해 내려준다
// (app/api/routes.py의 build_stacks — 같은 군집에서 유사도가 높은 기술들).
// 여기 남은 27개는 API가 그 필드를 못 줄 때만 쓰는 대체본이다. 손으로는
// 27개에서 멈춰 있었는데, 애초에 공고 동시등장으로 계산할 값이었다.
import techNotes from "./techNotes.json";

function buildSummary(item, description) {
  const share = item.postingsShare;
  const lead = `활성 공고 ${item.postings.toLocaleString("ko-KR")}건(${share}%)에서 요구됩니다.`;

  const roles = item.roleBreakdown ?? [];
  const stats = (() => {
    if (roles.length === 0) return lead;
    const top = roles[0];
    const topClause = `${top.role} 직군에서 가장 많이 쓰이고(${top.count.toLocaleString("ko-KR")}건)`;
    if (roles.length === 1) return `${lead} ${topClause}, 그 직군에만 집중돼 있습니다.`;
    return `${lead} ${topClause}, ${roles.length}개 직군에 걸쳐 요구됩니다.`;
  })();

  return description ? `${description} ${stats}` : stats;
}

/** getGapMapData()가 받아온 원본 응답에 summary/stack을 덧붙인다. */
export function withNotes(gapMapData) {
  if (!gapMapData?.items) return gapMapData;

  const items = gapMapData.items.map((item) => {
    const note = techNotes[item.tech];
    return {
      ...item,
      summary: buildSummary(item, note?.description),
      // 응답이 이미 갖고 있으면 덮지 않는다 — 덮으면 200개가 27개로 되돌아간다.
      ...(note?.stack && !item.stack && { stack: note.stack }),
    };
  });

  return {
    ...gapMapData,
    meta: { ...gapMapData.meta, detailedTechs: items.filter((i) => i.summary).length },
    items,
  };
}
