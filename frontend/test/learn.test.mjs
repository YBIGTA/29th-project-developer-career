// 학습 자료 정규화 검사. 프레임워크 없이 그냥 돌린다:
//
//   node test/learn.test.mjs
//
// 공식 문서 URL과 유튜브 URL 3개는 곧 팀원이 DB에 올린다. 올라오는 것이
// 주소뿐일 수 있어서, 제목·채널·조회수·재생시간이 전부 없는 경우가 이 화면의
// 기본값이 될 수 있다. 그때도 카드가 서는지를 여기서 못 박는다.
import assert from "node:assert/strict";
import {
  docHost,
  normalizeVideos,
  videoMeta,
  videoTitle,
  youtubeId,
} from "../lib/learn.js";

// ---- 주소에서 video id 뽑기 ------------------------------------------------
for (const [url, id] of [
  ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ["https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  // 재생목록처럼 뒤에 다른 값이 붙어도 v= 를 짚어야 한다.
  ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&t=30s", "dQw4w9WgXcQ"],
  ["https://www.youtube.com/watch?list=PL123&v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ["https://example.com/video", null],
  ["", null],
  [null, null],
]) {
  assert.equal(youtubeId(url), id, `youtubeId(${url})`);
}

// ---- 입력 형태 세 가지를 모두 받는다 ---------------------------------------
const mixed = normalizeVideos([
  { id: "aaaaaaaaaaa", title: "지금 형태", channel: "채널", views: 12345, seconds: 3661 },
  { url: "https://youtu.be/bbbbbbbbbbb" },
  "https://www.youtube.com/watch?v=ccccccccccc",
  { url: "https://example.com/not-youtube" }, // id를 못 뽑으면 버린다
]);
assert.deepEqual(mixed.map((v) => v.id), ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"]);

// 3개까지만. DB에 4개가 올라와도 화면 설계는 3장이다.
assert.equal(normalizeVideos(Array(6).fill("https://youtu.be/dQw4w9WgXcQ")).length, 3);
assert.deepEqual(normalizeVideos(null), []);
assert.deepEqual(normalizeVideos([{ url: null }, {}, "쓰레기"]), []);

// ---- 메타가 없을 때 화면이 비지 않는가 -------------------------------------
const bare = mixed[1];
assert.equal(videoTitle(bare, "Java", 1), "Java 입문 영상 2", "제목이 없으면 순번 이름");
assert.equal(videoMeta(bare), "", "채널·조회수가 없으면 빈 문자열 — 호출부가 줄을 안 그린다");
assert.equal(videoTitle(mixed[0], "Java", 0), "지금 형태", "제목이 있으면 그대로");
assert.equal(videoMeta(mixed[0]), "채널 · 조회 1만회");
// 조회수 0은 값이 없는 것과 다르다. 0회도 그려야 한다.
assert.equal(videoMeta({ views: 0 }), "조회 0회");

// ---- 문서 호스트 ----------------------------------------------------------
assert.equal(docHost({ url: "https://docs.oracle.com/en/java/" }), "docs.oracle.com");
assert.equal(docHost({ url: "https://www.rust-lang.org/learn" }), "rust-lang.org", "www.는 뗀다");
assert.equal(docHost({ url: "주소가아님" }), null, "깨진 주소면 카드를 만들지 않는다");
assert.equal(docHost(null), null);
assert.equal(docHost({}), null);

console.log("learn: video id 파싱 · 입력 3형태 · 메타 없음 · 문서 호스트 통과");
