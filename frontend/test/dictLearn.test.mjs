// 기술 사전 펼침 패널의 `어떻게 배우나` 검사. 프레임워크 없이 그냥 돌린다:
//
//   node test/dictLearn.test.mjs
//
// 카드 네 장(공식 문서 1 + 영상 3)이 전부 썸네일을 갖는지, 자료가 없는 기술에서
// 빈 껍데기를 그리지 않는지 본다. 200개를 전부 돌려보는 이유는 docCard가
// new URL()로 도메인을 뽑기 때문이다 — 주소 하나만 깨져도 패널 전체가 죽는다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(here, f), "utf8");

class El {
  constructor() {
    this.innerHTML = ""; this.textContent = ""; this.hidden = false;
    this.dataset = {}; this.style = {};
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  appendChild(c) { return c; }
  addEventListener() {}
  setAttribute() {}
  getAttribute() { return null; }
  insertAdjacentHTML() {}
  querySelector() { return new El(); }
  querySelectorAll() { return []; }
}
const el = () => new El();
const window = { addEventListener() {} };
const document = {
  querySelector: el, querySelectorAll: () => [], createElement: el,
  addEventListener() {}, body: el(),
};
globalThis.window = window;
globalThis.document = document;

eval(read("preview-data.js"));
eval(read("preview-common.js"));
eval(read("preview-dict.js"));

const { PREVIEW } = window;
const panelOf = window.__previewPanel;

const count = (html, needle) => html.split(needle).length - 1;

let docs = 0, videos = 0, empty = 0;

for (const d of PREVIEW.items) {
  const html = panelOf(d);

  for (const bad of ["undefined", "NaN", "[object Object]"]) {
    assert.ok(!html.includes(bad), `${d.tech}: 패널 HTML에 ${bad}가 샜다`);
  }

  const cards = count(html, 'class="dict-learn__item"');
  const thumbs = count(html, 'class="dict-learn__thumb');
  assert.equal(cards, thumbs, `${d.tech}: 썸네일 없는 카드가 있다 (카드 ${cards} / 썸네일 ${thumbs})`);

  if (d.docs?.url) {
    docs++;
    assert.equal(count(html, "dict-learn__favicon"), 1, `${d.tech}: 문서 카드 파비콘이 없다`);
    assert.ok(html.includes(new URL(d.docs.url).host.replace(/^www\./, "")),
      `${d.tech}: 문서 카드에 도메인이 안 보인다`);
  }

  if (d.videos?.length) {
    videos++;
    assert.equal(count(html, "i.ytimg.com/vi/"), 3, `${d.tech}: 영상 썸네일이 3개가 아니다`);
    assert.equal(count(html, "dict-learn__duration"), 3, `${d.tech}: 재생시간 배지가 3개가 아니다`);
    for (const v of d.videos.slice(0, 3)) {
      assert.ok(html.includes(`https://www.youtube.com/watch?v=${v.id}`), `${d.tech}: ${v.id} 링크가 없다`);
    }
  }

  // 자료가 하나도 없으면 제목만 남은 빈 블록을 그리지 않는다.
  if (!d.docs?.url && !d.videos?.length) {
    empty++;
    assert.ok(!html.includes("어떻게 배우나"), `${d.tech}: 자료가 없는데 학습 블록을 그렸다`);
  } else {
    assert.ok(html.includes("어떻게 배우나"), `${d.tech}: 학습 블록이 없다`);
  }

  // 지워낸 추세선이 되살아나지 않았는지.
  assert.ok(!html.includes("dict-trend"), `${d.tech}: 추세선이 남아 있다`);
}

console.log(`통과 — 기술 ${PREVIEW.items.length}개 · 문서 카드 ${docs} · 영상 카드 ${videos}×3 · 자료 없음 ${empty}`);
