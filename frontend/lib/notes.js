// 상세 패널에 실리는 해설(summary / verdict / stack)을 API 응답에 덧붙인다.
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
// verdict("지금 배운다면" 카드에 뜨는 조언)와 stack(연관 기술)도 같은
// 이유로 techNotes.json에 있는 기술에만 붙는다. verdict는 공고 수 상위
// 기술 위주로 채워져 있고(2026-08 기준 상위 80개 + 기존 27개), stack은
// 실제로는 공고 동시등장률로 계산해야 할 값이라 손으로는 기존 27개 것만
// 남기고 새로 추가하지 않았다 — 나머지는 DW 연동을 기다린다.
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

/** getGapMapData()가 받아온 원본 응답에 summary/verdict/stack을 덧붙인다. */
export function withNotes(gapMapData) {
  if (!gapMapData?.items) return gapMapData;

  const items = gapMapData.items.map((item) => {
    const note = techNotes[item.tech];
    return {
      ...item,
      summary: buildSummary(item, note?.description),
      ...(note?.verdict && { verdict: note.verdict }),
      ...(note?.stack && { stack: note.stack }),
    };
  });

  return {
    ...gapMapData,
    meta: { ...gapMapData.meta, detailedTechs: items.filter((i) => i.verdict).length },
    items,
  };
}
