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
import { useInView } from "@/lib/useInView";

export default function DashboardClient() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedRole, setSelectedRole] = useState("all");
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
        if (!cancelled) setData(result);
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

  // role은 아직 데이터팀 공식 스펙에 없는 임시 필드라, 값이 하나도 없으면
  // 필터 UI는 남기고 비활성화한다 (FilterBar의 hasRoleData 참고).
  const roles = useMemo(() => {
    const set = new Set(data.filter((d) => d.role).map((d) => d.role));
    return Array.from(set).sort();
  }, [data]);
  const hasRoleData = roles.length > 0;

  const filteredData = useMemo(() => {
    if (!hasRoleData || selectedRole === "all") return data;
    return data.filter((d) => d.role === selectedRole);
  }, [data, hasRoleData, selectedRole]);

  useEffect(() => {
    if (!selectedTech) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") setSelectedTech(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedTech]);

  // 사분면 소개에서 한 칸을 누르면 해당 구역의 대표 기술을 골라 괴리맵으로 데려간다.
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
      <Hero techCount={data.length} />

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
            onRoleChange={setSelectedRole}
            hasRoleData={hasRoleData}
            resultCount={filteredData.length}
            totalCount={data.length}
          />

          <div className="map-section__grid">
            <div className="chart-panel">
              <div className="chart-panel__head">
                <div className="chart-panel__title">생태계 × 채용 수요</div>
                <div className="chart-panel__hint">점을 클릭해 상세 정보 보기</div>
              </div>
              <GapMap
                data={filteredData}
                selectedTech={selectedTech}
                onSelectPoint={setSelectedTech}
                loading={loading}
                error={error}
                revealed={mapInView}
              />
            </div>

            <aside>
              <DetailPanel tech={selectedTech} onClose={() => setSelectedTech(null)} />
            </aside>
          </div>

          {/* 지도를 다 본 사람이 자연스럽게 넘어갈 다음 걸음. 상단바 검색 버튼은
              언제든 쓸 수 있는 통로고, 여기는 읽는 흐름 위에 놓인 안내다. */}
          <Link className="next-step" href="/dictionary" data-revealed={mapInView}>
            <span className="next-step__copy">
              <span className="next-step__title">전체 기술 목록</span>
              <span className="next-step__text">
                지도에 찍힌 기술을 이름순으로 정리했습니다. 각 기술이 무엇인지, 어떤 기술과 함께
                쓰이는지 한 항목에서 볼 수 있습니다.
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
          채용공고 태그 추출은 tech_stack_pipeline 집계 결과를 사용합니다. 경쟁 강도 등 일부 지표는
          예시 값입니다.
        </span>
      </footer>
    </div>
  );
}
