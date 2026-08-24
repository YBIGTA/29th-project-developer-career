// 지도의 점이 판 안쪽 어디에 앉는지 검사한다. 프레임워크 없이 그냥 돌린다:
//
//   node test/mapPlacement.test.mjs
//
// 여백을 백분율로 주면 판이 낮아질수록 여백도 같이 줄어, 모서리의 구역
// 이름표(.gap-map__corner — 판 안쪽 12px에 약 30px 높이로 고정) 뒤로 점이
// 숨는다. 이름표가 점 위에 오는 것은 의도된 것이므로(preview.css 주석 참고)
// 점이 그 자리를 피하는 수밖에 없다.
//
// 눈으로는 판을 좁혀봐야 알 수 있고, 좁힌 화면을 매번 열어보지는 않는다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(here, f), "utf8");

// preview-map.js는 IIFE라 좌표 헬퍼를 꺼내 쓸 수 없다. 정의 블록만 잘라 돌린다.
const src = read("preview-map.js");
const from = src.indexOf("const PAD_X");
const to = src.indexOf("\n", src.indexOf("const posY"));
assert.ok(from > 0 && to > from, "preview-map.js에서 좌표 헬퍼를 찾지 못했다");
const { PAD_X, PAD_Y, posX, posY } = new Function(
  `${src.slice(from, to + 1)}; return { PAD_X, PAD_Y, posX, posY };`
)();

// calc(Apx + (100% - Bpx) * F) 를 주어진 판 크기에서 실제 px로 푼다.
const px = (css, size) => {
  const m = /^calc\((\d+)px \+ \(100% - (\d+)px\) \* ([\d.]+)\)$/.exec(css);
  assert.ok(m, `예상한 모양이 아니다: ${css}`);
  return Number(m[1]) + (size - Number(m[2])) * Number(m[3]);
};

// --plot-h: clamp(340px, calc(100dvh - 350px), 520px) — 양 끝과 중간에서 본다.
const HEIGHTS = [340, 430, 520];
const WIDTHS = [560, 780, 1040];

let checks = 0;

// 1. 이름표를 확실히 비껴가는가. 12(안쪽 여백) + 30(이름표 높이) + 7.5(점 반지름).
const CORNER_CLEARANCE = 49.5;
assert.ok(PAD_Y >= CORNER_CLEARANCE,
  `PAD_Y가 ${PAD_Y}px이라 이름표(${CORNER_CLEARANCE}px)를 비껴가지 못한다`);
checks += 1;

// 2. **판 높이가 변해도 여백은 그대로다.** 이게 이 수정의 핵심이다 —
//    백분율이면 340px 판에서 여백이 절반 이하로 줄어 점이 다시 숨는다.
for (const h of HEIGHTS) {
  assert.equal(px(posY(0), h), PAD_Y, `판 높이 ${h}px에서 아래쪽 여백이 달라졌다`);
  assert.equal(px(posY(100), h), h - PAD_Y, `판 높이 ${h}px에서 위쪽 여백이 달라졌다`);
  checks += 2;
}
for (const w of WIDTHS) {
  assert.equal(px(posX(0), w), PAD_X, `판 너비 ${w}px에서 왼쪽 여백이 달라졌다`);
  assert.equal(px(posX(100), w), w - PAD_X, `판 너비 ${w}px에서 오른쪽 여백이 달라졌다`);
  checks += 2;
}

// 3. **50점은 정확히 한가운데 남는다.** 50은 사분면 경계선이고, 판은 그 자리에
//    십자선을 그린다. 여백이 좌우/상하 대칭이라야 어긋나지 않는다.
for (const h of HEIGHTS) {
  assert.equal(px(posY(50), h), h / 2, `판 높이 ${h}px에서 50점이 한가운데가 아니다`);
  checks += 1;
}
for (const w of WIDTHS) {
  assert.equal(px(posX(50), w), w / 2, `판 너비 ${w}px에서 50점이 한가운데가 아니다`);
  checks += 1;
}

// 4. 순서가 뒤집히지 않는다. 점수가 크면 항상 더 위/오른쪽이다.
for (const [fn, size] of [[posY, 430], [posX, 780]]) {
  let prev = -Infinity;
  for (let v = 0; v <= 100; v += 5) {
    const at = px(fn(v), size);
    assert.ok(at > prev, `${v}점이 앞 점수보다 뒤로 갔다`);
    prev = at;
  }
  checks += 1;
}

// 5. 범위 밖 값은 판 안에 묶인다.
for (const bad of [-40, 140, null, undefined, NaN]) {
  const at = px(posY(bad), 430);
  assert.ok(at >= PAD_Y && at <= 430 - PAD_Y, `${bad}이(가) 판 밖으로 나갔다: ${at}`);
  checks += 1;
}

// 6. 판 안쪽 여백이 없으면 점의 절반이 잘린다(.gap-map__plane은 overflow: hidden).
assert.ok(PAD_X >= 7.5, `PAD_X가 ${PAD_X}px이라 가장자리 점이 잘린다`);
checks += 1;

console.log(`mapPlacement.test.mjs — ${checks}개 검사 통과`);
