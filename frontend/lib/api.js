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