import mockData from "./mockData.json";
import mockPostings from "./mockPostings.json";

// frontend/.env.local의 NEXT_PUBLIC_API_URL (Vercel에는 `vercel env add`로 등록).
// 저장소 루트의 .env.local은 Next.js가 읽지 않는다 — frontend/ 안에 둬야 한다.
const API_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * 괴리맵(수요-생태계) 데이터를 가져온다.
 *
 * 반환 형태:
 *   meta  { fromDate, toDate, totalTechs, mappedTechs, totalPostings, mapLimit }
 *   items { tech, skillCode, kind, role, demand, ecosystemScore, quadrant,
 *           postings, postingsNote,
 *           ecosystem: { githubRepo, githubActivity, stackoverflow } — 각 { score, raw },
 *           sampleRepositories, summary, signals, stack, verdict }[]
 *
 * quadrant는 서버가 계산해서 내려주는 값이다. 프론트는 색상/라벨에 매핑만 하고
 * 좌표로부터 재계산하지 않는다 (lib/quadrants.js 참고).
 */
export async function getGapMapData() {
  // API_URL이 설정되지 않은 환경(로컬 .env.local 미배치 등)에서는 실패가
  // 확정된 요청을 굳이 보내지 않는다. 그대로 두면 매번 404가 나고 콘솔에
  // 놀랄 만한 에러 로그만 남긴 채 어차피 mockData로 대체된다.
  if (!API_URL) {
    return mockData;
  }

  try {
    const res = await fetch(`${API_URL}/api/v1/gapmap`, { cache: "no-store" });

    if (!res.ok) {
      throw new Error(`괴리맵 데이터를 불러오지 못했습니다 (status: ${res.status})`);
    }

    return await res.json();
  } catch (error) {
    console.error("[getGapMapData] 요청 실패, mockData.json으로 대체합니다:", error);
    return mockData;
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
