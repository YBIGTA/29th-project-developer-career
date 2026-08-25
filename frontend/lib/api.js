import mockData from "./mockData.json";
import mockPostings from "./mockPostings.json";
import { withNotes } from "./notes";
import { withExtras } from "./techExtras";
import { withEcosystemScore } from "./ecosystemScore";

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
 *           adoption { companyCount, sampleCompanyCount, coverageRate, hhi,
 *             effectiveCompanyCount, spread } — 수요가 몇 개 회사로 퍼져 있는가.
 *             spread는 확산형/집중형/단일기업 셋 중 하나로 **서버가 판정한다**.
 *             뷰에 행이 없는 기술에는 키가 아예 없다 (lib/adoption.js 참고),
 *           summary(항상 있음 — 매 응답마다 lib/notes.js가 데이터로 새로 조립한다),
 *           stack — 같은 군집에서 가까운 기술 (API가 계산, 없으면 lib/techNotes.json),
 *           docs { url, note? } — 공식 문서 (198개 기술),
 *           videos [{ id, title, channel, views, seconds }] — 입문 영상 3편 (87개 기술),
 *           trend { months, index, github, stackoverflow, hasStackoverflow, delta }
 *             — 최근 8개월 생태계 활동. index는 원시 건수가 아니라 그 달 200개
 *               기술 합계 대비 **점유율**을 첫 달 100으로 잡은 지수다.
 *               위 셋은 lib/techExtras.js가 붙인다 }[]
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
    return withEcosystemScore(withExtras(withNotes(mockData)));
  }

  try {
    const res = await fetch(`${API_URL}/api/v1/gapmap`, { cache: "no-store" });

    if (!res.ok) {
      throw new Error(`괴리맵 데이터를 불러오지 못했습니다 (status: ${res.status})`);
    }

    return withEcosystemScore(withExtras(withNotes(await res.json())));
  } catch (error) {
    console.error("[getGapMapData] 요청 실패, mockData.json으로 대체합니다:", error);
    return withEcosystemScore(withExtras(withNotes(mockData)));
  }
}

/**
 * 해당 기술을 요구하는 실제 채용 공고를 가져온다. 상세 화면의 "공고" 탭이
 * 열릴 때만 호출한다 (지도 첫 로드에 딸려오면 낭비다).
 *
 * 반환 형태: { items, isSample }
 *   items    { company, title, location, employmentType, publishedAt, applyUrl }[]
 *   isSample mockPostings.json으로 대체된 값인지. 화면이 "예시 공고입니다"
 *            각주를 실제로 대체됐을 때만 띄우려고 쓴다. 예전에는 각주가 조건
 *            없이 항상 찍혀서, 진짜 API 공고가 와도 예시라고 말했다.
 */
export async function getTechPostings(skillCode, limit = 5) {
  if (!skillCode) return { items: [], isSample: false };

  if (!API_URL) {
    return { items: (mockPostings[skillCode] ?? []).slice(0, limit), isSample: true };
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
    return { items: body.items ?? [], isSample: false };
  } catch (error) {
    console.error("[getTechPostings] 요청 실패, mockPostings.json으로 대체합니다:", error);
    return { items: (mockPostings[skillCode] ?? []).slice(0, limit), isSample: true };
  }
}

// 내부 라벨을 화면에 그대로 쓰지 않는다. 이 셋은 "선점 가치가 있다/없다"가
// 아니라 "산업적 연결을 설명할 근거가 있는가"에 대한 답이다.
export const EVIDENCE_LABELS = {
  supporting_evidence: "산업 연결 근거 있음",
  weak_evidence: "산업 연결 근거 빈약함",
  insufficient_evidence: "판단할 채용 데이터 부족",
};

/**
 * 해당 기술의 군집 소속과 함께 등장하는 기술을 가져온다. 상세 화면에서 필요할
 * 때만 호출한다. mock이 없으므로 API_URL이 없으면 그냥 null이다 — 화면은
 * null이면 섹션 자체를 그리지 않는다.
 *
 * 반환 형태: null | { asOfDate, clusterId, clusterSize, membershipQuality,
 *   evidenceLabel, jobCount, companyCount, coherence, stability, marginRatio,
 *   neighborCompanyShare, dominantCompany, dominantCompanyShare,
 *   neighbors [{ tech, score, companies }], globalNeighbors [...] }
 *
 * evidenceLabel은 EVIDENCE_LABELS로 번역해서 쓴다. membershipQuality(군집 안에서
 * 얼마나 중심적인가)와는 다른 축이라 UI에서 섞으면 안 된다 — core_member인데
 * weak_evidence인 경우가 실제로 있다.
 */
export async function getTechCluster(skillCode) {
  if (!skillCode || !API_URL) return null;

  try {
    const res = await fetch(`${API_URL}/api/v1/tech/${skillCode}/cluster`);
    if (!res.ok) {
      throw new Error(`군집 정보를 불러오지 못했습니다 (status: ${res.status})`);
    }
    return await res.json();
  } catch (error) {
    console.error("[getTechCluster] 요청 실패, 군집 섹션을 숨깁니다:", error);
    return null;
  }
}

/**
 * Stack Overflow 일별 30일 롤링 비중 지수.
 *
 * 하루 질문 수를 그대로 보지 않는다. SO는 기술별로 질문이 없는 날이 많아서
 * 하루 단위 비중은 0이 대부분이고 값이 튄다. 그래서 각 날짜마다 **그 날짜
 * 기준 최근 30일**을 묶어 비중을 낸다 — 8/20 값은 8/20 하루가 아니라
 * 7/22~8/20 동안의 그 기술 질문 수를 같은 기간 전체 질문 수로 나눈 값이다.
 * 그 비중을 조회 구간 전체(기본 180일)의 평균 비중 = 100으로 지수화한다.
 * 100보다 크면 최근 30일 기준으로 평소보다 비중이 높다는 뜻이다.
 *
 * 계산은 전부 서버가 한다(app/api/routes.py의 TIMESERIES_DAILY_SQL). 여기서는
 * 받아서 { dates, index } 로 펴 놓기만 한다.
 *
 * 기간을 좁히면 뜻이 달라진다 — 기준선(평균 비중)이 그 좁힌 구간의 평균이
 * 되기 때문이다. 그래서 기본 180일을 그대로 쓰고 인자로 열어두지 않는다.
 *
 * **응답 크기 주의.** 이 엔드포인트는 원래 모든 기술의 모든 날짜를 한 번에
 * 내려줬다 — 200개 x 180일이면 6.4MB다. 상세 화면은 기술 하나의 선만 그리는
 * 데 그만큼을 받는 것이 폰에서는 특히 나쁘다. 그래서 skill= 필터를 함께
 * 넣었다(routes.py의 get_timeseries_daily).
 *
 * 다만 **아직 그 필터가 없는 API도 상대해야 한다.** 배포된 백엔드가 먼저
 * 갱신되리라는 보장이 없고, 모르는 쿼리 파라미터는 그냥 무시되어 전체가
 * 내려온다. 그래서 받은 것을 무조건 기술별로 갈라 캐시에 전부 넣는다.
 * 필터가 있으면 요청마다 한 기술씩(약 32KB), 없으면 첫 요청 한 번만 크고
 * 그 뒤의 기술들은 캐시에서 바로 나온다. 어느 쪽이든 낭비가 한 번을 넘지 않는다.
 */
const dailyIndexCache = new Map(); // skillCode -> { dates, index } | null
const dailyIndexPending = new Map(); // skillCode -> Promise
// 한 번이라도 전체 응답을 받았는가. 받았다면 캐시에 없는 기술은 지수가 없는
// 기술이므로 더 물어볼 필요가 없다.
let dailyIndexFullSet = false;

export function getDailyIndex(skillCode) {
  if (!skillCode || !API_URL) return Promise.resolve(null);
  if (dailyIndexCache.has(skillCode)) {
    return Promise.resolve(dailyIndexCache.get(skillCode));
  }
  if (dailyIndexFullSet) return Promise.resolve(null);
  if (dailyIndexPending.has(skillCode)) return dailyIndexPending.get(skillCode);

  const request = (async () => {
    try {
      const res = await fetch(
        `${API_URL}/api/v1/timeseries/daily?skill=${encodeURIComponent(skillCode)}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        throw new Error(`일별 지수를 불러오지 못했습니다 (status: ${res.status})`);
      }
      const body = await res.json();

      // 응답은 날짜 오름차순이라 그대로 밀어 넣으면 순서가 유지된다.
      const bySkill = new Map();
      for (const row of body.items ?? []) {
        // 기준선이 없는 기술(조회 구간 내내 질문 0건)은 지수가 null이다.
        // 그런 날은 선을 그릴 수 없으므로 아예 담지 않는다.
        if (row.stackoverflowIndex === null || row.stackoverflowIndex === undefined) continue;
        let series = bySkill.get(row.skillCode);
        if (!series) {
          series = { dates: [], index: [] };
          bySkill.set(row.skillCode, series);
        }
        series.dates.push(row.date);
        series.index.push(Number(row.stackoverflowIndex));
      }

      // 응답에 기술이 여럿이면 필터가 무시된 것이다 — 즉 이 응답이 전체다.
      const wholeSet = bySkill.size > 1;

      // 나머지 기술도 같이 캐시해 둔다. 이미 있는 것은 덮지 않는다 — 내용이
      // 같은 새 객체로 갈아치우면 그 배열을 참조하던 화면이 괜히 다시 그린다.
      for (const [code, series] of bySkill) {
        if (!dailyIndexCache.has(code)) dailyIndexCache.set(code, series);
      }

      // 전체를 받았는데 없는 기술은 지수 자체가 없는 기술이다. null로 못박아
      // 두지 않으면 그런 기술을 열 때마다 전체를 다시 받는다.
      if (wholeSet) {
        dailyIndexFullSet = true;
      }
      if (!dailyIndexCache.has(skillCode)) dailyIndexCache.set(skillCode, null);

      return dailyIndexCache.get(skillCode) ?? null;
    } catch (error) {
      console.error("[getDailyIndex] 요청 실패, 일별 지수 칸을 숨깁니다:", error);
      // 실패는 캐시에 남기지 않는다 — 남기면 새로고침 전까지 다시 시도하지 않는다.
      return null;
    } finally {
      dailyIndexPending.delete(skillCode);
    }
  })();

  dailyIndexPending.set(skillCode, request);
  return request;
}
