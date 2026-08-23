"use client";

import { useState } from "react";
import { getQuadrantMeta } from "@/lib/quadrants";
import { ecosystemBars, ecosystemNote, formatCount } from "@/lib/ecosystem";
import { useTechPostings } from "@/lib/useTechPostings";

function ExternalIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" width="12" height="12">
      <path
        d="M6 3.4h6.6V10M12.6 3.4 3.6 12.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PostingList({ postings, loading, techName }) {
  if (loading) {
    return <div className="detail-panel__postings-status">공고를 불러오는 중입니다…</div>;
  }

  if (!postings.length) {
    return (
      <div className="detail-panel__postings-status">
        {techName}을(를) 요구하는 공고를 아직 찾지 못했습니다.
      </div>
    );
  }

  return (
    <ul className="detail-panel__postings">
      {postings.map((p, i) => (
        <li className="detail-panel__posting" key={`${p.company}-${p.title}-${i}`}>
          <div className="detail-panel__posting-company">{p.company}</div>
          <div className="detail-panel__posting-title">{p.title}</div>
          <div className="detail-panel__posting-meta">
            {[p.location, p.employmentType, p.publishedAt].filter(Boolean).join(" · ")}
          </div>
          {p.applyUrl && (
            <a
              className="detail-panel__posting-link"
              href={p.applyUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              공고 열기
              <ExternalIcon />
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

/** 1842초 -> "30분", 7341초 -> "2시간 2분". */
function formatDuration(seconds) {
  const total = Math.round(seconds / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h}시간 ${m}분` : `${m}분`;
}

const SPARK_W = 100;
const SPARK_H = 44;
const SPARK_PAD = 5;

/**
 * 최근 8개월 생태계 활동 추이.
 *
 * 그리는 값은 원시 건수가 아니라 점유율 지수다(lib/techExtras.js 참고).
 * 원시값을 쓰면 8개월간 GitHub 전체가 +162%, Stack Overflow 전체가 -69%
 * 움직인 탓에, 개별 기술과 무관하게 GitHub는 거의 다 상승, SO는 거의 다
 * 하락으로 나온다.
 *
 * viewBox를 preserveAspectRatio="none"으로 늘려 쓰므로 선에는
 * vector-effect="non-scaling-stroke"를 준다. 같은 이유로 마지막 값 표시는
 * 원이 아니라 세로 선이다 — 원은 가로로 늘어나 찌그러진다.
 */
function TrendSpark({ trend }) {
  const { months, index, github, stackoverflow, hasStackoverflow, delta } = trend;

  // 기준선 100이 항상 판 안에 들어오게 범위를 잡는다. 그래야 "100 위 = 시장
  // 평균보다 빨리 큰다"가 눈으로 읽힌다.
  const lo = Math.min(...index, 100);
  const hi = Math.max(...index, 100);
  const span = hi - lo;
  const yOf = (v) =>
    span === 0
      ? SPARK_H / 2
      : SPARK_H - SPARK_PAD - ((v - lo) / span) * (SPARK_H - SPARK_PAD * 2);
  const xOf = (i) => (index.length === 1 ? SPARK_W / 2 : (i / (index.length - 1)) * SPARK_W);

  const last = index[index.length - 1];
  const rising = last >= 100;
  const stroke = rising ? "var(--status-good-text)" : "var(--status-error-text)";
  const points = index.map((v, i) => `${xOf(i).toFixed(2)},${yOf(v).toFixed(2)}`).join(" ");

  const rawText = [
    `GitHub 이슈·PR ${formatCount(github[github.length - 1])}건`,
    hasStackoverflow
      ? `Stack Overflow ${formatCount(stackoverflow[stackoverflow.length - 1])}건`
      : null,
  ]
    .filter(Boolean)
    .join(" + ");

  return (
    <div className="detail-panel__trend">
      <div className="detail-panel__trend-head">
        <span className="detail-panel__section-title">생태계 활동 추이</span>
        <span className="detail-panel__trend-range">
          {months[0]} → {months[months.length - 1]}
        </span>
      </div>

      <div className="detail-panel__trend-body">
        <svg
          className="detail-panel__spark"
          viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
          preserveAspectRatio="none"
          role="img"
        >
          <title>
            {`${months[0]} 대비 ${months[months.length - 1]} 지수 ${Math.round(last)}, ${
              rising ? "기준선 위" : "기준선 아래"
            }`}
          </title>
          <line
            x1="0"
            x2={SPARK_W}
            y1={yOf(100)}
            y2={yOf(100)}
            stroke="var(--line-strong)"
            strokeWidth="1"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points={points}
            fill="none"
            stroke={stroke}
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={SPARK_W}
            x2={SPARK_W}
            y1={yOf(last) - 4}
            y2={yOf(last) + 4}
            stroke={stroke}
            strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        <div className="detail-panel__trend-figures">
          <div className="detail-panel__trend-value" style={{ color: stroke }}>
            지수 {Math.round(last)}
          </div>
          {delta && (
            <div className="detail-panel__trend-sub">
              전월 대비 {delta.pct > 0 ? "+" : ""}
              {delta.pct}%
            </div>
          )}
        </div>
      </div>

      <p className="detail-panel__trend-note">
        {months[0]} = 100 기준 · {months[months.length - 1]} {rawText}
      </p>
      <p className="detail-panel__trend-note">
        채용 공고가 아니라 GitHub·Stack Overflow 활동량입니다. 같은 달 전체 기술 합계에서 차지하는
        비중을 지수로 만들어, 플랫폼 전체가 커지거나 줄어드는 효과를 걷어냈습니다. 집계가 진행
        중인 이번 달은 제외했습니다.
        {!hasStackoverflow && " 이 기술은 Stack Overflow 질문이 없어 GitHub만으로 계산했습니다."}
      </p>
    </div>
  );
}

function VideoList({ videos }) {
  return (
    <ul className="detail-panel__videos">
      {videos.map((v) => (
        <li className="detail-panel__video" key={v.id}>
          <a
            className="detail-panel__video-link"
            href={`https://www.youtube.com/watch?v=${v.id}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {/* next/image를 쓰려면 i.ytimg.com을 next.config.mjs의 remotePatterns에
                등록해야 한다. 저장소가 의존성 3개를 유지하고 있고 다른 어디서도
                next/image를 쓰지 않으므로 평범한 img로 둔다. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="detail-panel__video-thumb"
              src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`}
              alt=""
              loading="lazy"
              width={120}
              height={68}
            />
            <span className="detail-panel__video-body">
              <span className="detail-panel__video-title">{v.title}</span>
              <span className="detail-panel__video-meta">
                {v.channel} · 조회 {formatCount(v.views)}회 · {formatDuration(v.seconds)}
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export default function DetailPanel({ tech, totalTechs = 200, onClose }) {
  const [tab, setTab] = useState("overview");

  // 다른 기술을 고르면 개요 탭으로 되돌린다. effect 대신 렌더링 중 조정하는
  // 방식 (https://react.dev/learn/you-might-not-need-an-effect).
  const [prevTech, setPrevTech] = useState(tech);
  if (tech !== prevTech) {
    setPrevTech(tech);
    setTab("overview");
  }

  const { postings, loading: postingsLoading, isSample } = useTechPostings(
    tech?.skillCode,
    Boolean(tech) && tab === "postings"
  );

  if (!tech) {
    return (
      <div className="detail-panel">
        <div className="detail-panel__empty">
          <div className="detail-panel__empty-title">기술을 선택하세요</div>
          <p className="detail-panel__empty-text">
            차트의 점이나 아래 목록을 클릭하면 채용 공고 수요, 생태계 지표, 함께 요구되는 기술,
            그리고 이 기술을 요구하는 실제 공고를 한 자리에서 볼 수 있습니다.
          </p>
          <div className="detail-panel__empty-hint">
            오른쪽 아래 <strong style={{ color: "var(--quad-early-mover)" }}>선점 후보</strong>{" "}
            구역부터 보는 것을 권합니다. 생태계는 이미 활발한데 채용 수요가 아직 따라오지 않은
            자리입니다.
          </div>
        </div>
      </div>
    );
  }

  const meta = getQuadrantMeta(tech.quadrant);
  const color = `var(--quad-${meta.slug})`;
  const bars = ecosystemBars(tech);
  const delta = tech.trend?.delta;
  // 영상은 200개 중 87개 기술에만 있다. 없으면 탭 자체를 만들지 않는다 —
  // 공식 문서 링크는 배지 줄에 따로 있어서 탭이 없어도 잃는 것이 없다.
  const hasVideos = tech.videos?.length > 0;

  const deltaTone =
    !delta || Math.abs(delta.pct) < 1 ? "flat" : delta.pct > 0 ? "up" : "down";

  return (
    <div className="detail-panel">
      <div className="detail-panel__card">
        <div className="detail-panel__head">
          <div>
            <div className="detail-panel__eyebrow">선택한 기술</div>
            <div className="detail-panel__name-row">
              <span className="detail-panel__title">{tech.tech}</span>
              <span className="detail-panel__kind">{tech.kind}</span>
            </div>
          </div>
          <button type="button" className="detail-panel__close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="detail-panel__badges">
          <span className="detail-panel__badge" style={{ background: meta.tint }}>
            <span className="detail-panel__badge-dot" style={{ background: color }} />
            {meta.label}
          </span>
          {(tech.roles ?? []).map((r) => (
            <span key={r} className="detail-panel__badge">
              {r}
            </span>
          ))}
          {tech.docs?.url && (
            <a
              className="detail-panel__docs"
              href={tech.docs.url}
              target="_blank"
              rel="noopener noreferrer"
              title={tech.docs.note || undefined}
            >
              공식 문서
              <ExternalIcon />
            </a>
          )}
        </div>

        <div className="detail-panel__tabs" role="tablist" aria-label="상세 정보 보기">
          <button
            type="button"
            role="tab"
            className="detail-panel__tab"
            aria-selected={tab === "overview"}
            onClick={() => setTab("overview")}
          >
            개요
          </button>
          {hasVideos && (
            <button
              type="button"
              role="tab"
              className="detail-panel__tab"
              aria-selected={tab === "learn"}
              onClick={() => setTab("learn")}
            >
              학습
            </button>
          )}
          <button
            type="button"
            role="tab"
            className="detail-panel__tab"
            aria-selected={tab === "postings"}
            onClick={() => setTab("postings")}
          >
            채용 공고
          </button>
        </div>

        {tab === "overview" && (
          <>
            {tech.summary && <p className="detail-panel__summary">{tech.summary}</p>}

            <div className="detail-panel__stats">
              <div className="detail-panel__stat">
                <div className="detail-panel__stat-label">채용 공고 언급</div>
                <div className="detail-panel__stat-value">
                  {tech.postings.toLocaleString("ko-KR")}건
                </div>
                <div className="detail-panel__stat-note">{tech.postingsNote}</div>
              </div>
              <div className="detail-panel__stat">
                <div className="detail-panel__stat-label">
                  채용 수요{tech.roleContext ? " (직군 기준)" : ""}
                </div>
                <div className="detail-panel__stat-value">{tech.demand}</div>
                <div className="detail-panel__stat-note">
                  {tech.roleContext
                    ? `${tech.roleContext.role} 공고 ${tech.roleContext.count.toLocaleString(
                        "ko-KR"
                      )}건 · 이 직군 안에서 ${tech.roleContext.rank}위`
                    : `공고 언급 빈도의 백분위 순위${
                        tech.demandRank ? ` · ${totalTechs}개 중 ${tech.demandRank}위` : ""
                      }`}
                </div>
              </div>
              <div className="detail-panel__stat">
                <div className="detail-panel__stat-label">생태계 종합</div>
                <div className="detail-panel__stat-value">{tech.ecosystemScore}</div>
                <div className="detail-panel__stat-note">{ecosystemNote(tech)}</div>
              </div>
              {delta && (
                <div className="detail-panel__stat">
                  <div className="detail-panel__stat-label">전월 대비 생태계 활동</div>
                  <div className="detail-panel__stat-value" data-tone={deltaTone}>
                    {deltaTone === "flat" ? "보합" : `${delta.pct > 0 ? "+" : ""}${delta.pct}%`}
                  </div>
                  <div className="detail-panel__stat-note">
                    {`${delta.month} 점유율 지수 ${Math.round(delta.value)} · 전월 ${Math.round(
                      delta.prevValue
                    )}`}
                    {deltaTone === "flat"
                      ? "에서 거의 변동 없음"
                      : deltaTone === "up"
                        ? "에서 상승"
                        : "에서 하락"}
                  </div>
                </div>
              )}
            </div>

            <div className="detail-panel__metrics">
              {bars.map((bar) => (
                <div key={bar.key}>
                  <div className="detail-panel__metric-row">
                    <span className="detail-panel__metric-label">{bar.label}</span>
                    <span className="detail-panel__metric-value">
                      {bar.score}
                      <span className="detail-panel__metric-raw">{bar.rawText}</span>
                    </span>
                  </div>
                  <div className="detail-panel__metric-track">
                    <div
                      className="detail-panel__metric-fill"
                      style={{ width: `${bar.score}%`, background: color }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {tech.trend && <TrendSpark trend={tech.trend} />}

            {tech.signals?.length > 0 && (
              <>
                <div className="detail-panel__section-title">이 자리에 있는 이유</div>
                <div className="detail-panel__signals">
                  {tech.signals.map((s) => (
                    <div className="detail-panel__signal" key={s.meta}>
                      <span className="detail-panel__signal-dot" style={{ background: color }} />
                      <div className="detail-panel__signal-meta">{s.meta}</div>
                      <div className="detail-panel__signal-title">{s.title}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {tech.stack?.length > 0 && (
              <>
                <div className="detail-panel__section-title">함께 요구되는 기술</div>
                <div className="detail-panel__stack">
                  {tech.stack.map((s) => (
                    <span className="detail-panel__chip" key={s}>
                      {s}
                    </span>
                  ))}
                </div>
              </>
            )}

            {tech.verdict && (
              <div className="detail-panel__verdict" style={{ background: meta.tint }}>
                <div className="detail-panel__eyebrow">지금 배운다면</div>
                <div className="detail-panel__verdict-text">{tech.verdict}</div>
              </div>
            )}

            <p className="detail-panel__footnote">
              생태계 지표는 GitHub·Stack Overflow의 최근 180일 실측값이고, 채용 수요는 수집된
              공고에서 추출한 기술 태그 빈도의 백분위 순위입니다. Esc 키로 닫을 수 있습니다.
            </p>
          </>
        )}

        {tab === "learn" && hasVideos && (
          <>
            <p className="detail-panel__summary">
              {tech.tech}을(를) 처음 배울 때 볼 만한 영상입니다.
              {tech.docs?.url && " 위의 공식 문서와 함께 보세요."}
            </p>
            <VideoList videos={tech.videos} />
            <p className="detail-panel__footnote">
              조회수와 평가를 함께 반영해 고른 영어 입문 강의입니다. 유튜브에서 열립니다.
            </p>
          </>
        )}

        {tab === "postings" && (
          <>
            <p className="detail-panel__summary">
              {tech.tech}을(를) 요구하는 공고입니다. 회사명과 지원 링크는 수집된 채용공고에서
              그대로 가져옵니다.
            </p>
            <PostingList postings={postings} loading={postingsLoading} techName={tech.tech} />
            {isSample && (
              <p className="detail-panel__footnote">
                채용 API에서 공고를 받지 못해 예시 공고를 대신 표시합니다.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
