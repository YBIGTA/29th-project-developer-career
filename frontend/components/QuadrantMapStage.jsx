"use client";

import { useState } from "react";
import FilterBar from "@/components/FilterBar";
import GapMap, { GapMapWatchlist } from "@/components/GapMap";
import QuadrantIntro from "@/components/QuadrantIntro";
import { MAP_LIMIT_STEPS } from "@/lib/mapPoints";
import { useInView } from "@/lib/useInView";

/**
 * 사분면 읽는 법과 괴리맵을 한 화면에서 잇는다.
 *
 * 예전에는 두 개의 독립 섹션이었다. 같은 사분면을 두 번 그리면서(설명 카드
 * 2×2 한 번, 판 배경 한 번) 둘이 멀리 떨어져 있어 "이 카드가 저 구역"이라는
 * 연결이 눈에 들어오지 않았고, 섹션 사이 간격만으로 200px 넘게 썼다.
 *
 * 이제 둘을 같은 격자 칸에 겹쳐 놓는다. .quadrants__frame과 .gap-map__frame이
 * 원래부터 동일한 격자(30px 축 여백 + 1fr)를 쓰기 때문에 축이 저절로 맞고,
 * 설명 카드 네 장이 판의 네 구역 위에 그대로 포개진다. 스크롤해서 활주로를
 * 지나면 카드가 제자리에서 흐려지며 그 아래 판이 드러나고, 점이 순서대로
 * 찍힌다.
 *
 * 두 레이어 모두 항상 마운트 상태로 둔다. 조건부 렌더링으로 빼면 전환할 때마다
 * 높이가 튀고, GapMap의 점 버튼이 다시 마운트되며 포커스를 잃는다.
 */
export default function QuadrantMapStage({
  data,
  mapData,
  filteredCount,
  totalCount,
  detailPanel,
  loading,
  error,
  roles,
  hasRoleData,
  selectedRole,
  onRoleChange,
  selectedTech,
  onSelectPoint,
  mapLimit,
  onLimitChange,
}) {
  // 활주로가 곧 센티넬이다. 차트 패널 바로 뒤에 놓여 있으므로, 이것이 화면에
  // 들어오는 순간은 곧 패널의 아래 모서리가 화면 바닥에 닿는 순간이다. 판
  // 높이를 화면에서 끌어와 패널이 화면에 꼭 맞게 해 뒀으므로, 그 순간이
  // "패널이 고정되어 화면을 꽉 채운 직후"와 일치한다. 예전에는 센티넬이 패널
  // 안쪽 스택 아래에 있어서 섹션 안으로 456px를 더 내려야 발동했고, 그때는
  // 이미 판 윗부분이 화면 밖으로 밀려나 있었다. once:true라 한 번만 발동한다.
  const [triggerRef, triggered] = useInView({ threshold: 0, once: true });

  // 사용자가 버튼을 누르기 전까지는 스크롤이 정하고, 누른 뒤에는 그 선택이
  // 이긴다. 상태를 effect로 동기화하지 않고 파생값으로 두면 스크롤과 버튼이
  // 서로를 되돌리는 일이 구조적으로 생기지 않는다.
  const [override, setOverride] = useState(null);
  const mapMode = override ?? (triggered || Boolean(selectedTech));

  // 설명 카드에서 기술을 고르면 그 점을 봐야 하므로 지도로 넘어간다.
  const pickTech = (tech) => {
    setOverride(true);
    onSelectPoint(tech);
  };

  return (
    <section className="quadrant-map" id="gapmap">
      {/* 히어로와 사전 상단바가 #quadrants로 들어온다. 병합 뒤에도 앵커가
          살아 있어야 하므로 섹션 앞에 표적을 남긴다. */}
      <span id="quadrants" className="quadrant-map__anchor" aria-hidden="true" />

      <div className="section-head">
        <div className="section-head__eyebrow">수요 − 생태계 지도</div>
        <h2 className="section-head__title">
          두 축이 어긋난 자리에 <em>선점 후보</em>가 있습니다
        </h2>
        <p className="section-head__lead">
          가로축은 개발 생태계에서 실제로 얼마나 다뤄지는지, 세로축은 채용 시장이 얼마나 찾는지를
          나타냅니다. 점 하나가 기술 하나이고, 오른쪽 아래로 갈수록 생태계는 이미 달아올랐는데
          채용 공고는 아직 따라오지 않은 기술입니다.
        </p>
      </div>

      <div className="quadrant-map__stage" data-mode={mapMode ? "map" : "guide"}>
          <FilterBar
            roles={roles}
            selectedRole={selectedRole}
            onRoleChange={onRoleChange}
            hasRoleData={hasRoleData}
            resultCount={filteredCount}
            totalCount={totalCount}
          />

          <div className="quadrant-map__pinwrap">
            <div className="map-section__grid">
              <div className="chart-panel">
              <div className="chart-panel__head">
                <div className="chart-panel__title">생태계 × 채용 수요</div>
                <div
                  className="chart-panel__limits"
                  role="group"
                  aria-label="지도에 표시할 기술 수"
                >
                  {MAP_LIMIT_STEPS.map((step) => {
                    const value = Number.isFinite(step) ? step : filteredCount;
                    return (
                      <button
                        key={String(step)}
                        type="button"
                        className="chart-panel__limit"
                        aria-pressed={mapLimit === value}
                        onClick={() => onLimitChange(value)}
                      >
                        {Number.isFinite(step) ? `${step}개` : "전체"}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="quadrant-map__stack">
                <QuadrantIntro
                  className="quadrant-map__layer quadrant-map__layer--guide"
                  data={data}
                  loading={loading}
                  onPickQuadrant={pickTech}
                />
                <div className="quadrant-map__layer quadrant-map__layer--map">
                  <GapMap
                    data={mapData}
                    selectedTech={selectedTech}
                    onSelectPoint={onSelectPoint}
                    loading={loading}
                    error={error}
                    revealed={mapMode}
                  />
                </div>
              </div>

              <button
                type="button"
                className="quadrant-map__replay"
                data-revealed={triggered || override !== null}
                data-mode={mapMode ? "map" : "guide"}
                onClick={() => setOverride(!mapMode)}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true" width="14" height="14">
                  <path
                    d="M3 8a5 5 0 1 0 1.6-3.7M3 3.2V6h2.8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {mapMode ? "읽는 법 다시 보기" : "지도 보기"}
              </button>
              </div>

              <aside>{detailPanel}</aside>
            </div>

            <span
              ref={triggerRef}
              className="quadrant-map__runway"
              aria-hidden="true"
            />
          </div>

          <GapMapWatchlist
            data={mapData}
            selectedTech={selectedTech}
            onSelectPoint={onSelectPoint}
            revealed={mapMode}
          />
      </div>
    </section>
  );
}
