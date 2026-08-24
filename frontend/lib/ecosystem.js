// 생태계 점수의 분해 — GitHub 저장소 / GitHub 이슈·PR 활동 / Stack Overflow 질문.
//
// ecosystemScore는 "응답에 실제로 들어 있는" 지표들의 단순 평균이다. 세 개가
// 항상 다 오지는 않는다: 최신 Task B가 성공한 운영 응답은 세 개를 모두 갖지만,
// 부분 데이터나 로컬 fixture는 일부만 가질 수 있다. 화면은 응답에 있는 지표만 그린다.
// 없는 지표를 0점 막대로 그리면 "GitHub 저장소 0개"처럼 사실과 다른 값이 된다.
//
// 상세 패널·바텀시트·기술 사전이 모두 같은 막대를 그리므로 라벨과 단위를
// 여기서 한 번만 정의한다.
//
// 주의: 점수는 모두 수집된 기술 집합 안에서의 백분위 순위라 최하위가 0.0이 된다.
// 0점이 "쓰이지 않는다"는 뜻이 아니라 "이 집합에서 가장 낮다"는 뜻이므로,
// 화면에는 항상 raw 카운트를 함께 보여준다.
export const ECOSYSTEM_SOURCES = [
  { key: "githubRepo", label: "GitHub 저장소", unit: "개" },
  { key: "githubActivity", label: "GitHub 이슈·PR", unit: "건" },
  { key: "stackoverflow", label: "Stack Overflow 질문", unit: "개" },
];

// 22,869,713처럼 자릿수가 큰 raw 카운트를 한 줄에 담기게 줄인다.
export function formatCount(n) {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)}억`;
  if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString("ko-KR")}만`;
  return n.toLocaleString("ko-KR");
}

/** 1842초 -> "30분", 7341초 -> "2시간 2분". 추천 영상 길이에 쓴다. */
export function formatDuration(seconds) {
  const total = Math.round(seconds / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h}시간 ${m}분` : `${m}분`;
}

/** meta의 수집 기간을 짧은 형태로 줄인다. */
export function formatPeriod(meta) {
  if (!meta?.fromDate || !meta?.toDate) return "—";
  const [fy, fm] = meta.fromDate.split("-");
  const [ty, tm] = meta.toDate.split("-");
  return fy === ty ? `${fy}.${fm}–${tm}` : `${fy}.${fm}–${ty}.${tm}`;
}

/** 상세 화면에서 그대로 map 돌릴 수 있는 형태로 3분해를 펴준다. */
export function ecosystemBars(tech) {
  if (!tech?.ecosystem) return [];
  return ECOSYSTEM_SOURCES.filter(({ key }) => tech.ecosystem[key]).map(
    ({ key, label, unit }) => {
      const source = tech.ecosystem[key];
      return {
        key,
        label,
        // 응답의 score는 DW가 매긴 백분위다. 화면은 사다리 점수를 쓴다
        // (아래 ECOSYSTEM_ANCHORS 주석 참고). 원시 건수가 없을 때만 물러선다.
        score: ladderScore(source.raw, key) ?? source.score ?? 0,
        rawText: `${formatCount(source.raw)}${unit}`,
      };
    }
  );
}

/** 생태계 종합 점수 아래에 붙는, 몇 개를 평균냈는지 밝히는 한 줄. */
export function ecosystemNote(tech) {
  const count = ecosystemBars(tech).length;
  if (count === 0) return "생태계 지표가 아직 연결되지 않았습니다.";
  if (count === 1) return "아래 지표(0~100)를 그대로 씁니다.";
  return `읽을 코드·활동·질문 순으로 4:4:2를 준 ${count}개 지표의 평균입니다.`;
}


/* ==========================================================================
   생태계 점수 — 백분위가 아니라 고정 앵커 log 사다리
   ==========================================================================

   예전에는 세 지표를 각각 백분위로 바꿔 단순 평균했다. 두 가지가 문제였다.

   1) 백분위는 "우리가 모은 200개 중 몇 등"이라 학습자에게 뜻이 없다. 기술
      목록에 50개를 더 넣으면 아무것도 안 변한 기술의 점수가 움직인다.
   2) Stack Overflow 질문 수가 180일 중앙값 12건이다(200개 중 86개가 10건
      미만, 24개가 0건). 이 잡음이 점수의 1/3을 차지해서 R은 GitHub 두 지표
      평균 7.8점인데 SO 백분위 96점 덕에 종합 37점을 받고, ESLint는 SO가
      3건이라 93점짜리 GitHub 활동이 68점으로 깎였다.

   그래서 각 지표를 **자릿수 사다리**로 바꾼다. 앵커는 데이터가 아니라 고정
   상수라, 기술이 늘고 줄어도 남의 점수가 흔들리지 않는다. 원시 건수가
   Python 2,294만 대 Zendesk 2천처럼 네 자릿수 넘게 벌어지므로 log를 쓴다
   (선형 Min-Max는 200개 중 178개를 10점 아래로 눌러버린다).

     저장소 1천개 = 0점 … 1천만개 = 100점
     이슈·PR 1천건 = 0점 … 1천만건 = 100점
     SO 질문 1건 = 0점 … 1천건 = 100점

   가중치는 "배우는 사람에게 얼마나 도움이 되는가"로 나눈다 — 읽을 코드가
   있는가(저장소) 40%, 지금도 살아있는가(이슈·PR) 40%, 막혔을 때 답이
   있는가(SO) 20%. SO를 버리지는 않되 잡음이 점수를 흔들지 못하게 한다. */
export const ECOSYSTEM_ANCHORS = {
  githubRepo: { lo: 1e3, hi: 1e7, weight: 0.4 },
  githubActivity: { lo: 1e3, hi: 1e7, weight: 0.4 },
  stackoverflow: { lo: 1, hi: 1e3, weight: 0.2 },
};

/** 원시 건수 하나를 0~100 사다리 점수로. 앵커 밖은 잘라낸다. */
export function ladderScore(raw, key) {
  const anchor = ECOSYSTEM_ANCHORS[key];
  if (!anchor || typeof raw !== "number" || Number.isNaN(raw)) return null;
  const span = Math.log10(anchor.hi) - Math.log10(anchor.lo);
  const value = (100 * (Math.log10(Math.max(raw, 1)) - Math.log10(anchor.lo))) / span;
  return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10;
}

/**
 * 세 사다리 점수의 가중 평균. 응답에 없는 지표는 가중치째 빼고 남은 것만으로
 * 다시 나눈다 — 0점으로 채우면 "지표가 없다"가 "활동이 없다"로 둔갑한다.
 */
export function ecosystemComposite(tech) {
  const eco = tech?.ecosystem;
  if (!eco) return null;

  let sum = 0;
  let weight = 0;
  for (const [key, anchor] of Object.entries(ECOSYSTEM_ANCHORS)) {
    const score = ladderScore(eco[key]?.raw, key);
    if (score === null) continue;
    sum += anchor.weight * score;
    weight += anchor.weight;
  }
  return weight ? Math.round((sum / weight) * 10) / 10 : null;
}
