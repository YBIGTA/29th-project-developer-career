"use client";

import { useState } from "react";
import { getQuadrantMeta } from "@/lib/quadrants";
import { ecosystemBars } from "@/lib/ecosystem";
import { useTechPostings } from "@/lib/useTechPostings";

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
            </a>
          )}
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

  const { postings, loading: postingsLoading } = useTechPostings(
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

        {tab === "overview" ? (
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
                <div className="detail-panel__stat-note">
                  아래 세 지표(각 0~100)의 평균입니다.
                </div>
              </div>
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
        ) : (
          <>
            <p className="detail-panel__summary">
              {tech.tech}을(를) 요구하는 공고입니다. 회사명과 지원 링크는 수집된 채용공고에서
              그대로 가져옵니다.
            </p>
            <PostingList postings={postings} loading={postingsLoading} techName={tech.tech} />
            <p className="detail-panel__footnote">
              채용 API 연결 전이라 예시 공고가 표시됩니다.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
