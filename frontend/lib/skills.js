import skillIndex from "./skillIndex.json";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * 기술스택 사전 전체(217개)를 가져온다.
 *
 * 지도에 찍히는 기술보다 넓다. 여기에는 tech_stack_pipeline의 TECH_DICTIONARY에
 * 등록된 모든 canonical 기술이 들어간다. 생태계 지표(GitHub·Stack Overflow)는
 * 공고에 한 번이라도 등장한 200개에만 수집돼 있으므로, 나머지 17개는 사전에
 * 등록됐다는 사실과 별칭만 담는다.
 *
 * 반환 형태:
 *   meta  { totalSkills, detailedSkills, taggedSkills, totalPostings, categories }
 *   items { tech, skillCode, category, aliases, postings, postingsShare,
 *           rank(공고 건수 내림차순), roles, detailed }[]
 */
export async function getSkillIndex() {
  if (!API_URL) {
    return skillIndex;
  }

  try {
    const res = await fetch(`${API_URL}/api/v1/skills`, { cache: "no-store" });

    if (!res.ok) {
      throw new Error(`기술 사전을 불러오지 못했습니다 (status: ${res.status})`);
    }

    return await res.json();
  } catch (error) {
    console.error("[getSkillIndex] 요청 실패, skillIndex.json으로 대체합니다:", error);
    return skillIndex;
  }
}

/**
 * 사전 전체 목록에 지표가 수집된 200개 항목을 얹는다.
 *
 * 겹치는 필드(roles, postings 등)는 양쪽이 같은 원본에서 나왔으므로 어느 쪽을 써도
 * 같지만, 상세 쪽을 뒤에 펼쳐 quadrant·demand·summary 같은 추가 필드를 채운다.
 */
export function mergeSkills(indexItems, detailItems) {
  const byCode = new Map(detailItems.map((d) => [d.skillCode, d]));
  return indexItems.map((item) => {
    const detail = byCode.get(item.skillCode);
    if (!detail) return item;
    // detailed는 "생태계 지표가 수집됐는가"다. 손으로 쓴 설명 문장이
    // 있는 27개와는 다른 조건이다 — 200개 전부가 지표는 갖고 있고, 해설은
    // 없는 항목이 훨씬 많다.
    return { ...item, ...detail, detailed: Boolean(detail.ecosystem) };
  });
}

/**
 * 검색어가 이 기술의 이름(또는 별칭) 그 자체인가.
 *
 * skillHaystack에는 설명 문장과 연관 기술까지 들어 있다. 덕분에 "쿠버네티스로
 * 배포"처럼 이름이 아닌 말로도 찾히지만, 대신 "React"를 치면 React를 언급하는
 * 표제어가 전부 걸린다 — 실측 7개다. 펼침 패널의 연관 기술 칩을 누르면 그
 * 이름이 그대로 검색어가 되므로 이 경우가 특히 잦다.
 *
 * 찾는 것이 이름 그 자체라면 그것 하나만 보여준다(DictionaryClient 참고).
 */
export function isExactSkillName(skill, query) {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return (
    skill.tech?.toLowerCase() === q ||
    (skill.aliases ?? []).some((alias) => alias.toLowerCase() === q)
  );
}

/** 검색 대상 문자열. 별칭까지 포함해야 "K8s", "Golang" 같은 표기로도 찾힌다. */
export function skillHaystack(skill) {
  return [
    skill.tech,
    skill.category,
    skill.kind,
    ...(skill.aliases ?? []),
    ...(skill.roles ?? []),
    skill.summary,
    ...(skill.stack ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
