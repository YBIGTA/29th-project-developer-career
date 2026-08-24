"use client";

import { formatDuration } from "@/lib/ecosystem";
import { docHost, normalizeVideos, videoMeta, videoThumb, videoTitle, videoUrl } from "@/lib/learn";

/**
 * 학습 자료 목록 — 공식 문서 1장 + 영상 3장.
 *
 * 두 종류가 같은 목록에 서므로 카드 모양을 하나로 쓴다. 값이 URL뿐이어도
 * 카드가 서게 하는 규칙은 lib/learn.js에 있다.
 *
 * prefix는 클래스 이름 앞머리다(components/TrendSpark.jsx와 같은 이유 —
 * globals.css와 mobile.css가 서로의 클래스를 모른다).
 */
export default function LearnList({ tech, prefix = "detail-panel" }) {
  const videos = normalizeVideos(tech.videos);
  const host = docHost(tech.docs);
  if (!host && !videos.length) return null;

  return (
    <ul className={`${prefix}__learn`}>
      {host && (
        <li>
          <a
            className={`${prefix}__learn-link`}
            href={tech.docs.url}
            target="_blank"
            rel="noopener noreferrer"
            title={tech.docs.note || undefined}
          >
            {/* 문서 카드에는 쓸 그림이 없다. 머리글자 타일을 깔고 그 위에 사이트
                파비콘을 얹는다. 못 받아오면 img가 스스로 지워지고 타일만 남는다. */}
            <span className={`${prefix}__learn-thumb ${prefix}__learn-thumb--doc`}>
              <span className={`${prefix}__learn-initial`}>{tech.tech.slice(0, 2)}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={`${prefix}__learn-favicon`}
                src={`https://${host}/favicon.ico`}
                alt=""
                loading="lazy"
                onError={(e) => e.currentTarget.remove()}
              />
            </span>
            <span className={`${prefix}__learn-body`}>
              <span className={`${prefix}__learn-kind`}>공식 문서</span>
              <span className={`${prefix}__learn-title`}>{tech.tech} 공식 문서</span>
              <span className={`${prefix}__learn-meta`}>{host}</span>
            </span>
          </a>
        </li>
      )}

      {videos.map((v, i) => {
        const meta = videoMeta(v);
        return (
          <li key={v.id}>
            <a
              className={`${prefix}__learn-link`}
              href={videoUrl(v.id)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className={`${prefix}__learn-thumb`}>
                {/* next/image를 쓰려면 i.ytimg.com과 문서 도메인 159곳을
                    next.config.mjs의 remotePatterns에 등록해야 한다. 저장소가
                    의존성 3개를 유지하고 있으므로 평범한 img로 둔다. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={videoThumb(v.id)} alt="" loading="lazy" />
                {typeof v.seconds === "number" && (
                  <span className={`${prefix}__learn-duration`}>{formatDuration(v.seconds)}</span>
                )}
              </span>
              <span className={`${prefix}__learn-body`}>
                <span className={`${prefix}__learn-kind`}>영상</span>
                <span className={`${prefix}__learn-title`}>{videoTitle(v, tech.tech, i)}</span>
                {meta && <span className={`${prefix}__learn-meta`}>{meta}</span>}
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
