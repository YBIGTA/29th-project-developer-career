// 지도 좌표 계산 검사. 프레임워크 없이 그냥 돌린다:
//
//   node test/mapPoints.test.mjs
//
// 여기 로직이 틀어져도 화면은 멀쩡해 보이고 점 위치만 슬쩍 어긋나기 때문에
// 눈으로는 못 잡는다. 실제 데이터(mockData.json 200개)로 확인한다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  pickMapPoints, makeAxisScale, makeRankScale, plot, labelFlipsUp,
  MAP_LIMIT, PLOT_PAD,
} from "../lib/mapPoints.js";

const here = dirname(fileURLToPath(import.meta.url));
const mock = JSON.parse(readFileSync(join(here, "..", "lib", "mockData.json"), "utf8"));
const items = mock.items;

let checks = 0;

// 1. 사분면별로 고르게 뽑는다. 수요 상위 N개를 그냥 자르면 한 사분면이
//    독식해 판 위쪽 좁은 띠에만 점이 쌓인다.
for (const limit of [30, MAP_LIMIT]) {
  const picked = pickMapPoints(items, limit);
  assert.equal(picked.length, limit, `${limit}개를 요청했는데 ${picked.length}개가 나왔다`);

  const byQuad = {};
  for (const d of picked) byQuad[d.quadrant] = (byQuad[d.quadrant] ?? 0) + 1;
  assert.ok(
    Object.keys(byQuad).length >= 4,
    `네 사분면이 다 대표되지 않는다: ${JSON.stringify(byQuad)}`
  );

  // 가장 많이 뽑힌 구역이 가장 적은 구역의 3배를 넘으면 "고르게"가 아니다.
  const counts = Object.values(byQuad);
  assert.ok(
    Math.max(...counts) <= Math.min(...counts) * 3,
    `사분면 배분이 치우쳤다: ${JSON.stringify(byQuad)}`
  );
  checks++;
}

// 2. 상한보다 적게 들어오면 그대로 돌려준다.
assert.equal(pickMapPoints(items.slice(0, 10), 60).length, 10);
checks++;

// 3. 뽑기는 결정적이어야 한다 — 렌더링할 때마다 점 구성이 바뀌면 안 된다.
assert.deepEqual(
  pickMapPoints(items, MAP_LIMIT).map((d) => d.skillCode),
  pickMapPoints(items, MAP_LIMIT).map((d) => d.skillCode)
);
checks++;

// 4. plot()은 항상 판 안쪽에 머문다. 벗어나면 점의 절반이 잘린다
//    (.gap-map__plane이 overflow: hidden).
for (const v of [-50, 0, 1, 50, 99, 100, 150, undefined, null]) {
  const p = plot(v);
  assert.ok(p >= PLOT_PAD && p <= 100 - PLOT_PAD, `plot(${v}) = ${p} 가 판을 벗어난다`);
}
// 50점은 사분면 경계선과 정확히 겹쳐야 한다.
assert.equal(plot(50), 50);
checks++;

// 5. 축 스케일은 사분면 경계(50)를 넘지 않는다. 넘으면 점의 색(사분면)과
//    위치가 어긋나 범례가 거짓말이 된다.
{
  const data = pickMapPoints(items, MAP_LIMIT);
  const scaleX = makeAxisScale(data.map((d) => d.ecosystemScore));
  for (const d of data) {
    const x = scaleX(d.ecosystemScore);
    if (d.ecosystemScore < 50) assert.ok(x < 50, `${d.tech}: ${d.ecosystemScore} -> ${x} 가 경계를 넘었다`);
    else assert.ok(x >= 50, `${d.tech}: ${d.ecosystemScore} -> ${x} 가 경계를 넘었다`);
  }
  checks++;
}

// 6. 순위 스케일은 동점에도 서로 다른 높이를 준다. 같은 높이가 되면 점이
//    한 줄에 가로로 쌓여 개별 기술을 집을 수 없다.
{
  const data = pickMapPoints(items, MAP_LIMIT);
  const yPos = makeRankScale(data);
  assert.equal(yPos.size, data.length, "높이를 못 받은 점이 있다");

  // 같은 밴드(50 위/아래) 안에서는 높이가 전부 달라야 한다.
  for (const band of [(v) => v < 50, (v) => v >= 50]) {
    const ys = data.filter((d) => band(d.demand)).map((d) => yPos.get(d.skillCode));
    assert.equal(new Set(ys).size, ys.length, "같은 밴드에 높이가 겹치는 점이 있다");
  }

  // 밴드를 넘나들지 않는다.
  for (const d of data) {
    const y = yPos.get(d.skillCode);
    if (d.demand < 50) assert.ok(y <= 46, `${d.tech}: 수요 ${d.demand} 인데 y ${y}`);
    else assert.ok(y >= 54, `${d.tech}: 수요 ${d.demand} 인데 y ${y}`);
  }
  checks++;
}

// 7. 바닥에 붙은 점만 이름표를 위로 뒤집는다.
assert.equal(labelFlipsUp(0), true);
assert.equal(labelFlipsUp(11), true);
assert.equal(labelFlipsUp(12), false);
assert.equal(labelFlipsUp(90), false);
assert.equal(labelFlipsUp(undefined), true);
checks++;

console.log(`mapPoints: ${checks}개 검사 통과`);
