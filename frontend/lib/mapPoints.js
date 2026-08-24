// 지도에 찍는 점의 상한.
//
// 200개를 전부 찍으면 점이 서로 붙어 개별 기술을 집을 수 없고, 그렇다고
// 수요 상위 60개만 뽑으면 더 나빠진다 — 수요가 백분위 순위라 상위 60개는
// y값이 전부 70~100 구간이고, 판 위쪽 좁은 띠에 겹쳐 쌓인다.
//
// 그래서 상위 N개가 아니라 **사분면별로 고르게** 뽑는다. 60개면 네 구역에서
// 15개씩이고, 점이 판 전체에 퍼져 사분면이 사분면으로 읽힌다.
export const MAP_LIMIT = 60;

// 화면에서 고를 수 있는 표시 개수. 마지막 항목은 "전체"를 뜻한다.
export const MAP_LIMIT_STEPS = [30, 60, Infinity];

// 이름표를 그릴 수 있는 상한. 이보다 많으면 글자가 서로 겹쳐 오히려 못 읽는다.
// 그 구간에서는 점만 그리고 이름은 hover 툴팁과 아래 목록으로 넘긴다.
/**
 * 사분면별로 고르게 뽑는다.
 *
 * 각 사분면을 수요 내림차순으로 세워 놓고 한 개씩 돌아가며 집는다. 어떤
 * 사분면이 먼저 바닥나면 그 몫은 자동으로 남은 사분면들에 돌아가므로,
 * "15개씩이 불가능하면 많은 쪽을 더 띄운다"가 별도 분기 없이 성립한다.
 * (직군 필터를 걸면 한 사분면이 15개가 안 되는 일이 실제로 생긴다.)
 *
 * 사분면 순회 순서는 크기 내림차순으로 고정한다 — 마지막 한 자리를 누가
 * 가져갈지가 입력 순서에 따라 흔들리지 않게 하기 위해서다.
 */
export function pickMapPoints(items, limit = MAP_LIMIT) {
  if (items.length <= limit) return items;

  const groups = new Map();
  for (const item of items) {
    const key = item.quadrant ?? "미분류";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const queues = [...groups.entries()]
    .map(([key, list]) => ({
      key,
      // "선점 후보" 큐만 정렬 키가 다르다. 그 사분면(수요 낮음 · 생태계 높음)을
      // 수요 내림차순으로 뽑으면 사분면 경계에 가장 가까운 기술이 위로 올라와,
      // 생태계 비중이 줄고 있는 Next.js·GitHub Copilot 같은 것이 "선점 후보"로
      // 찍힌다. earlyMoverScore는 서버가 그 사분면에만 실어 보내는 값이고
      // (생태계 상승세 · 군집 근거 · 회사 확산 범위), 게이트를 통과하지 못한
      // 기술은 -1이라 자동으로 뒤로 밀린다 — 빠지는 게 아니라 뒤로만 간다.
      //
      // 다른 세 사분면에는 이 값이 없다. `?? 0`으로 전부 무승부가 되어 두 번째
      // 키인 demand가 순서를 정하므로, 지금까지와 똑같이 동작한다.
      list: [...list].sort(
        (a, b) =>
          (b.earlyMoverScore ?? 0) - (a.earlyMoverScore ?? 0) ||
          b.demand - a.demand ||
          a.tech.localeCompare(b.tech)
      ),
    }))
    .sort((a, b) => b.list.length - a.list.length || a.key.localeCompare(b.key));

  const picked = [];
  let round = 0;
  while (picked.length < limit) {
    let tookAny = false;
    for (const q of queues) {
      if (picked.length >= limit) break;
      if (round >= q.list.length) continue;
      picked.push(q.list[round]);
      tookAny = true;
    }
    if (!tookAny) break;
    round += 1;
  }
  return picked;
}

/** 사전에서 "지도 미표시"를 판정할 때 쓴다. */
export function mapCodeSet(items, limit = MAP_LIMIT) {
  return new Set(pickMapPoints(items, limit).map((d) => d.skillCode));
}

// 표시용 축 스케일 — 지금 화면에 있는 점들만 놓고 Min-Max로 다시 편다.
//
// 왜 필요한가: 실제 값이 고르게 흩어져 있지 않다. 예를 들어 60개를 뽑았을 때
// 수요는 30~50과 90~100 두 덩어리로 갈리고, 그 사이 50~90 구간이 통째로 빈다.
// 원값 그대로 찍으면 점이 두 곳에 뭉쳐 개별 기술을 집을 수 없다.
//
// 왜 50을 고정하는가: 50은 사분면 경계선이다. 축 전체를 한 번에 Min-Max로 펴면
// 점이 경계선을 넘나들어 색(사분면)과 위치가 어긋난다. 그래서 50 아래 값은
// 50 아래에서만, 50 이상 값은 50 위에서만 편다. 사분면은 그대로 유지된다.
//
// 대신 축 위의 거리는 점수 차이에 비례하지 않게 된다. 정확한 점수는 툴팁과
// 상세 패널이 숫자로 보여주고, 축 눈금에는 "낮음/높음"만 적어 둔 이유다.
const LOW_BAND = [0, 46];
const HIGH_BAND = [54, 100];

function spread(value, min, max, [lo, hi]) {
  if (max <= min) return (lo + hi) / 2;
  return lo + ((value - min) * (hi - lo)) / (max - min);
}

/** 값 배열을 받아 "원값 -> 표시 좌표(0~100)" 함수를 만든다. */
export function makeAxisScale(values) {
  const low = values.filter((v) => v < 50);
  const high = values.filter((v) => v >= 50);
  const lowMin = Math.min(...low);
  const lowMax = Math.max(...low);
  const highMin = Math.min(...high);
  const highMax = Math.max(...high);

  return (value) => {
    const v = value ?? 0;
    if (v < 50) {
      return low.length ? spread(v, lowMin, lowMax, LOW_BAND) : LOW_BAND[1];
    }
    return high.length ? spread(v, highMin, highMax, HIGH_BAND) : HIGH_BAND[0];
  };
}

/**
 * 순위 기반 y 스케일 — 항목마다 서로 다른 높이를 준다.
 *
 * makeAxisScale은 "값 -> 위치" 함수라, 값이 같으면 위치도 같을 수밖에 없다.
 * 그런데 채용 수요는 공고 건수의 백분위이고 건수가 작은 정수라 동점이 대량으로
 * 생긴다. 실측(164개 기술)으로 서로 다른 demand 값은 80개뿐이고, 실제로 찍는
 * 60개 중 28개(47%)가 동점이었다. 동점이면 y가 완전히 같아 이름표가 한 줄에
 * 가로로 겹쳐 못 읽는다. 특히 중간선 바로 아래(demand 38~48)에 큰 동점 무리가
 * 몰린다 — pickMapPoints가 사분면별 수요 상위 K개를 뽑기 때문이다.
 *
 * 그래서 y축만 "항목 -> 위치" 맵으로 바꾼다. 값이 같아도 순위가 다르면 다른
 * 높이를 받는다. 대신 축 위의 거리는 점수 차이에 비례하지 않는다 — 원래도
 * 백분위라 비례하지 않았고, 축에 눈금이 없으며(낮음/높음만), 진짜 건수와
 * 백분위는 툴팁과 상세 패널이 숫자로 보여준다.
 *
 * 50 아래/위를 따로 순위 매겨 각자의 띠 안에서만 편다. makeAxisScale과 같은
 * 이유다 — 점이 사분면 경계선을 넘으면 색과 위치가 어긋난다.
 *
 * x축(생태계)에도 쓴다. 예전에는 "x를 흔들면 생태계 점수가 같으면 같은
 * 세로선에 선다는 읽기가 깨진다"는 이유로 y축에만 썼는데, 생태계 점수가
 * 백분위에서 연속적인 사다리 값으로 바뀌면서 x축 동점이 사실상 사라져 그
 * 읽기를 지킬 대상이 없어졌다. 반대로 사다리 점수는 절대값이라 가운데가
 * 두꺼워(실측 표준편차 26 -> 20) 그대로 찍으면 판 양 끝이 빈다.
 *
 * isHigh는 어느 띠에 넣을지 정하는 판정이다. 기본값은 예전과 같은 "50 이상"
 * 이고, x축에는 사분면 분류를 그대로 읽는 판정을 넘긴다 — 사다리 점수의
 * 경계는 50이 아니라 중앙값이기 때문이다(lib/ecosystemScore.js).
 */
export function makeRankScale(items, key = "demand", isHigh = (item) => (item[key] ?? 0) >= 50) {
  const positions = new Map();

  for (const band of [LOW_BAND, HIGH_BAND]) {
    const group = items
      .filter((item) => (band === LOW_BAND ? !isHigh(item) : isHigh(item)))
      // 같은 값끼리의 순서는 생태계 점수, 그다음 이름으로 고정한다.
      // 렌더링할 때마다 위아래가 뒤바뀌지 않게 하기 위해서다.
      .sort(
        (a, b) =>
          (a[key] ?? 0) - (b[key] ?? 0) ||
          a.ecosystemScore - b.ecosystemScore ||
          a.tech.localeCompare(b.tech)
      );

    const [lo, hi] = band;
    group.forEach((item, i) => {
      positions.set(
        item.skillCode,
        group.length === 1 ? lo : lo + ((hi - lo) * i) / (group.length - 1)
      );
    });
  }

  return positions;
}

/** 스케일이 아직 없을 때(로딩 등) 쓰는 항등 함수. */
export const identityScale = (value) => value ?? 0;

// 점을 0%/100% 자리에 그대로 찍으면 원의 절반이 판 밖으로 잘린다
// (.gap-map__plane / .mv-map__plane 이 overflow: hidden). 그래서 0~100 점수를
// 판 안쪽으로 들여 찍는다.
//
// **여백은 백분율이 아니라 픽셀이다.** 비껴가야 하는 것들(점 자신, 모서리의
// 구역 이름표)이 전부 픽셀 크기이고 판이 커지든 작아지든 변하지 않기 때문이다.
// 백분율로 주면 판이 작아질수록 여백만 같이 줄어 가려진다.
//
// 좌우/상하 대칭이라 50점은 판 크기와 무관하게 정확히 50%에 남는다 — 배경
// 사분면과 십자선이 그리는 50% 경계선과 어긋나지 않는 것이 중요하다.
//   pad + (크기 - 2*pad) * 0.5 = 크기/2
export const PLOT_PAD = 14; // 점 반지름(7.5px) + 여유

// 데스크톱 지도의 **세로**에만 쓴다.
//
// 데스크톱은 구역 이름표(.gap-map__corner)가 판 안쪽 12px 자리에 약 30px 높이로
// 앉아 있고, 눌러야 하는 컨트롤이라 점보다 위(z-index 4)에 둔다. 그래서 점이
// 그 자리를 피해야 한다 — 12 + 30 + 7.5(점 반지름) + 여유.
//
// 가로는 이 값을 쓰지 않는다. 세로에서 이미 이름표를 비껴가므로, 가로까지
// 이름표 너비(약 96px)만큼 들이면 판만 좁아지고 얻는 게 없다.
//
// 모바일(.mv-map__corner)은 이름표도 누르면 구역 설명이 뜨는 버튼이지만, 점
// **아래**(z-index 1 < 점의 2)에 깔아 이 문제가 없다 — 겹치면 점이 이긴다.
// 모바일 판은 320px로 낮아 여기서 50px을 들이면 손해가 크다.
export const PLOT_PAD_CORNER = 50;

/**
 * 0~100 점수를 판 위의 CSS 길이로 바꾼다. left / bottom에 그대로 넣는다.
 * 반환값은 숫자가 아니라 calc() 문자열이다 — `%`를 덧붙이면 안 된다.
 */
export function plot(value, pad = PLOT_PAD) {
  // `value ?? 0`으로는 NaN이 통과한다. calc() 안에 NaN이 들어가면 선언 자체가
  // 무효라 브라우저가 통째로 버리고, 점이 판 구석에 쌓인다.
  const v = Math.min(100, Math.max(0, Number(value) || 0));
  return `calc(${pad}px + (100% - ${pad * 2}px) * ${v / 100})`;
}

// 판 바닥에 가까운 점은 이름표를 위로 뒤집는다. 아래로 두면 이름이 잘린다.
export function labelFlipsUp(demand) {
  return (demand ?? 0) < 12;
}
