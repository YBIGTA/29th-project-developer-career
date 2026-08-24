// 사전 검색이 "이름이 정확히 맞으면 그것만" 규칙을 지키는지 검사한다.
// 프레임워크 없이 그냥 돌린다:
//
//   node test/dictSearch.test.mjs
//
// 검색 대상 문자열(haystack)에는 설명 문장과 연관 기술까지 들어 있다. 그래서
// 이름으로 검색해도 그 이름을 언급하는 표제어가 전부 걸린다 — 연관 기술 칩을
// 누르면 그 이름이 그대로 검색어가 되므로 특히 자주 겪는다. 규칙이 조용히
// 풀리면 결과가 다시 불어나기만 할 뿐 화면은 멀쩡해 보인다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(here, f), "utf8");

globalThis.window = {};
eval(read("preview-data.js"));
const items = globalThis.window.PREVIEW.items;

// preview-dict.js의 정의를 그대로 옮긴 것이다. 저쪽은 IIFE라 꺼내 쓸 수 없다.
// 두 곳이 어긋나면 아래 "실제 소스와 같은가" 검사가 잡는다.
const haystack = (d) => [
  d.tech, d.category, d.kind, ...(d.aliases ?? []), ...(d.roles ?? []),
  d.summary, ...(d.stack ?? []),
].filter(Boolean).join(" ").toLowerCase();

const isExactName = (d, q) =>
  d.tech.toLowerCase() === q ||
  (d.aliases ?? []).some((alias) => alias.toLowerCase() === q);

const search = (raw) => {
  const q = raw.trim().toLowerCase();
  const hits = items.filter((d) => !q || haystack(d).includes(q));
  const exact = q ? hits.filter((d) => isExactName(d, q)) : [];
  return exact.length ? exact : hits;
};

let checks = 0;

// 1. 기술 이름을 그대로 치면 그 하나만 나온다.
for (const name of ["React", "Python", "Kubernetes", "Go", "Docker"]) {
  const broad = items.filter((d) => haystack(d).includes(name.toLowerCase()));
  const rows = search(name);
  assert.equal(rows.length, 1, `"${name}" 검색에 ${rows.length}개가 나왔다`);
  assert.equal(rows[0].tech, name, `"${name}" 검색에 ${rows[0].tech}가 나왔다`);
  // 규칙이 실제로 일을 하고 있는지 — 원래는 여러 개가 걸리던 검색어여야 한다.
  assert.ok(broad.length > 1, `"${name}"은 애초에 하나만 걸려서 검사가 무의미하다`);
  checks += 3;
}

// 2. 별칭도 이름으로 친다. "K8s"는 Kubernetes 하나여야 한다.
const k8s = search("K8s");
assert.equal(k8s.length, 1, `"K8s" 검색에 ${k8s.length}개가 나왔다`);
assert.equal(k8s[0].tech, "Kubernetes");
checks += 2;

// 3. 대소문자는 무시한다.
assert.deepEqual(search("react").map((d) => d.tech), ["React"]);
assert.deepEqual(search("  REACT  ").map((d) => d.tech), ["React"]);
checks += 2;

// 4. 이름이 아닌 검색어는 좁히지 않는다. 넓은 검색은 넓게 남아야 한다 —
//    "데이터"로 59개가 걸리는 것은 버그가 아니라 그 말이 넓기 때문이다.
for (const word of ["데이터", "배포"]) {
  const rows = search(word);
  const broad = items.filter((d) => haystack(d).includes(word));
  assert.equal(rows.length, broad.length, `"${word}"가 이름도 아닌데 좁혀졌다`);
  checks += 1;
}

// 5. 아무것도 안 쳤으면 전부 나온다.
assert.equal(search("").length, items.length);
assert.equal(search("   ").length, items.length);
checks += 2;

// 6. 실제 소스와 같은 규칙인가. 위 정의는 preview-dict.js에서 옮겨 적은
//    것이라, 저쪽이 바뀌면 이 검사가 거짓으로 통과할 수 있다.
const dictSrc = read("preview-dict.js");
for (const marker of [
  "const isExactName = (d, q) =>",
  "d.tech.toLowerCase() === q ||",
  "const exact = q ? hits.filter((d) => isExactName(d, q)) : [];",
  "const rows = (exact.length ? exact : hits).filter((d) =>",
]) {
  assert.ok(dictSrc.includes(marker),
    `preview-dict.js에서 이 줄이 사라졌다 — 이 검사가 무의미해진다:\n  ${marker}`);
  checks += 1;
}

console.log(`dictSearch.test.mjs — ${checks}개 검사 통과`);
