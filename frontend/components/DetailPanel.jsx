"use client";

import { useState } from "react";
import { getQuadrantMeta } from "@/lib/quadrants";
import { trendColor } from "@/lib/trend";

export default function DetailPanel({ tech, onClose }) {
  const [favs, setFavs] = useState({});

  if (!tech) {
    return (
      <div className="detail-panel">
        <div className="detail-panel__empty">
          <div className="detail-panel__empty-title">기술을 선택하세요</div>
          <p className="detail-panel__empty-text">
            차트의 점이나 아래 목록을 클릭하면 채용 공고 수요, 경쟁 강도, 생태계 지표, 함께
            요구되는 기술을 한 자리에서 볼 수 있습니다.
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
  const isFav = Boolean(favs[tech.tech]);

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
          <span
            className="detail-panel__badge detail-panel__badge--trend"
            style={{ color: trendColor(tech.trend) }}
          >
            {tech.trendLabel}
          </span>
        </div>

        <p className="detail-panel__summary">{tech.summary}</p>

        <div className="detail-panel__stats">
          <div className="detail-panel__stat">
            <div className="detail-panel__stat-label">채용 공고 언급</div>
            <div className="detail-panel__stat-value">{tech.postings}</div>
            <div className="detail-panel__stat-note">{tech.postingsNote}</div>
          </div>
          <div className="detail-panel__stat">
            <div className="detail-panel__stat-label">경쟁 강도</div>
            <div className="detail-panel__stat-value">{tech.competition}</div>
            <div className="detail-panel__stat-note">{tech.competitionNote}</div>
          </div>
        </div>

        <div className="detail-panel__metrics">
          {tech.metrics.map((m) => (
            <div key={m.label}>
              <div className="detail-panel__metric-row">
                <span className="detail-panel__metric-label">{m.label}</span>
                <span className="detail-panel__metric-value">{m.value}</span>
              </div>
              <div className="detail-panel__metric-track">
                <div
                  className="detail-panel__metric-fill"
                  style={{ width: `${m.value}%`, background: color }}
                />
              </div>
            </div>
          ))}
        </div>

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

        <div className="detail-panel__section-title">함께 요구되는 기술</div>
        <div className="detail-panel__stack">
          {tech.stack.map((s) => (
            <span className="detail-panel__chip" key={s}>
              {s}
            </span>
          ))}
        </div>

        <div className="detail-panel__verdict" style={{ background: meta.tint }}>
          <div className="detail-panel__eyebrow">지금 배운다면</div>
          <div className="detail-panel__verdict-text">{tech.verdict}</div>
        </div>

        <div className="detail-panel__actions">
          <button
            type="button"
            className="detail-panel__btn"
            style={{ background: isFav ? meta.tint : "transparent" }}
            onClick={() => setFavs((f) => ({ ...f, [tech.tech]: !f[tech.tech] }))}
          >
            {isFav ? "★ 담아둔 기술" : "☆ 관심 기술로 담기"}
          </button>
          <button type="button" className="detail-panel__btn detail-panel__btn--ghost">
            학습 경로 보기
          </button>
        </div>

        <p className="detail-panel__footnote">
          경쟁 강도 등 일부 지표는 예시 값이며, 언급 건수는 tech_stack_pipeline 채용공고 태그
          추출 결과를 참고했습니다. Esc 키로 닫을 수 있습니다.
        </p>
      </div>
    </div>
  );
}
