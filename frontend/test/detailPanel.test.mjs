// 상세 패널이 배포본(components/DetailPanel.jsx)과 같은 것을 그리는지 검사한다.
// 프레임워크 없이 그냥 돌린다:
//
//   node test/detailPanel.test.mjs
//
// 미리보기는 정적 HTML이라 빌드도 린트도 이 파일을 봐주지 않는다. 200개 기술
// 전부를 세 탭에 걸쳐 그려보고, 문자열이 undefined/NaN으로 새는 곳이 없는지
// 확인한다 — innerHTML로 조립하는 코드에서 가장 조용히 깨지는 자리다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(here, f), "utf8");

// ---- 최소 DOM. preview-map.js가 실제로 만지는 것만 흉내낸다. --------------
class El {
  constructor(id = "") {
    this.id = id;
    this.innerHTML = "";
    this.textContent = "";
    this.hidden = false;
    this.dataset = {};
    this.children = [];
    this.style = {};
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(type, fn) { (this.handlers ??= {})[type] = fn; }
  setAttribute(k, v) { this.dataset[k] = v; }
  getAttribute() { return null; }
  contains() { return false; }
  // 패널은 매번 innerHTML을 통째로 갈아끼우므로, 하위 조회는 문자열에서 찾는다.
  querySelector(sel) { return sel === "#detail-close" ? new El() : null; }
  querySelectorAll() { return []; }
  focus() {}
  scrollIntoView() {}
}

const nodes = new Map();
const pick = (sel) => {
  if (!nodes.has(sel)) nodes.set(sel, new El(sel));
  return nodes.get(sel);
};

const window = {
  addEventListener() {},
  removeEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {} }),
};
const document = {
  querySelector: pick,
  querySelectorAll: () => [],
  createElement: () => new El(),
  addEventListener() {},
  body: new El("body"),
};
globalThis.window = window;
globalThis.document = document;

// ---- 실행 ---------------------------------------------------------------
eval(read("preview-data.js"));
eval(read("preview-common.js"));
eval(read("preview-map.js"));

const panel = pick("#detail-panel");
const { PREVIEW, PV } = window;

assert.match(panel.innerHTML, /기술을 선택하세요/, "선택 전에는 빈 상태를 그린다");

// 데이터 자체가 배포본과 같은 필드를 갖고 있는가.
for (const t of PREVIEW.items) {
  for (const k of ["postingsNote", "signals", "summary", "ecosystem", "demandRank", "trend"]) {
    assert.ok(t[k] != null, `${t.tech}: ${k}가 비었다 — preview-data.js를 다시 만들어야 한다`);
  }
  assert.equal(t.trend.months.length, t.trend.index.length, `${t.tech}: 추이 달 수와 값 수가 다르다`);
}

const clean = (html, tech) => {
  for (const bad of ["undefined", "NaN", "[object Object]"]) {
    assert.ok(!html.includes(bad), `${tech}: 패널 HTML에 ${bad}가 샜다`);
  }
};

let withVideos = 0;
for (const t of PREVIEW.items) {
  // 지도 위 점을 누른 것과 같은 상태를 만든 뒤 세 탭을 차례로 그린다.
  // 탭 전환은 렌더 후 붙는 핸들러가 하지만, 여기서는 렌더 결과만 본다.
  for (const tab of ["overview", "learn", "postings"]) {
    window.__previewSelect(t, tab);
    const html = panel.innerHTML;
    clean(html, `${t.tech}/${tab}`);
    assert.ok(html.includes(PV.esc(t.tech)), `${t.tech}: 이름이 안 보인다`);

    if (tab === "overview") {
      // 배포본 개요 탭의 블록들.
      for (const section of ["생태계 활동 추이", "이 자리에 있는 이유", "채용 공고 언급", "생태계 종합"]) {
        assert.ok(html.includes(section), `${t.tech}: '${section}' 블록이 없다`);
      }
      assert.ok(html.includes("Esc 키로 닫을 수 있습니다"), `${t.tech}: 각주가 없다`);
      // 배지 줄에서 없앤 공식 문서 알약.
      assert.ok(!html.includes("detail-panel__docs"), `${t.tech}: 없앤 공식 문서 알약이 되살아났다`);
      if (t.stack?.length) assert.ok(html.includes("함께 요구되는 기술"), `${t.tech}: 연관 기술이 없다`);
      assert.ok(!html.includes("지금 배운다면"), `${t.tech}: 없앤 조언 카드가 되살아났다`);
      // 생태계 3분해 막대는 응답에 있는 지표만 그린다.
      const bars = PV.ecosystemBars(t);
      for (const bar of bars) assert.ok(html.includes(bar.label), `${t.tech}: ${bar.label} 막대가 없다`);
    }

    if (tab === "learn" && (t.videos?.length || t.docs?.url)) {
      withVideos++;
      // 배지 줄의 공식 문서 알약을 없앴으므로, 문서로 가는 통로는 이 탭뿐이다.
      if (t.docs?.url) assert.ok(html.includes(t.docs.url), `${t.tech}: 공식 문서 카드가 없다`);
      if (t.videos?.length) {
        assert.equal(html.split("i.ytimg.com/vi/").length - 1, 3, `${t.tech}: 영상 썸네일이 3개가 아니다`);
      }
    }
  }
}

// 문서도 영상도 없는 기술만 학습 탭을 안 만든다. 영상만 없는 기술은 문서
// 카드 한 장 때문에 탭이 남아야 한다 — 알약을 없앤 뒤로 여기가 유일한 통로다.
const nothing = PREVIEW.items.find((t) => !t.videos?.length && !t.docs?.url);
window.__previewSelect(nothing, "learn");
assert.ok(!panel.innerHTML.includes(">학습<"), "자료가 없는데 학습 탭이 생겼다");
assert.ok(panel.innerHTML.includes("생태계 활동 추이"), "학습 탭이 없으면 개요로 되돌아와야 한다");

const docOnly = PREVIEW.items.find((t) => !t.videos?.length && t.docs?.url);
window.__previewSelect(docOnly, "learn");
assert.ok(panel.innerHTML.includes(">학습<"), "문서만 있는 기술에 학습 탭이 없다");
assert.ok(panel.innerHTML.includes(docOnly.docs.url), "문서만 있는 기술의 문서 카드가 없다");

// 주소만 있어도 카드가 완성되는가. 팀원이 DB에 URL만 올릴 수 있어서, 제목·채널·
// 조회수·재생시간이 전부 없는 경우가 이 화면의 기본값이 될 수 있다.
const urlOnly = {
  ...docOnly,
  docs: { url: "https://example.com/docs" },
  videos: [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    { url: "https://youtu.be/aaaaaaaaaaa" },
    { url: "https://www.youtube.com/embed/bbbbbbbbbbb" },
  ],
};
window.__previewSelect(urlOnly, "learn");
const bare = panel.innerHTML;
for (const id of ["dQw4w9WgXcQ", "aaaaaaaaaaa", "bbbbbbbbbbb"]) {
  assert.ok(bare.includes(`i.ytimg.com/vi/${id}/`), `주소만 있을 때 ${id} 썸네일이 없다`);
  assert.ok(bare.includes(`youtube.com/watch?v=${id}`), `주소만 있을 때 ${id} 링크가 없다`);
}
assert.ok(bare.includes("example.com"), "주소만 있을 때 문서 호스트가 안 보인다");
assert.ok(bare.includes("입문 영상 1"), "제목이 없을 때 순번 이름이 안 붙는다");
for (const bad of ["undefined", "NaN"]) {
  assert.ok(!bare.includes(bad), `주소만 있을 때 ${bad}가 샜다`);
}

// summary는 손으로 쓴 설명 한 문장 + 데이터로 조립한 통계 문장이다. 설명이
// 없는 기술도 통계 문장은 반드시 있어야 한다.
for (const t of PREVIEW.items) {
  assert.ok(t.summary.includes("활성 공고 "), `${t.tech}: 요약에 통계 문장이 없다`);
}

console.log(`통과 — 기술 ${PREVIEW.items.length}개 × 3탭, 학습 자료 ${withVideos}개 (주소만 있는 경우 포함)`);
