"use client";

import { useRef, useState } from "react";
import { getQuadrantMeta } from "@/lib/quadrants";
import { ecosystemBars, ecosystemNote } from "@/lib/ecosystem";
import { docHost, normalizeVideos } from "@/lib/learn";
import { useTechPostings } from "@/lib/useTechPostings";
import LearnList from "../LearnList";
import TrendSpark from "../TrendSpark";

function PostingList({ postings, loading, techName }) {
  if (loading) {
    return <div className="mv-sheet__postings-status">공고를 불러오는 중입니다…</div>;
  }

  if (!postings.length) {
    return (
      <div className="mv-sheet__postings-status">
        {techName}을(를) 요구하는 공고를 아직 찾지 못했습니다.
      </div>
    );
  }

  return (
    <ul className="mv-sheet__postings">
      {postings.map((p, i) => (
        <li className="mv-sheet__posting" key={`${p.company}-${p.title}-${i}`}>
          <div className="mv-sheet__posting-company">{p.company}</div>
          <div className="mv-sheet__posting-title">{p.title}</div>
          <div className="mv-sheet__posting-meta">
            {[p.location, p.employmentType, p.publishedAt].filter(Boolean).join(" · ")}
          </div>
          {p.applyUrl && (
            <a
              className="mv-sheet__posting-link"
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

/**
 * 데스크톱의 sticky 사이드 DetailPanel 대신, 하단에서 올라오는 바텀시트로
 * 같은 정보를 보여준다. tech가 있으면 열리고, onClose로 닫힌다.
 */
export default function MobileDetailSheet({ tech, totalTechs = 200, onClose }) {
  const [tab, setTab] = useState("overview");
  const open = Boolean(tech);

  const sheetRef = useRef(null);
  const scrollRef = useRef(null);
  const dragStartYRef = useRef(0);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);

  // tech가 바뀔 때(새로 열리거나 완전히 닫힐 때) 드래그 오프셋과 탭을 정리한다.
  // effect 대신 렌더링 중 조정하는 방식을 쓴다 — setState-in-effect는
  // 불필요한 추가 렌더를 유발한다 (https://react.dev/learn/you-might-not-need-an-effect).
  const [prevTech, setPrevTech] = useState(tech);
  if (tech !== prevTech) {
    setPrevTech(tech);
    setDragY(0);
    setDragging(false);
    setTab("overview");
  }

  const { postings, loading: postingsLoading, isSample } = useTechPostings(
    tech?.skillCode,
    open && tab === "postings"
  );

  const selectTab = (next) => {
    setTab(next);
    // 탭을 바꿨는데 이전 탭에서 내려온 스크롤 위치가 남아 있으면 새 탭의
    // 중간부터 보이게 된다.
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  const handleGripPointerDown = (e) => {
    setDragging(true);
    dragStartYRef.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleGripPointerMove = (e) => {
    if (!dragging) return;
    const delta = e.clientY - dragStartYRef.current;
    setDragY(Math.max(0, delta));
  };

  const handleGripPointerEnd = () => {
    if (!dragging) return;
    setDragging(false);
    const sheetHeight = sheetRef.current?.offsetHeight ?? 400;
    const threshold = Math.min(120, sheetHeight * 0.3);
    if (dragY > threshold) {
      // 임계값을 넘겼으면 여기서 dragY를 되돌리지 않는다. tech가 null이
      // 되면서 위 렌더 중 조정이 정리할 때 [data-open="false"]의 닫힘
      // 트랜지션이 지금 드래그된 위치에서 이어받아 자연스럽게 끝까지 내려간다.
      onClose?.();
    } else {
      setDragY(0);
    }
  };

  const dragStyle =
    dragging || dragY > 0
      ? { transform: `translateY(${dragY}px)`, transition: dragging ? "none" : undefined }
      : undefined;

  const meta = tech ? getQuadrantMeta(tech.quadrant) : null;
  const color = meta ? `var(--quad-${meta.slug})` : undefined;
  const bars = tech ? ecosystemBars(tech) : [];
  const delta = tech?.trend?.delta;
  const deltaTone = !delta || Math.abs(delta.pct) < 1 ? "flat" : delta.pct > 0 ? "up" : "down";

  // 영상이 없어도 문서만 있으면 탭을 만든다 — 데스크톱과 같은 규칙이다
  // (components/DetailPanel.jsx). 모바일에는 배지 줄 문서 링크가 없었으므로
  // 이 탭이 공식 문서로 가는 유일한 통로다.
  const hasLearning = Boolean(tech) &&
    (Boolean(docHost(tech.docs)) || normalizeVideos(tech.videos).length > 0);
  // 자료가 없는 기술로 옮겨 왔는데 학습 탭이 열려 있으면 빈 화면이 된다.
  const activeTab = tab === "learn" && !hasLearning ? "overview" : tab;

  return (
    <>
      <div className="mv-sheet-scrim" data-open={open} onClick={onClose} aria-hidden="true" />
      <div
        className="mv-sheet"
        data-open={open}
        ref={sheetRef}
        style={dragStyle}
        role="dialog"
        aria-modal="true"
        aria-label={tech ? `${tech.tech} 상세 정보` : "기술 상세 정보"}
      >
        <div
          className="mv-sheet__grip"
          onPointerDown={handleGripPointerDown}
          onPointerMove={handleGripPointerMove}
          onPointerUp={handleGripPointerEnd}
          onPointerCancel={handleGripPointerEnd}
          aria-hidden="true"
        >
          <span className="mv-sheet__grip-bar" />
        </div>

        <div className="mv-sheet__scroll" ref={scrollRef}>
          {!tech ? (
            <div className="mv-sheet__empty-hint">
              지도의 점이나 목록을 탭하면 채용 공고 수요, 생태계 지표, 함께 요구되는 기술을 여기서
              볼 수 있습니다.
            </div>
          ) : (
            <>
              <div className="mv-sheet__head">
                <div>
                  <div className="mv-sheet__eyebrow">선택한 기술</div>
                  <div className="mv-sheet__name-row">
                    <span className="mv-sheet__title">{tech.tech}</span>
                    <span className="mv-sheet__kind">{tech.kind}</span>
                  </div>
                </div>
                <button type="button" className="mv-sheet__close" onClick={onClose} aria-label="닫기">
                  ✕
                </button>
              </div>

              <div className="mv-sheet__badges">
                <span className="mv-sheet__badge" style={{ background: meta.tint }}>
                  <span className="mv-sheet__badge-dot" style={{ background: color }} />
                  {meta.label}
                </span>
                {(tech.roles ?? []).map((r) => (
                  <span key={r} className="mv-sheet__badge">
                    {r}
                  </span>
                ))}
              </div>

              <div className="mv-sheet__tabs" role="tablist" aria-label="상세 정보 보기">
                <button
                  type="button"
                  role="tab"
                  className="mv-sheet__tab"
                  aria-selected={activeTab === "overview"}
                  onClick={() => selectTab("overview")}
                >
                  개요
                </button>
                {hasLearning && (
                  <button
                    type="button"
                    role="tab"
                    className="mv-sheet__tab"
                    aria-selected={activeTab === "learn"}
                    onClick={() => selectTab("learn")}
                  >
                    학습
                  </button>
                )}
                <button
                  type="button"
                  role="tab"
                  className="mv-sheet__tab"
                  aria-selected={activeTab === "postings"}
                  onClick={() => selectTab("postings")}
                >
                  채용 공고
                </button>
              </div>

              {activeTab === "overview" && (
                <>
                  {tech.summary && <p className="mv-sheet__summary">{tech.summary}</p>}

                  <div className="mv-sheet__stats">
                    <div className="mv-sheet__stat">
                      <div className="mv-sheet__stat-label">채용 공고 언급</div>
                      <div className="mv-sheet__stat-value">
                        {tech.postings.toLocaleString("ko-KR")}건
                      </div>
                      <div className="mv-sheet__stat-note">{tech.postingsNote}</div>
                    </div>
                    <div className="mv-sheet__stat">
                      <div className="mv-sheet__stat-label">채용 수요</div>
                      <div className="mv-sheet__stat-value">{tech.demand}</div>
                      <div className="mv-sheet__stat-note">
                        공고 언급 빈도의 백분위 순위
                        {tech.roleContext
                          ? ` · ${tech.roleContext.role} 안에서 ${tech.roleContext.rank}위`
                          : tech.demandRank
                            ? ` · ${totalTechs}개 중 ${tech.demandRank}위`
                            : ""}
                      </div>
                    </div>
                    <div className="mv-sheet__stat">
                      <div className="mv-sheet__stat-label">생태계 종합</div>
                      <div className="mv-sheet__stat-value">{tech.ecosystemScore}</div>
                      <div className="mv-sheet__stat-note">{ecosystemNote(tech)}</div>
                    </div>
                    {delta && (
                      <div className="mv-sheet__stat">
                        <div className="mv-sheet__stat-label">전월 대비 생태계 활동</div>
                        <div className="mv-sheet__stat-value" data-tone={deltaTone}>
                          {deltaTone === "flat" ? "보합" : `${delta.pct > 0 ? "+" : ""}${delta.pct}%`}
                        </div>
                        <div className="mv-sheet__stat-note">
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

                  <div className="mv-sheet__metrics">
                    {bars.map((bar) => (
                      <div key={bar.key}>
                        <div className="mv-sheet__metric-row">
                          <span className="mv-sheet__metric-label">{bar.label}</span>
                          <span className="mv-sheet__metric-value">
                            {bar.score}
                            <span className="mv-sheet__metric-raw">{bar.rawText}</span>
                          </span>
                        </div>
                        <div className="mv-sheet__metric-track">
                          <div
                            className="mv-sheet__metric-fill"
                            style={{ width: `${bar.score}%`, background: color }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {tech.trend && <TrendSpark trend={tech.trend} prefix="mv-sheet" />}

                  {tech.signals?.length > 0 && (
                    <>
                      <div className="mv-sheet__section-title">이 자리에 있는 이유</div>
                      <div className="mv-sheet__signals">
                        {tech.signals.map((s) => (
                          <div className="mv-sheet__signal" key={s.meta}>
                            <span className="mv-sheet__signal-dot" style={{ background: color }} />
                            <div className="mv-sheet__signal-meta">{s.meta}</div>
                            <div className="mv-sheet__signal-title">{s.title}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {tech.stack?.length > 0 && (
                    <>
                      <div className="mv-sheet__section-title">함께 요구되는 기술</div>
                      <div className="mv-sheet__stack">
                        {tech.stack.map((s) => (
                          <span className="mv-sheet__chip" key={s}>
                            {s}
                          </span>
                        ))}
                      </div>
                    </>
                  )}

                  <p className="mv-sheet__footnote">
                    생태계 지표는 GitHub·Stack Overflow의 최근 180일 실측값이고, 채용 수요는
                    수집된 공고에서 추출한 기술 태그 빈도의 백분위 순위입니다.
                  </p>
                </>
              )}

              {activeTab === "learn" && (
                <>
                  <p className="mv-sheet__summary">
                    {tech.tech}을(를) 처음 배울 때 볼 만한 공식 문서와 영상입니다.
                  </p>
                  <LearnList tech={tech} prefix="mv-sheet" />
                  <p className="mv-sheet__footnote">
                    영상은 조회수와 평가를 함께 반영해 고른 영어 입문 강의입니다. 새 탭에서
                    열립니다.
                  </p>
                </>
              )}

              {activeTab === "postings" && (
                <>
                  <PostingList postings={postings} loading={postingsLoading} techName={tech.tech} />
                  {isSample && (
                    <p className="mv-sheet__footnote">
                      채용 API에서 공고를 받지 못해 예시 공고를 대신 표시합니다.
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
