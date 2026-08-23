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
      list: [...list].sort((a, b) => b.demand - a.demand || a.tech.localeCompare(b.tech)),
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
 * x축(생태계)에는 쓰지 않는다. 동점이 훨씬 적고, x를 흔들면 "생태계 점수가
 * 같으면 같은 세로선에 선다"는 읽기가 깨진다.
 */
export function makeRankScale(items, key = "demand") {
  const positions = new Map();

  for (const band of [LOW_BAND, HIGH_BAND]) {
    const group = items
      .filter((item) =>
        band === LOW_BAND ? (item[key] ?? 0) < 50 : (item[key] ?? 0) >= 50
      )
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
// 판 안쪽 PLOT_PAD~(100-PLOT_PAD) 구간에 대응시킨다.
//
// 좌우 대칭이라 50점은 그대로 50%에 남는다 — 배경 사분면과 십자선이 그리는
// 50% 경계선과 어긋나지 않는 것이 중요하다.
export const PLOT_PAD = 4;

export function plot(value, pad = PLOT_PAD) {
  const v = Math.min(100, Math.max(0, value ?? 0));
  return pad + (v * (100 - 2 * pad)) / 100;
}

// 판 바닥에 가까운 점은 이름표를 위로 뒤집는다. 아래로 두면 이름이 잘린다.
export function labelFlipsUp(demand) {
  return (demand ?? 0) < 12;
}
