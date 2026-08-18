import mockData from "./mockData.json";
import mockPostings from "./mockPostings.json";
import { withNotes } from "./notes";

// frontend/.env.local의 NEXT_PUBLIC_API_URL (Vercel에는 `vercel env add`로 등록).
// 저장소 루트의 .env.local은 Next.js가 읽지 않는다 — frontend/ 안에 둬야 한다.
const API_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * 괴리맵(수요-생태계) 데이터를 가져온다.
 *
 * 반환 형태:
 *   meta  { fromDate, toDate, totalTechs, mappedTechs, totalPostings, mapLimit,
 *           detailedTechs(해설 문장이 있는 기술 수), roles: string[](14개, 공고 수 내림차순) }
 *   items { tech, skillCode, kind, category, aliases,
 *           roles: string[](요구가 많은 순 최대 2개),
 *           roleBreakdown: { role, count, demand, rank, quadrant }[]
 *             — 그 기술이 등장한 직군 전부. demand/rank/quadrant는 해당 직군
 *               안에서만 다시 매긴 값이라 아래 전체 기준 값과 다르다,
 *           demand(공고 언급 빈도의 백분위 순위 0~100), demandRank,
 *           ecosystemScore, quadrant, postings, postingsShare, postingsNote,
 *           ecosystem: { githubRepo?, githubActivity?, stackoverflow? } — 각 { score, raw }.
 *             세 개가 다 오지는 않는다. 운영 DW는 최신 Task B 성공 후 세 개를 내려주고
 *             로컬 mockData.json만 세 개를 모두 갖는다. 화면은 있는 것만 그린다
 *             (lib/ecosystem.js 참고),
 *           sampleRepositories, signals,
 *           summary(항상 있음 — 매 응답마다 lib/notes.js가 데이터로 새로 조립한다),
 *           verdict, stack — 손으로 쓴 해설이 있는 기술에만 있다 (lib/techNotes.json) }[]
 *
 * 정규화: 두 축 모두 **백분위 순위**다. 데이터 웨어하우스가 내려주는
 * demand_score(선형 최대값 환산)는 쓰지 않는다 — 1위만 100점이고 나머지가
 * 바닥에 깔려 "선점 후보" 사분면이 비기 때문이다. 원시 건수를 받아 프론트
 * 데이터 생성 단계(scripts/build_gapmap_data.py)에서 다시 매긴다.
 *
 * quadrant는 서버가 계산해서 내려주는 값이다. 프론트는 색상/라벨에 매핑만 하고
 * 좌표로부터 재계산하지 않는다 (lib/quadrants.js 참고).
 */
export async function getGapMapData() {
  // API_URL이 설정되지 않은 환경(로컬 .env.local 미배치 등)에서는 실패가
  // 확정된 요청을 굳이 보내지 않는다. 그대로 두면 매번 404가 나고 콘솔에
  // 놀랄 만한 에러 로그만 남긴 채 어차피 mockData로 대체된다.
  if (!API_URL) {
    return withNotes(mockData);
  }

  try {
    const res = await fetch(`${API_URL}/api/v1/gapmap`, { cache: "no-store" });

    if (!res.ok) {
      throw new Error(`괴리맵 데이터를 불러오지 못했습니다 (status: ${res.status})`);
    }

    return withNotes(await res.json());
  } catch (error) {
    console.error("[getGapMapData] 요청 실패, mockData.json으로 대체합니다:", error);
    return withNotes(mockData);
  }
}

/**
 * 해당 기술을 요구하는 실제 채용 공고를 가져온다. 상세 화면의 "공고" 탭이
 * 열릴 때만 호출한다 (지도 첫 로드에 딸려오면 낭비다).
 *
 * 반환 형태: { company, title, location, employmentType, publishedAt, applyUrl }[]
 */
export async function getTechPostings(skillCode, limit = 5) {
  if (!skillCode) return [];

  if (!API_URL) {
    return (mockPostings[skillCode] ?? []).slice(0, limit);
  }

  try {
    const res = await fetch(
      `${API_URL}/api/v1/tech/${encodeURIComponent(skillCode)}/postings?limit=${limit}`,
      { cache: "no-store" }
    );

    if (!res.ok) {
      throw new Error(`채용 공고를 불러오지 못했습니다 (status: ${res.status})`);
    }

    const body = await res.json();
    return body.items ?? [];
  } catch (error) {
    console.error("[getTechPostings] 요청 실패, mockPostings.json으로 대체합니다:", error);
    return (mockPostings[skillCode] ?? []).slice(0, limit);
  }
}
