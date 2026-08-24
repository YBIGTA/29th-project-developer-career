// 학습 자료(공식 문서 · 유튜브 영상)를 화면에 올리기 전에 다듬는다.
// 지도 상세 패널(DetailPanel)과 기술 사전 펼침 패널(DictionaryClient)이 같은
// 필드를 읽으므로 여기서 한 번만 정의한다.
//
// **URL 하나만 있어도 카드가 완성되게 만든다.** 이 값들은 곧 DB에서 오는데,
// 올라가는 것이 주소뿐일 수 있다. 그래서 화면에 꼭 필요한 것은 전부 주소에서
// 뽑는다 — 영상 썸네일은 video id로, 문서 카드의 이름과 파비콘은 호스트로.
// 제목·채널·조회수·재생시간은 있으면 얹고, 없으면 그 줄을 그리지 않는다.

// 확장자를 붙여 둔다 — test/learn.test.mjs가 번들러 없이 node로 바로 불러온다.
import { formatCount } from "./ecosystem.js";

const YOUTUBE_ID = /(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/;

export function youtubeId(url) {
  return (String(url ?? "").match(YOUTUBE_ID) || [])[1] || null;
}

/**
 * 영상 목록을 { id, title?, channel?, views?, seconds? } 형태로 맞춘다.
 * 입력은 {id,...} · {url,...} · "https://..." 셋 다 받는다.
 * id를 못 뽑는 항목은 썸네일도 링크도 만들 수 없으므로 버린다.
 */
export function normalizeVideos(videos, limit = 3) {
  return (videos ?? [])
    .map((v) => {
      const item = typeof v === "string" ? { url: v } : v ?? {};
      const id = item.id || youtubeId(item.url);
      return id ? { ...item, id } : null;
    })
    .filter(Boolean)
    .slice(0, limit);
}

/** 문서 카드에 쓸 도메인. 주소가 깨져 있으면 카드를 만들지 않는다. */
export function docHost(docs) {
  try {
    return docs?.url ? new URL(docs.url).host.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

export const videoUrl = (id) => `https://www.youtube.com/watch?v=${id}`;
export const videoThumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

/** 제목이 없으면 주소만 있는 것이다. 순번으로 최소한의 이름을 만든다 — 카드가
 *  전부 "영상"이면 무엇을 눌렀는지 되짚을 수 없다. */
export const videoTitle = (video, tech, index) =>
  video.title || `${tech} 입문 영상 ${index + 1}`;

/** 채널·조회수는 둘 다 없을 수 있다. 빈 줄을 그리지 않도록 문자열로 합쳐 준다. */
export function videoMeta(video) {
  return [
    video.channel,
    typeof video.views === "number" ? `조회 ${formatCount(video.views)}회` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
