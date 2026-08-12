"use client";

import { useState } from "react";
import { QUADRANTS, getQuadrantMeta } from "@/lib/quadrants";
import { trendColor } from "@/lib/trend";

const LEGEND = [
  { slug: "early-mover", label: "선점 후보", note: "채운 원 · 생태계 높고 채용 낮음" },
  { slug: "essential", label: "필수", note: "채운 원 · 둘 다 높음" },
  { slug: "niche", label: "희소가치", note: "점선 원 · 채용 수요 높음" },
  { slug: "minimal", label: "저관심", note: "빈 원 · 둘 다 낮음" },
];

function GapMapTooltip({ tech }) {
  const meta = getQuadrantMeta(tech.quadrant);
  const filled = meta.slug === "early-mover" || meta.slug === "essential";
  const low = tech.demand < 45;

  return (
    <div
      className="gap-map__tooltip"
      style={{
        left: `${tech.ecosystemScore}%`,
        bottom: low ? `calc(${tech.demand}% + 28px)` : `calc(${tech.demand}% - 104px)`,
      }}
    >
      <div className="tooltip__row">
        <span className="tooltip__name">{tech.tech}</span>
        <span className="tooltip__trend" style={{ color: trendColor(tech.trend) }}>
          {tech.trendLabel}
        </span>
      </div>
      <div className="tooltip__quad">
        <span
          className="tooltip__quad-dot"
          style={{
            background: filled ? `var(--quad-${meta.slug})` : "transparent",
            border: filled
              ? "none"
              : `1.5px ${meta.slug === "niche" ? "dashed" : "solid"} var(--quad-${meta.slug})`,
          }}
        />
        {meta.label}
      </div>
      <div className="tooltip__coords">
        <span>생태계 {tech.ecosystemScore}</span>
        <span>수요 {tech.demand}</span>
      </div>
      {tech.postings && <div className="tooltip__postings">공고 {tech.postings}</div>}
    </div>
  );
}

export default function GapMap({ data, selectedTech, onSelectPoint, loading, error, revealed }) {
  const [hoverTech, setHoverTech] = useState(null);

  if (loading) {
    return (
      <div className="gap-map__skeleton" role="status" aria-live="polite">
        <span className="sr-only">지도 데이터를 불러오는 중입니다.</span>
        <div className="gap-map__skeleton-plane">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className="gap-map__skeleton-dot" style={{ "--i": i }} />
          ))}
        </div>
        <div className="gap-map__skeleton-bar" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="gap-map__status gap-map__status--error" role="alert">
        <div className="gap-map__status-title">데이터를 불러오지 못했습니다</div>
        <p className="gap-map__status-text">
          수집 서버 응답이 없습니다. 잠시 후 페이지를 새로고침해주세요.
        </p>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="gap-map__status gap-map__status--empty">
        <div className="gap-map__status-title">조건에 맞는 기술이 없습니다</div>
        <p className="gap-map__status-text">직군 필터를 전체로 되돌리면 다시 표시됩니다.</p>
      </div>
    );
  }

  const activeZone = selectedTech ? getQuadrantMeta(selectedTech.quadrant).zone : null;

  return (
    <div className="gap-map" data-revealed={revealed}>
      <div className="gap-map__frame">
        <div className="gap-map__axis gap-map__axis--y">
          <span className="gap-map__axis-cap">높음</span>
          <span className="gap-map__axis-name">채용 시장 수요</span>
          <span className="gap-map__axis-cap">낮음</span>
        </div>

        <div className="gap-map__plane">
          {QUADRANTS.map((q, i) => (
            <span
              key={q.key}
              className={`gap-map__zone gap-map__zone--${q.zone} gap-map__zone--${q.slug}`}
              data-active={activeZone === q.zone}
              style={{ "--reveal-delay": `${180 + i * 90}ms` }}
            />
          ))}

          <span className="gap-map__crossline gap-map__crossline--x" />
          <span className="gap-map__crossline gap-map__crossline--y" />

          {QUADRANTS.map((q, i) => (
            <span
              key={q.key}
              className={`gap-map__corner gap-map__corner--${q.zone}`}
              style={{ "--reveal-delay": `${520 + i * 70}ms` }}
            >
              <span className={`gap-map__corner-swatch gap-map__corner-swatch--${q.slug}`} />
              {q.label}
            </span>
          ))}

          {selectedTech && (
            <span
              className="gap-map__ring"
              style={{
                left: `${selectedTech.ecosystemScore}%`,
                bottom: `${selectedTech.demand}%`,
              }}
            />
          )}

          {data.map((d, i) => {
            const meta = getQuadrantMeta(d.quadrant);
            const isSelected = selectedTech?.tech === d.tech;
            return (
              <button
                key={d.tech}
                type="button"
                aria-label={`${d.tech} — ${meta.label}, 생태계 ${d.ecosystemScore}, 수요 ${d.demand}`}
                aria-pressed={isSelected}
                className={`gap-map__dot gap-map__dot--${meta.slug}${
                  isSelected ? " gap-map__dot--selected" : ""
                }`}
                style={{
                  left: `${d.ecosystemScore}%`,
                  bottom: `${d.demand}%`,
                  "--reveal-delay": `${780 + i * 55}ms`,
                }}
                onClick={() => onSelectPoint?.(d)}
                onMouseEnter={() => setHoverTech(d)}
                onMouseLeave={() => setHoverTech(null)}
                onFocus={() => setHoverTech(d)}
                onBlur={() => setHoverTech(null)}
              />
            );
          })}

          {data.map((d, i) => (
            <span
              key={d.tech}
              className={`gap-map__dot-label gap-map__dot-label--${getQuadrantMeta(d.quadrant).slug}`}
              style={{
                left: `${d.ecosystemScore}%`,
                bottom: `${d.demand}%`,
                "--reveal-delay": `${840 + i * 55}ms`,
              }}
            >
              {d.tech}
            </span>
          ))}

          {hoverTech && <GapMapTooltip tech={hoverTech} />}
        </div>

        <div className="gap-map__axis gap-map__axis--x">
          <span className="gap-map__axis-cap">낮음</span>
          <span className="gap-map__axis-name">개발 생태계 활동</span>
          <span className="gap-map__axis-cap">높음</span>
        </div>
      </div>

      <div className="gap-map__legend">
        {LEGEND.map((item, i) => (
          <span className="legend-item" key={item.slug} style={{ "--reveal-delay": `${1120 + i * 60}ms` }}>
            <span className={`legend-swatch legend-swatch--${item.slug}`} />
            <span className="legend-item__label">{item.label}</span>
            <span className="legend-item__note">{item.note}</span>
          </span>
        ))}
      </div>

      <div className="gap-map__watchlist" style={{ "--reveal-delay": "1400ms" }}>
        <div className="gap-map__watchlist-title">목록에서 선택</div>
        <div className="gap-map__chips">
          {data.map((d) => {
            const meta = getQuadrantMeta(d.quadrant);
            return (
              <button
                key={d.tech}
                type="button"
                className={`gap-map__chip gap-map__chip--${meta.slug}${
                  selectedTech?.tech === d.tech ? " gap-map__chip--selected" : ""
                }`}
                onClick={() => onSelectPoint?.(d)}
              >
                <span className={`legend-swatch legend-swatch--${meta.slug}`} />
                {d.tech}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
