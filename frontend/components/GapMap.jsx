"use client";

import { useMemo, useState } from "react";
import { QUADRANTS, getQuadrantMeta } from "@/lib/quadrants";
import { plot, labelFlipsUp, makeAxisScale, makeRankScale } from "@/lib/mapPoints";

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

// 상자를 자기 높이 기준으로 놓는다(--tip-y). 높이를 상수로 어림해서 빼면
// 글자 수에 따라 상자 윗변이 점에 붙었다 떨어졌다 한다.
const TIP_GAP = 26;

function GapMapTooltip({ tech, scaleX, yOf }) {
  const meta = getQuadrantMeta(tech.quadrant);
  const filled = meta.slug === "early-mover" || meta.slug === "essential";
  const above = yOf(tech) < 45;

  // 판 가장자리의 점에서는 상자를 가운데 정렬로 두면 절반이 판 밖으로 나간다.
  // Python(생태계 98.5)처럼 오른쪽 끝에 있는 점이 그렇다. 그래서 왼쪽 끝에서는
  // 점을 상자의 왼쪽 모서리에, 오른쪽 끝에서는 오른쪽 모서리에 맞춘다.
  const x = plot(scaleX(tech.ecosystemScore));
  const y = plot(yOf(tech));

  return (
    <div
      className="gap-map__tooltip"
      style={{
        left: `${x}%`,
        bottom: above ? `calc(${y}% + ${TIP_GAP}px)` : `calc(${y}% - ${TIP_GAP}px)`,
        // 등장 애니메이션도 transform을 쓰기 때문에 인라인 transform은 덮인다.
        // 정렬 기준을 커스텀 속성으로 넘겨 keyframes 안에서 함께 읽게 한다.
        "--tip-x": x <= 18 ? "0" : x >= 82 ? "-100%" : "-50%",
        "--tip-y": above ? "0px" : "100%",
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
          {tech.roleContext.role} {tech.roleContext.count.toLocaleString("ko-KR")}건
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

/**
 * 구역 설명 팝오버.
 *
 * 예전에는 사분면 설명이 판 위를 통째로 덮는 2×2 카드였고, 스크롤로 걷어야
 * 지도가 보였다. 설명을 읽는 동안 정작 그 구역에 무엇이 있는지는 못 봤다.
 * 이제 모서리 이름표를 누른 그 구역 위에만 뜬다 — 뒤로 판이 계속 보이고,
 * 대표 기술을 누르면 바로 그 점이 선택된다.
 */
function ZonePopover({ quad, members, onPickTech, onClose }) {
  const samples = members
    .slice()
    .sort((a, b) => b.ecosystemScore + b.demand - (a.ecosystemScore + a.demand))
    .slice(0, 2);

  return (
    <div className={`gap-map__zone-pop gap-map__zone-pop--${quad.zone}`} role="dialog">
      <div className="gap-map__zone-pop-head">
        <span className={`legend-swatch legend-swatch--${quad.slug}`} />
        <span className="gap-map__zone-pop-label">{quad.label}</span>
        <span className="gap-map__zone-pop-count">{members.length}개</span>
        <button
          type="button"
          className="gap-map__zone-pop-close"
          aria-label="설명 닫기"
          onClick={onClose}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" width="11" height="11">
            <path
              d="m4.5 4.5 7 7m0-7-7 7"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <p className="gap-map__zone-pop-desc">{quad.description}</p>
      <div className="gap-map__zone-pop-samples">
        {samples.map((s) => (
          <button
            key={s.skillCode}
            type="button"
            className="gap-map__zone-pop-tag"
            onClick={() => onPickTech(s)}
          >
            {s.tech}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * 판 아래의 "목록에서 선택" 칩 목록.
 *
 * 이름표가 고른 점 하나에만 붙으므로, 이름으로 기술을 찾는 통로는 여기다.
 */
export function GapMapWatchlist({ data, selectedTech, onSelectPoint }) {
  return (
    <div className="gap-map__watchlist" data-revealed="true">
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
  );
}

export default function GapMap({
  data,
  selectedTech,
  onSelectPoint,
  loading,
  error,
  // 구역 설명은 여기서 열지만 상태는 페이지가 들고 있다. Esc가 "열린 설명 →
  // 고른 기술" 순으로 하나씩 닫으려면 한 곳에서 판단해야 한다.
  openZone,
  onZoneChange,
}) {
  const [hoverTech, setHoverTech] = useState(null);
  const setOpenZone = onZoneChange;

  // 지금 찍는 점들만 놓고 축을 다시 편다. 데이터가 바뀌면 스케일도 바뀐다.
  const scaleX = useMemo(() => makeAxisScale(data.map((d) => d.ecosystemScore)), [data]);
  // y는 값이 아니라 순위로 편다 — 공고 건수가 같은 기술이 많아 값으로 두면
  // 점이 한 줄에 가로로 쌓인다 (lib/mapPoints.js의 makeRankScale 참고).
  const yPos = useMemo(() => makeRankScale(data), [data]);
  const yOf = useMemo(() => (d) => yPos.get(d.skillCode) ?? 0, [yPos]);

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

  // 고른 기술이 지금 판에 없으면(30 <-> 60 전환 등) 고리도 이름표도 그리지
  // 않는다. 좌표 계산이 지금 찍힌 점들 기준이라, 판에 없는 기술의 자리는
  // 아무 뜻도 없는 값이 된다.
  const onMap = selectedTech && data.some((d) => d.skillCode === selectedTech.skillCode);
  const activeZone = selectedTech ? getQuadrantMeta(selectedTech.quadrant).zone : null;
  const openQuad = openZone ? QUADRANTS.find((q) => q.zone === openZone) : null;

  return (
    <div className="gap-map" data-revealed="true">
      <div className="gap-map__frame">
        <div className="gap-map__axis gap-map__axis--y">
          <span className="gap-map__axis-cap">높음</span>
          <span className="gap-map__axis-name">채용 시장 수요</span>
          <span className="gap-map__axis-cap">낮음</span>
        </div>

        {/* 판(.gap-map__plane)은 사분면 배경이 둥근 모서리 밖으로 새지 않게
            overflow: hidden이다. 이름표·툴팁·구역 설명을 그 안에 두면 가장자리
            에서 잘리므로, 같은 좌표계를 쓰되 잘리지 않는 형제 레이어에 그린다. */}
        <div className="gap-map__plane-wrap">
          <div className="gap-map__plane">
            {QUADRANTS.map((q) => (
              <span
                key={q.key}
                className={`gap-map__zone gap-map__zone--${q.zone} gap-map__zone--${q.slug}`}
                data-active={activeZone === q.zone || openZone === q.zone}
              />
            ))}

            <span className="gap-map__crossline gap-map__crossline--x" />
            <span className="gap-map__crossline gap-map__crossline--y" />

            {/* 모서리 이름표가 곧 구역 설명 버튼이다. 구역 바닥 전체를 누르게
                하면 점을 고르려다 빗나갈 때마다 설명이 열려 거슬린다. */}
            {QUADRANTS.map((q) => (
              <button
                key={q.key}
                type="button"
                className={`gap-map__corner gap-map__corner--${q.zone}`}
                data-open={openZone === q.zone}
                aria-expanded={openZone === q.zone}
                onClick={() => setOpenZone(openZone === q.zone ? null : q.zone)}
              >
                <span className={`gap-map__corner-swatch gap-map__corner-swatch--${q.slug}`} />
                {q.label}
              </button>
            ))}

            {onMap && (
              <span
                className="gap-map__ring"
                style={{
                  left: `${plot(scaleX(selectedTech.ecosystemScore))}%`,
                  bottom: `${plot(yOf(selectedTech))}%`,
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
                  aria-label={`${d.tech} — ${meta.label}, 생태계 ${d.ecosystemScore}, 수요 ${d.demand}`}
                  aria-pressed={isSelected}
                  className={`gap-map__dot gap-map__dot--${meta.slug}${
                    isSelected ? " gap-map__dot--selected" : ""
                  }`}
                  style={{
                    left: `${plot(scaleX(d.ecosystemScore))}%`,
                    bottom: `${plot(yOf(d))}%`,
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

          {/* 이름표는 고른 점 하나에만 붙는다. 점마다 달면 60개가 서로 겹쳐
              아무것도 못 읽는다 — 나머지 이름은 호버 툴팁과 아래 칩 목록에서
              확인한다. */}
          {onMap && (
            <span
              className={`gap-map__dot-label gap-map__dot-label--${
                getQuadrantMeta(selectedTech.quadrant).slug
              }`}
              data-flip={labelFlipsUp(yOf(selectedTech)) ? "up" : undefined}
              style={{
                left: `${plot(scaleX(selectedTech.ecosystemScore))}%`,
                bottom: `${plot(yOf(selectedTech))}%`,
              }}
            >
              {selectedTech.tech}
            </span>
          )}

          {hoverTech && <GapMapTooltip tech={hoverTech} scaleX={scaleX} yOf={yOf} />}

          {openQuad && (
            <ZonePopover
              quad={openQuad}
              members={data.filter((d) => d.quadrant === openQuad.key)}
              onPickTech={(tech) => {
                setOpenZone(null);
                onSelectPoint?.(tech);
              }}
              onClose={() => setOpenZone(null)}
            />
          )}
        </div>

        <div className="gap-map__axis gap-map__axis--x">
          <span className="gap-map__axis-cap">낮음</span>
          <span className="gap-map__axis-name">개발 생태계 활동</span>
          <span className="gap-map__axis-cap">높음</span>
        </div>
      </div>

      <div className="gap-map__legend">
        {LEGEND.map((item) => (
          <span className="legend-item" key={item.slug}>
            <span className={`legend-swatch legend-swatch--${item.slug}`} />
            <span className="legend-item__label">{item.label}</span>
            <span className="legend-item__note">{item.note}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
