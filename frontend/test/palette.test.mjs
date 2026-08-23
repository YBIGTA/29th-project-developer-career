// 팔레트 명암비 검사. 프레임워크 없이 그냥 돌린다:
//
//   node test/palette.test.mjs
//
// preview.css의 :root 토큰을 직접 읽어 검사하므로, 색을 바꾸면 이 검사도 같이
// 따라간다. 테마를 뒤집을 때 가장 조용히 깨지는 것이 대비다 — 배경만 밝게
// 바꾸고 글자색을 안 따라 올리면 빌드도 린트도 통과하는데 글씨만 안 보인다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "preview.css"), "utf8");

const tokens = Object.fromEntries(
  [...css.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6});/g)].map((m) => [m[1], m[2]])
);

const channel = (c) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex) => {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

const t = (name) => {
  const v = tokens[name];
  assert.ok(v, `base.css에 ${name}이 없다`);
  return v;
};

const PAGE = t("--ink-950");   // 페이지 바탕
const CARD = t("--ink-900");   // 카드
const RAISED = t("--ink-800"); // 칩 / 트랙 / 툴팁

// 본문으로 읽히는 글자는 AA 4.5:1. 사분면 색은 글자가 아니라 점·스와치·굵은
// 라벨이라 큰 텍스트/도형 기준인 3:1을 쓴다 (형태로도 구분되므로 색만으로
// 정보를 나르지 않는다 — lib/quadrants.js 주석 참고).
const cases = [
  ["본문 / 페이지", t("--text-primary"), PAGE, 4.5],
  ["보조 / 페이지", t("--text-secondary"), PAGE, 4.5],
  ["흐린 / 페이지", t("--text-muted"), PAGE, 4.5],
  ["흐린 / 카드", t("--text-muted"), CARD, 4.5],
  ["흐린 / 칩", t("--text-muted"), RAISED, 4.5],
  ["강조 위 글자 / 강조", t("--accent-ink"), t("--accent"), 4.5],
  ["필수 / 페이지", t("--quad-essential"), PAGE, 3.0],
  ["선점 후보 / 페이지", t("--quad-early-mover"), PAGE, 3.0],
  ["희소가치 / 페이지", t("--quad-niche"), PAGE, 3.0],
  ["저관심 / 페이지", t("--quad-minimal"), PAGE, 3.0],
  ["성공 / 페이지", t("--status-good-text"), PAGE, 4.5],
  ["오류 / 페이지", t("--status-error-text"), PAGE, 4.5],
];

for (const [name, fg, bg, need] of cases) {
  const r = contrast(fg, bg);
  assert.ok(
    r >= need,
    `명암비 미달 — ${name}: ${r.toFixed(2)}:1 (기준 ${need}:1, ${fg} on ${bg})`
  );
}

// 네 사분면 색은 서로도 구별돼야 한다. 색만으로 정보를 나르지는 않지만,
// 두 색이 사실상 같아지면 범례가 거짓말이 된다.
const quads = ["--quad-essential", "--quad-early-mover", "--quad-niche", "--quad-minimal"];
for (let i = 0; i < quads.length; i++) {
  for (let j = i + 1; j < quads.length; j++) {
    assert.notEqual(t(quads[i]), t(quads[j]), `${quads[i]}와 ${quads[j]}가 같은 색이다`);
  }
}

// 지도 위에 뜨는 반투명 상자(툴팁 · 구역 설명)는 뒤의 점이 비친다. 가장 진한
// 점이 뒤에 깔린 최악의 경우에도 글자가 읽혀야 한다. 불투명도를 올리거나
// 바탕 토큰을 바꿀 때 여기가 먼저 깨진다.
const OVERLAY_ALPHA = 0.88; // globals.css의 color-mix(... 88%, transparent)와 같은 값
const blend = (fgHex, bgHex, a) => {
  const parse = (h) => [0, 2, 4].map((i) => parseInt(h.replace("#", "").slice(i, i + 2), 16));
  const [f, b] = [parse(fgHex), parse(bgHex)];
  const mix = f.map((v, i) => Math.round(v * a + b[i] * (1 - a)));
  return `#${mix.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};

const behind = [PAGE, ...quads.map(t)];
for (const [surface, name] of [[t("--ink-850"), "툴팁 · 구역 설명"]]) {
  for (const bg of behind) {
    const effective = blend(surface, bg, OVERLAY_ALPHA);
    for (const [fg, label, need] of [
      [t("--text-primary"), "본문", 4.5],
      [t("--text-muted"), "흐린 글씨", 4.5],
    ]) {
      const r = contrast(fg, effective);
      assert.ok(
        r >= need,
        `${name} 위 ${label}: ${r.toFixed(2)}:1 (기준 ${need}:1) — 뒤에 ${bg}가 깔렸을 때`
      );
    }
  }
}

console.log(
  `palette: ${cases.length}개 명암비 + 사분면 색 구별 + 반투명 상자 가독성 통과`
);
