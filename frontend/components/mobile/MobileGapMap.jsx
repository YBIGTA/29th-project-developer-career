"use client";

import { QUADRANTS, getQuadrantMeta } from "@/lib/quadrants";
import { plot } from "@/lib/mapPoints";

const LEGEND = [
  { slug: "early-mover", label: "선점 후보", note: "채운 원 · 생태계 높고 채용 낮음" },
  { slug: "essential", label: "필수", note: "채운 원 · 둘 다 높음" },
  { slug: "niche", label: "희소가치", note: "점선 원 · 채용 수요 높음" },
  { slug: "minimal", label: "저관심", note: "빈 원 · 둘 다 낮음" },
];

/**
 * 데스크톱 GapMap과 달리 마우스 호버가 없으므로, 점을 탭하면 바로
 * onSelectPoint를 호출해 상세 바텀시트를 연다 (툴팁 중간 단계 없음).
 */
export default function MobileGapMap({ data, selectedTech, onSelectPoint, loading, error, revealed }) {
  if (loading) {
    return (
      <div className="mv-map__skeleton" role="status" aria-live="polite">
        <span className="sr-only">지도 데이터를 불러오는 중입니다.</span>
        <div className="mv-map__skeleton-plane">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className="mv-map__skeleton-dot" style={{ "--i": i }} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mv-map__status mv-map__status--error" role="alert">
        <div className="mv-map__status-title">데이터를 불러오지 못했습니다</div>
        <p className="mv-map__status-text">수집 서버 응답이 없습니다. 잠시 후 새로고침해주세요.</p>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="mv-map__status">
        <div className="mv-map__status-title">조건에 맞는 기술이 없습니다</div>
        <p className="mv-map__status-text">직군 필터를 전체로 되돌리면 다시 표시됩니다.</p>
      </div>
    );
  }

  const activeZone = selectedTech ? getQuadrantMeta(selectedTech.quadrant).zone : null;

  return (
    <div className="mv-map" data-revealed={revealed}>
      <div className="mv-map__frame">
        <div className="mv-map__axis mv-map__axis--y">
          <span className="mv-map__axis-cap">높음</span>
          <span className="mv-map__axis-name">채용 시장 수요</span>
          <span className="mv-map__axis-cap">낮음</span>
        </div>

        <div className="mv-map__plane">
          {QUADRANTS.map((q, i) => (
            <span
              key={q.key}
              className={`mv-map__zone mv-map__zone--${q.zone} mv-map__zone--${q.slug}`}
              data-active={activeZone === q.zone}
              style={{ "--reveal-delay": `${120 + i * 70}ms` }}
            />
          ))}

          <span className="mv-map__crossline mv-map__crossline--x" />
          <span className="mv-map__crossline mv-map__crossline--y" />

          {QUADRANTS.map((q) => (
            <span key={q.key} className={`mv-map__corner mv-map__corner--${q.zone}`}>
              <span className={`mv-map__corner-swatch mv-map__corner-swatch--${q.slug}`} />
              {q.label}
            </span>
          ))}

          {selectedTech && (
            <span
              className="mv-map__ring"
              style={{
                left: `${plot(selectedTech.ecosystemScore)}%`,
                bottom: `${plot(selectedTech.demand)}%`,
              }}
            />
          )}

          {data.map((d) => {
            const meta = getQuadrantMeta(d.quadrant);
            const isSelected = selectedTech?.tech === d.tech;
            return (
              <button
                key={d.tech}
                type="button"
                className="mv-map__hit"
                aria-label={`${d.tech} — ${meta.label}, 생태계 ${d.ecosystemScore}, 수요 ${d.demand}`}
                aria-pressed={isSelected}
                style={{ left: `${plot(d.ecosystemScore)}%`, bottom: `${plot(d.demand)}%` }}
                onClick={() => onSelectPoint?.(d)}
              >
                <span
                  className={`mv-map__dot mv-map__dot--${meta.slug}${
                    isSelected ? " mv-map__dot--selected" : ""
                  }`}
                />
              </button>
            );
          })}
        </div>

        <div className="mv-map__axis mv-map__axis--x">
          <span className="mv-map__axis-cap">낮음</span>
          <span className="mv-map__axis-name">개발 생태계 활동</span>
          <span className="mv-map__axis-cap">높음</span>
        </div>
      </div>

      <div className="mv-map__legend">
        {LEGEND.map((item) => (
          <span className="mv-legend-item" key={item.slug}>
            <span className="mv-legend-item__row">
              <span className={`mv-legend-swatch mv-legend-swatch--${item.slug}`} />
              <span className="mv-legend-item__label">{item.label}</span>
            </span>
            <span className="mv-legend-item__note">{item.note}</span>
          </span>
        ))}
      </div>

      <div className="mv-map__watchlist">
        <div className="mv-map__watchlist-title">목록에서 선택</div>
        <div className="mv-map__chips">
          {data.map((d) => {
            const meta = getQuadrantMeta(d.quadrant);
            return (
              <button
                key={d.tech}
                type="button"
                className={`mv-map__chip${selectedTech?.tech === d.tech ? " mv-map__chip--selected" : ""}`}
                onClick={() => onSelectPoint?.(d)}
              >
                <span className={`mv-legend-swatch mv-legend-swatch--${meta.slug}`} />
                {d.tech}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
