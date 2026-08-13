import mockData from "./mockData.json";

// .env.local의 NEXT_PUBLIC_API_URL (Vercel에는 `vercel env add`로 등록)
const API_URL = process.env.NEXT_PUBLIC_API_URL;
const GAP_MAP_ENDPOINT = `${API_URL}/gapmap`;

/**
 * 괴리맵(수요-생태계) 데이터를 가져온다.
 * 반환 형태: { tech, kind, role, ecosystemScore, demand, quadrant, trend, trendLabel,
 *   postings, postingsNote, competition, competitionNote, summary, metrics, signals,
 *   stack, verdict }[]
 */
export async function getGapMapData() {
  // API_URL이 설정되지 않은 환경(로컬 .env.local 미배치 등)에서는 실패가
  // 확정된 요청을 굳이 보내지 않는다. 그대로 두면 매번 404가 나고 콘솔에
  // 놀랄 만한 에러 로그만 남긴 채 어차피 mockData로 대체된다.
  if (!API_URL) {
    return mockData;
  }

  try {
    const res = await fetch(GAP_MAP_ENDPOINT, { cache: "no-store" });

    if (!res.ok) {
      throw new Error(`괴리맵 데이터를 불러오지 못했습니다 (status: ${res.status})`);
    }

    return await res.json();
  } catch (error) {
    console.error("[getGapMapData] 요청 실패, mockData.json으로 대체합니다:", error);
    return mockData;
  }
}