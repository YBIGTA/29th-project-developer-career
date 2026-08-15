"use client";

import { useMemo, useState } from "react";
import { QUADRANTS, getQuadrantMeta } from "@/lib/quadrants";
import {
  plot,
  labelFlipsUp,
  makeAxisScale,
  LABEL_LIMIT,
} from "@/lib/mapPoints";

const LEGEND = [
  {
    slug: "early-mover",
    label: "선점 후보",
    note: "채운 원 · 생태계 높고 채용 낮음",
  },
  { slug: "essential", label: "필수", note: "채운 원 · 둘 다 높음" },
  { slug: "niche", label: "희소가치", note: "점선 원 · 채용 수요 높음" },
  { slug: "minimal", label: "저관심", note: "빈 원 · 둘 다 낮음" },
];

function GapMapTooltip({ tech, scaleX, scaleY }) {
  const meta = getQuadrantMeta(tech.quadrant);
  const filled = meta.slug === "early-mover" || meta.slug === "essential";
  const low = scaleY(tech.demand) < 45;

  // 판 가장자리의 점에서는 상자를 가운데 정렬로 두면 절반이 판 밖으로 나간다.
  // Python(생태계 98.5)처럼 오른쪽 끝에 있는 점이 그렇다. 그래서 왼쪽 끝에서는
  // 점을 상자의 왼쪽 모서리에, 오른쪽 끝에서는 오른쪽 모서리에 맞춘다.
  const x = plot(scaleX(tech.ecosystemScore));
  const anchorX = x <= 18 ? "0" : x >= 82 ? "-100%" : "-50%";

  return (
    <div
      className="gap-map__tooltip"
      style={{
        left: `${x}%`,
        bottom: low
          ? `calc(${plot(scaleY(tech.demand))}% + 28px)`
          : `calc(${plot(scaleY(tech.demand))}% - 104px)`,
        // 등장 애니메이션도 transform을 쓰기 때문에 인라인 transform은 덮인다.
        // 정렬 기준을 커스텀 속성으로 넘겨 keyframes 안에서 함께 읽게 한다.
        "--tip-x": anchorX,
      }}
    >
      <div className="tooltip__row">
        <span className="tooltip__name">{tech.tech}</span>
        <span className="tooltip__kind">{tech.kind}</span>
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
      {/* 직군 필터가 걸려 있으면 y축이 그 직군 기준이므로 건수도 직군 건수를
          보여준다. 좌표와 다른 모집단의 숫자를 나란히 두지 않기 위해서다. */}
      {tech.roleContext ? (
        <div className="tooltip__postings">
          {tech.roleContext.role}{" "}
          {tech.roleContext.count.toLocaleString("ko-KR")}건
        </div>
      ) : (
        tech.postings > 0 && (
          <div className="tooltip__postings">
            공고 {tech.postings.toLocaleString("ko-KR")}건
          </div>
        )
      )}
    </div>
  );
}

export default function GapMap({
  data,
  selectedTech,
  onSelectPoint,
  loading,
  error,
  revealed,
}) {
  const [hoverTech, setHoverTech] = useState(null);

  // 지금 찍는 점들만 놓고 축을 다시 편다. 데이터가 바뀌면 스케일도 바뀐다.
  const scaleX = useMemo(
    () => makeAxisScale(data.map((d) => d.ecosystemScore)),
    [data],
  );
  const scaleY = useMemo(
    () => makeAxisScale(data.map((d) => d.demand)),
    [data],
  );

  if (loading) {
    return (
      <div className="gap-map__skeleton" role="status" aria-live="polite">
        <span className="sr-only">지도 데이터를 불러오는 중입니다.</span>
        <div className="gap-map__skeleton-plane">
          {Array.from({ length: 9 }, (_, i) => (
            <span
              key={i}
              className="gap-map__skeleton-dot"
              style={{ "--i": i }}
            />
          ))}
        </div>
        <div className="gap-map__skeleton-bar" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="gap-map__status gap-map__status--error" role="alert">
        <div className="gap-map__status-title">
          데이터를 불러오지 못했습니다
        </div>
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
        <p className="gap-map__status-text">
          직군 필터를 전체로 되돌리면 다시 표시됩니다.
        </p>
      </div>
    );
  }

  const activeZone = selectedTech
    ? getQuadrantMeta(selectedTech.quadrant).zone
    : null;

  return (
    <div className="gap-map" data-revealed={revealed}>
      <div className="gap-map__frame">
        <div className="gap-map__axis gap-map__axis--y">
          <span className="gap-map__axis-cap">높음</span>
          <span className="gap-map__axis-name">채용 시장 수요</span>
          <span className="gap-map__axis-cap">낮음</span>
        </div>

        {/* 판(.gap-map__plane)은 사분면 배경이 둥근 모서리 밖으로 새지 않게
            overflow: hidden이다. 툴팁을 그 안에 두면 가장자리 점에서 상자가
            잘리므로, 같은 좌표계를 쓰되 잘리지 않는 형제 레이어에 그린다. */}
        <div className="gap-map__plane-wrap">
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
                <span
                  className={`gap-map__corner-swatch gap-map__corner-swatch--${q.slug}`}
                />
                {q.label}
              </span>
            ))}

            {selectedTech && (
              <span
                className="gap-map__ring"
                style={{
                  left: `${plot(scaleX(selectedTech.ecosystemScore))}%`,
                  bottom: `${plot(scaleY(selectedTech.demand))}%`,
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
                    left: `${plot(scaleX(d.ecosystemScore))}%`,
                    bottom: `${plot(scaleY(d.demand))}%`,
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

          </div>

          {/* 이름표와 툴팁은 판 밖으로 나가도 잘리면 안 되므로 래퍼에 그린다.
              판 왼쪽 끝의 점은 이름이 점보다 넓어 판 안에 두면 앞글자가 잘린다.
              좌표계는 래퍼와 판이 같으므로 위치 계산은 그대로다. */}
          {data.length <= LABEL_LIMIT &&
            data.map((d, i) => (
              <span
                key={d.tech}
                className={`gap-map__dot-label gap-map__dot-label--${getQuadrantMeta(d.quadrant).slug}`}
                data-flip={labelFlipsUp(scaleY(d.demand)) ? "up" : undefined}
                style={{
                  left: `${plot(scaleX(d.ecosystemScore))}%`,
                  bottom: `${plot(scaleY(d.demand))}%`,
                  "--reveal-delay": `${840 + i * 55}ms`,
                }}
              >
                {d.tech}
              </span>
            ))}

          {hoverTech && <GapMapTooltip tech={hoverTech} scaleX={scaleX} scaleY={scaleY} />}
        </div>

        <div className="gap-map__axis gap-map__axis--x">
          <span className="gap-map__axis-cap">낮음</span>
          <span className="gap-map__axis-name">개발 생태계 활동</span>
          <span className="gap-map__axis-cap">높음</span>
        </div>
      </div>

      <div className="gap-map__legend">
        {LEGEND.map((item, i) => (
          <span
            className="legend-item"
            key={item.slug}
            style={{ "--reveal-delay": `${1120 + i * 60}ms` }}
          >
            <span className={`legend-swatch legend-swatch--${item.slug}`} />
            <span className="legend-item__label">{item.label}</span>
            <span className="legend-item__note">{item.note}</span>
          </span>
        ))}
      </div>

      <div
        className="gap-map__watchlist"
        style={{ "--reveal-delay": "1400ms" }}
      >
        <div className="gap-map__watchlist-title">목록에서 선택</div>
        <div className="gap-map__chips">
          {data.map((d) => {
            const meta = getQuadrantMeta(d.quadrant);
            return (
              <button
                key={d.tech}
                type="button"
                className={`gap-map__chip gap-map__chip--${meta.slug}${
                  selectedTech?.tech === d.tech
                    ? " gap-map__chip--selected"
                    : ""
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
