// 상세 패널에 실리는 부가 정보(공식 문서 / 추천 영상 / 월별 생태계 추이)를
// API 응답에 덧붙인다. lib/notes.js의 withNotes()와 같은 방식이다 — 기술
// 이름으로 조인하고, 자료가 없는 기술은 조용히 넘어간다. 그래서 mockData든
// 실제 API 응답이든(배포 API는 200개가 아니라 164개를 내려준다) 똑같이 돈다.
//
// techExtras.json은 scripts/build_tech_extras.py가 저장소 루트의 CSV 네 개에서
// 만든다. 손으로 고치지 말고 스크립트를 다시 돌려라.
//
// trend.index가 무엇인지는 build_tech_extras.py 상단 주석에 있다. 요약하면,
// 월별 원시 건수가 아니라 **그 달 200개 기술 합계에서 차지하는 비중**을 첫 달
// 100으로 잡은 지수다. 원시값을 쓰면 GitHub는 거의 전부 상승, Stack Overflow는
// 거의 전부 하락으로 나와 개별 기술 정보가 사라지기 때문이다.
import techExtras from "./techExtras.json";

const { months, techs } = techExtras;

/** 마지막 두 달의 지수 변화율. 지수가 이미 두 계열을 합친 값이라 증감도 하나다. */
function monthOverMonth(index) {
  if (!index || index.length < 2) return null;
  const to = index[index.length - 1];
  const from = index[index.length - 2];
  if (!from) return null;
  return {
    pct: Math.round((to / from - 1) * 1000) / 10,
    value: to,
    prevValue: from,
    month: months[months.length - 1],
    prevMonth: months[months.length - 2],
  };
}

/** getGapMapData()가 받아온 응답에 docs / videos / trend를 덧붙인다. */
export function withExtras(gapMapData) {
  if (!gapMapData?.items) return gapMapData;

  const items = gapMapData.items.map((item) => {
    const extra = techs[item.tech];
    if (!extra) return item;

    return {
      ...item,
      ...(extra.docs && { docs: extra.docs }),
      ...(extra.videos && { videos: extra.videos }),
      ...(extra.index && {
        trend: {
          months,
          index: extra.index,
          github: extra.github,
          stackoverflow: extra.stackoverflow ?? null,
          hasStackoverflow: extra.hasStackoverflow,
          delta: monthOverMonth(extra.index),
        },
      }),
    };
  });

  return { ...gapMapData, items };
}
