"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import FilterBar from "@/components/FilterBar";
import GapMap from "@/components/GapMap";
import DetailPanel from "@/components/DetailPanel";
import Hero from "@/components/Hero";
import QuadrantIntro from "@/components/QuadrantIntro";
import TopBar from "@/components/TopBar";
import { getGapMapData } from "@/lib/api";
import { pickMapPoints, MAP_LIMIT, MAP_LIMIT_STEPS } from "@/lib/mapPoints";
import { ALL_ROLES, projectByRole } from "@/lib/roles";
import { useInView } from "@/lib/useInView";

export default function DashboardClient() {
  const [data, setData] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedRole, setSelectedRole] = useState(ALL_ROLES);
  const [selectedTech, setSelectedTech] = useState(null);

  const [mapRef, mapInView] = useInView({ threshold: 0.3 });
  // initial=true — 첫 페인트에서 상단바가 잠깐 불투명해졌다 사라지는 깜빡임을 막는다.
  const [heroSentinelRef, heroVisible] = useInView({
    threshold: 0,
    once: false,
    initial: true,
  });

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
  // 사분면별로 고르게 뽑는다 (lib/mapPoints.js). 잘린 기술은 아래 기술 사전
  // 안내로 넘긴다. N은 화면에서 바꿀 수 있고, 사용자가 손대기 전까지는
  // meta.mapLimit을 따른다.
  const [limitOverride, setLimitOverride] = useState(null);
  const mapLimit = limitOverride ?? meta?.mapLimit ?? MAP_LIMIT;
  const mapData = useMemo(
    () => pickMapPoints(filteredData, mapLimit),
    [filteredData, mapLimit]
  );
  const hiddenCount = filteredData.length - mapData.length;

  useEffect(() => {
    if (!selectedTech) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") setSelectedTech(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedTech]);

  // 사분면 소개에서 한 칸을 누르면 해당 구역의 대표 기술을 골라 괴리맵으로 데려간다.
  // 직군을 바꾸면 y축 기준이 바뀌므로, 열려 있던 상세는 이전 기준의 값을
  // 그대로 들고 있게 된다. 선택을 비워 섞이지 않게 한다.
  const changeRole = useCallback((role) => {
    setSelectedRole(role);
    setSelectedTech(null);
  }, []);

  const pickFromQuadrant = useCallback((tech) => {
    if (!tech) return;
    setSelectedTech(tech);
    document.getElementById("gapmap")?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <div className="page">
      <TopBar
        solid={!heroVisible}
        links={[
          { href: "#quadrants", label: "사분면" },
          { href: "#gapmap", label: "지도" },
        ]}
      />

      <span id="top" ref={heroSentinelRef} className="hero-sentinel" aria-hidden="true" />
      <Hero techCount={data.length} meta={meta} />

      <main className="page__main">
        <QuadrantIntro data={data} loading={loading} onPickQuadrant={pickFromQuadrant} />

        <section className="map-section" id="gapmap" ref={mapRef}>
          <div className="section-head">
            <div className="section-head__eyebrow">수요 − 생태계 지도</div>
            <h2 className="section-head__title">
              두 축이 어긋난 자리에 <em>선점 후보</em>가 있습니다
            </h2>
            <p className="section-head__lead">
              점 하나가 기술 하나입니다. 오른쪽 아래로 갈수록 생태계는 이미 달아올랐는데 채용
              공고는 아직 따라오지 않은 기술입니다.
            </p>
          </div>

          <FilterBar
            roles={roles}
            selectedRole={selectedRole}
            onRoleChange={changeRole}
            hasRoleData={hasRoleData}
            resultCount={filteredData.length}
            totalCount={data.length}
          />

          <div className="map-section__grid">
            <div className="chart-panel">
              <div className="chart-panel__head">
                <div className="chart-panel__title">생태계 × 채용 수요</div>
                <div className="chart-panel__limits" role="group" aria-label="지도에 표시할 기술 수">
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
                revealed={mapInView}
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

          {/* 지도를 다 본 사람이 자연스럽게 넘어갈 다음 걸음. 상단바 검색 버튼은
              언제든 쓸 수 있는 통로고, 여기는 읽는 흐름 위에 놓인 안내다. */}
          <Link className="next-step" href="/dictionary" data-revealed={mapInView}>
            <span className="next-step__copy">
              <span className="next-step__title">전체 기술 목록</span>
              <span className="next-step__text">
                {hiddenCount > 0
                  ? `지도에는 사분면마다 고르게 뽑은 ${mapData.length}개만 찍혀 있습니다. 나머지 ${hiddenCount}개를 포함한 전체 목록을 여기서 볼 수 있습니다.`
                  : "지도에 찍힌 기술을 이름순으로 정리했습니다. 각 기술이 무엇인지, 어떤 기술과 함께 쓰이는지 한 항목에서 볼 수 있습니다."}
              </span>
            </span>
            <span className="next-step__cta">
              목록 열기
              <svg viewBox="0 0 16 16" aria-hidden="true" width="15" height="15">
                <path
                  d="M3.2 8h9.6M8.8 4l4 4-4 4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </Link>
        </section>
      </main>

      <footer className="page__footer">
        <span className="page__footer-brand">DevCompass</span>
        <span>
          생태계 지표는 GitHub·Stack Overflow의 최근 180일 실측값이고, 채용 수요는 수집된 공고{" "}
          {meta?.totalPostings ? `${meta.totalPostings.toLocaleString("ko-KR")}건` : ""}에서
          tech_stack_pipeline이 추출한 기술 태그 기준입니다. 개별 공고 목록만 아직 예시입니다.
        </span>
      </footer>
    </div>
  );
}
