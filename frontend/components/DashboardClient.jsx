"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DetailPanel from "@/components/DetailPanel";
import FilterBar from "@/components/FilterBar";
import GapMap, { GapMapWatchlist } from "@/components/GapMap";
import TopBar from "@/components/TopBar";
import { getGapMapData } from "@/lib/api";
import { pickMapPoints, MAP_LIMIT, MAP_LIMIT_STEPS } from "@/lib/mapPoints";
import { ALL_ROLES, projectByRole } from "@/lib/roles";

/**
 * 지도 페이지.
 *
 * 예전에는 히어로 → 사분면 설명 카드 2×2 → 지도 순으로 세 구간을 스크롤로
 * 넘겼고, 지도 구간은 화면에 고정된 채 카드가 흐려지며 판이 드러났다. 첫
 * 화면에 정작 데이터가 하나도 없었고, 고정 구간 때문에 스크롤이 걸리적거렸다.
 * 이제 바로 지도로 시작한다 — 사분면 설명은 판 모서리의 이름표를 누르면 그
 * 구역 위에만 뜬다(GapMap.jsx).
 */
export default function DashboardClient() {
  const [data, setData] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedRole, setSelectedRole] = useState(ALL_ROLES);
  const [selectedTech, setSelectedTech] = useState(null);
  const [openZone, setOpenZone] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await getGapMapData();
        if (!cancelled) {
          setData(result.items);
          setMeta(result.meta);
        }
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // roles는 채용공고 원본 직군 14종이다. 순서는 meta.roles(공고 수 내림차순)를
  // 따르고, 없으면 데이터에서 직접 모은다.
  const roles = useMemo(() => {
    if (meta?.roles?.length) return meta.roles;
    return Array.from(
      new Set(data.flatMap((d) => (d.roleBreakdown ?? []).map((b) => b.role)))
    ).sort();
  }, [data, meta?.roles]);
  const hasRoleData = roles.length > 0;

  // 직군을 고르면 그 직군에 등장한 기술만 남기고, y축을 그 직군 안에서의
  // 백분위로 갈아끼운다 (lib/roles.js).
  const filteredData = useMemo(
    () => (hasRoleData ? projectByRole(data, selectedRole) : data),
    [data, hasRoleData, selectedRole]
  );

  // 점이 겹쳐 읽히지 않는 것을 막으려고 N개만 찍는다. 수요 상위 N개가 아니라
  // 사분면별로 고르게 뽑는다 (lib/mapPoints.js).
  const [limitOverride, setLimitOverride] = useState(null);
  const mapLimit = limitOverride ?? meta?.mapLimit ?? MAP_LIMIT;
  const mapData = useMemo(
    () => pickMapPoints(filteredData, mapLimit),
    [filteredData, mapLimit]
  );

  // Esc는 한 번에 하나씩만 닫는다 — 열린 구역 설명이 먼저, 그다음 고른 기술.
  useEffect(() => {
    if (!selectedTech && !openZone) return;
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      if (openZone) setOpenZone(null);
      else setSelectedTech(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedTech, openZone]);

  // 직군을 바꾸면 y축 기준이 바뀌므로, 열려 있던 상세는 이전 기준의 값을
  // 그대로 들고 있게 된다. 선택을 비워 섞이지 않게 한다.
  const changeRole = useCallback((role) => {
    setSelectedRole(role);
    setSelectedTech(null);
  }, []);

  return (
    <div className="page">
      <TopBar active="map" />

      <main className="page__main">
        <section className="quadrant-map">
          <div className="quadrant-map__stage">
            <FilterBar
              roles={roles}
              selectedRole={selectedRole}
              onRoleChange={changeRole}
              hasRoleData={hasRoleData}
              resultCount={filteredData.length}
              totalCount={data.length}
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
                        const value = Number.isFinite(step) ? step : filteredData.length;
                        return (
                          <button
                            key={String(step)}
                            type="button"
                            className="chart-panel__limit"
                            aria-pressed={mapLimit === value}
                            onClick={() => setLimitOverride(value)}
                          >
                            {Number.isFinite(step) ? `${step}개` : "전체"}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <GapMap
                    data={mapData}
                    selectedTech={selectedTech}
                    onSelectPoint={setSelectedTech}
                    loading={loading}
                    error={error}
                    openZone={openZone}
                    onZoneChange={setOpenZone}
                  />
                </div>

                <aside>
                  <DetailPanel
                    tech={selectedTech}
                    totalTechs={meta?.totalTechs ?? data.length}
                    onClose={() => setSelectedTech(null)}
                  />
                </aside>
              </div>
            </div>

            <GapMapWatchlist
              data={mapData}
              selectedTech={selectedTech}
              onSelectPoint={setSelectedTech}
            />
          </div>
        </section>
      </main>

      <footer className="page__footer">
        <span className="page__footer-brand">DevCompass</span>
        <span>
          생태계 지표는 GitHub·Stack Overflow의 최근 180일 실측값이고, 채용 수요는 수집된 공고{" "}
          {meta?.totalPostings ? `${meta.totalPostings.toLocaleString("ko-KR")}건` : ""}에서
          tech_stack_pipeline이 추출한 기술 태그 기준입니다.
        </span>
      </footer>
    </div>
  );
}
