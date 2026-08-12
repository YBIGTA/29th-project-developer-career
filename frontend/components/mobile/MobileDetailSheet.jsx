"use client";

import { useEffect, useRef, useState } from "react";
import { getQuadrantMeta } from "@/lib/quadrants";
import { trendColor } from "@/lib/trend";

/**
 * 데스크톱의 sticky 사이드 DetailPanel 대신, 하단에서 올라오는 바텀시트로
 * 같은 정보를 보여준다. tech가 있으면 열리고, onClose로 닫힌다.
 */
export default function MobileDetailSheet({ tech, onClose }) {
  const [favs, setFavs] = useState({});
  const open = Boolean(tech);

  const sheetRef = useRef(null);
  const dragStartYRef = useRef(0);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);

  // tech가 바뀔 때(새로 열리거나 완전히 닫힐 때) 드래그 오프셋을 정리한다.
  // effect 대신 렌더링 중 조정하는 방식을 쓴다 — setState-in-effect는
  // 불필요한 추가 렌더를 유발한다 (https://react.dev/learn/you-might-not-need-an-effect).
  const [prevTech, setPrevTech] = useState(tech);
  if (tech !== prevTech) {
    setPrevTech(tech);
    setDragY(0);
    setDragging(false);
  }

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
      // 되면서 위 useEffect가 정리할 때 [data-open="false"]의 닫힘
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
  const isFav = tech ? Boolean(favs[tech.tech]) : false;

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

        <div className="mv-sheet__scroll">
          {!tech ? (
            <div className="mv-sheet__empty-hint">
              지도의 점이나 목록을 탭하면 채용 공고 수요, 경쟁 강도, 생태계 지표, 함께 요구되는
              기술을 여기서 볼 수 있습니다.
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
                <span className="mv-sheet__badge" style={{ color: trendColor(tech.trend) }}>
                  {tech.trendLabel}
                </span>
              </div>

              <p className="mv-sheet__summary">{tech.summary}</p>

              <div className="mv-sheet__stats">
                <div className="mv-sheet__stat">
                  <div className="mv-sheet__stat-label">채용 공고 언급</div>
                  <div className="mv-sheet__stat-value">{tech.postings}</div>
                  <div className="mv-sheet__stat-note">{tech.postingsNote}</div>
                </div>
                <div className="mv-sheet__stat">
                  <div className="mv-sheet__stat-label">경쟁 강도</div>
                  <div className="mv-sheet__stat-value">{tech.competition}</div>
                  <div className="mv-sheet__stat-note">{tech.competitionNote}</div>
                </div>
              </div>

              <div className="mv-sheet__metrics">
                {tech.metrics.map((m) => (
                  <div key={m.label}>
                    <div className="mv-sheet__metric-row">
                      <span className="mv-sheet__metric-label">{m.label}</span>
                      <span className="mv-sheet__metric-value">{m.value}</span>
                    </div>
                    <div className="mv-sheet__metric-track">
                      <div
                        className="mv-sheet__metric-fill"
                        style={{ width: `${m.value}%`, background: color }}
                      />
                    </div>
                  </div>
                ))}
              </div>

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

              <div className="mv-sheet__section-title">함께 요구되는 기술</div>
              <div className="mv-sheet__stack">
                {tech.stack.map((s) => (
                  <span className="mv-sheet__chip" key={s}>
                    {s}
                  </span>
                ))}
              </div>

              <div className="mv-sheet__verdict" style={{ background: meta.tint }}>
                <div className="mv-sheet__eyebrow">지금 배운다면</div>
                <div className="mv-sheet__verdict-text">{tech.verdict}</div>
              </div>

              <div className="mv-sheet__actions">
                <button
                  type="button"
                  className="mv-sheet__btn"
                  style={{ background: isFav ? meta.tint : "transparent" }}
                  onClick={() => setFavs((f) => ({ ...f, [tech.tech]: !f[tech.tech] }))}
                >
                  {isFav ? "★ 담아둔 기술" : "☆ 관심 기술로 담기"}
                </button>
                <button type="button" className="mv-sheet__btn mv-sheet__btn--ghost">
                  학습 경로 보기
                </button>
              </div>

              <p className="mv-sheet__footnote">
                경쟁 강도 등 일부 지표는 예시 값이며, 언급 건수는 tech_stack_pipeline 채용공고
                태그 추출 결과를 참고했습니다.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
