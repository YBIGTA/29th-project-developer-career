"use client";

import { useMemo, useState } from "react";
import { QUADRANTS, getQuadrantMeta, isEcosystemHigh } from "@/lib/quadrants";
import { plot, makeRankScale } from "@/lib/mapPoints";

const LEGEND = [
  { slug: "early-mover", label: "선점 후보", note: "채운 원 · 생태계 높고 채용 낮음" },
  { slug: "essential", label: "필수", note: "채운 원 · 둘 다 높음" },
  { slug: "niche", label: "희소가치", note: "점선 원 · 채용 수요 높음" },
  { slug: "minimal", label: "저관심", note: "빈 원 · 둘 다 낮음" },
];

/**
 * 구역 설명 팝오버 — 데스크톱 GapMap의 ZonePopover와 같은 것.
 *
 * 모바일 홈에는 사분면을 설명하는 별도 섹션(MobileQuadrants)이 있지만, 지도만
 * 보고 있을 때 "여기가 무슨 구역이더라"를 확인하려면 위로 스크롤해 돌아가야
 * 했다. 판을 떠나지 않고 그 자리에서 읽을 수 있게 한다.
 *
 * 좁은 화면이라 데스크톱처럼 구역의 1/4을 덮지 않고 판 아래쪽 전체 폭을 쓴다.
 */
function ZonePopover({ quad, members, onPickTech, onClose }) {
  const samples = members
    .slice()
    .sort((a, b) => b.ecosystemScore + b.demand - (a.ecosystemScore + a.demand))
    .slice(0, 2);

  return (
    <div className="mv-map__zone-pop" role="dialog" aria-label={`${quad.label} 설명`}>
      <div className="mv-map__zone-pop-head">
        <span className={`mv-legend-swatch mv-legend-swatch--${quad.slug}`} />
        <span className="mv-map__zone-pop-label">{quad.label}</span>
        <span className="mv-map__zone-pop-count">{members.length}개</span>
        <button
          type="button"
          className="mv-map__zone-pop-close"
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
      <p className="mv-map__zone-pop-desc">{quad.description}</p>
      <div className="mv-map__zone-pop-samples">
        {samples.map((s) => (
          <button
            key={s.skillCode}
            type="button"
            className="mv-map__zone-pop-tag"
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
 * 데스크톱 GapMap과 달리 마우스 호버가 없으므로, 점을 탭하면 바로
 * onSelectPoint를 호출해 상세 바텀시트를 연다 (툴팁 중간 단계 없음).
 */
export default function MobileGapMap({ data, selectedTech, onSelectPoint, loading, error, revealed }) {
  // 데스크톱과 같은 표시용 스케일. 지금 찍는 점들만 놓고 축을 다시 편다.
  // x는 값이 아니라 순위로 편다 — 생태계 점수가 절대 사다리 값으로 바뀌면서
  // 좌우 띠의 경계가 50점이 아니라 중앙값이 됐다(lib/ecosystemScore.js). 값을
  // 그대로 쓰면 점이 배경 십자선의 반대쪽에 찍혀 색과 자리가 어긋난다.
  const xPos = useMemo(
    () => makeRankScale(data, "ecosystemScore", (d) => isEcosystemHigh(d.quadrant)),
    [data]
  );
  const scaleX = useMemo(() => (d) => xPos.get(d.skillCode) ?? 0, [xPos]);
  // y도 값이 아니라 순위로 편다(데스크톱과 동일). 수요는 정수 건수의 백분위라
  // 동점이 대량으로 생기는데, 값 그대로 찍으면 동점끼리 완전히 같은 높이에
  // 겹쳐 좁은 화면에서는 점 하나로 보인다.
  const yPos = useMemo(() => makeRankScale(data), [data]);
  const scaleY = useMemo(() => (d) => yPos.get(d.skillCode) ?? 0, [yPos]);

  // 구역 설명 팝오버. 데스크톱은 Esc 순서 때문에 상태를 페이지가 들지만,
  // 모바일은 Esc가 없고 이 판 밖에서 열 일도 없어 여기서 들고 있는다.
  const [openZone, setOpenZone] = useState(null);

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
  const openQuad = QUADRANTS.find((q) => q.zone === openZone) ?? null;

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
            <button
              key={q.key}
              type="button"
              className={`mv-map__corner mv-map__corner--${q.zone}`}
              aria-expanded={openZone === q.zone}
              onClick={() => setOpenZone(openZone === q.zone ? null : q.zone)}
            >
              <span className={`mv-map__corner-swatch mv-map__corner-swatch--${q.slug}`} />
              {q.label}
            </button>
          ))}

          {selectedTech && (
            <span
              className="mv-map__ring"
              style={{
                left: `${plot(scaleX(selectedTech))}%`,
                bottom: `${plot(scaleY(selectedTech))}%`,
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
                style={{ left: `${plot(scaleX(d))}%`, bottom: `${plot(scaleY(d))}%` }}
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
