"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import MobileFilterBar from "@/components/mobile/MobileFilterBar";
import MobileGapMap from "@/components/mobile/MobileGapMap";
import MobileDetailSheet from "@/components/mobile/MobileDetailSheet";
import MobileHero from "@/components/mobile/MobileHero";
import MobileQuadrants from "@/components/mobile/MobileQuadrants";
import MobileTopBar from "@/components/mobile/MobileTopBar";
import MobileTabBar from "@/components/mobile/MobileTabBar";
import { getGapMapData } from "@/lib/api";
import { useInView } from "@/lib/useInView";

export default function MobileDashboard() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedRole, setSelectedRole] = useState("all");
  const [selectedTech, setSelectedTech] = useState(null);

  const [mapRef, mapInView] = useInView({ threshold: 0.2 });

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

  const roles = useMemo(() => {
    const set = new Set(data.filter((d) => d.role).map((d) => d.role));
    return Array.from(set).sort();
  }, [data]);
  const hasRoleData = roles.length > 0;

  const filteredData = useMemo(() => {
    if (!hasRoleData || selectedRole === "all") return data;
    return data.filter((d) => d.role === selectedRole);
  }, [data, hasRoleData, selectedRole]);

  const pickFromQuadrant = useCallback((tech) => {
    if (!tech) return;
    setSelectedTech(tech);
    document.getElementById("gapmap")?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <div className="mv">
      <MobileTopBar />

      <MobileHero techCount={data.length} />

      <main className="mv-main">
        <MobileQuadrants data={data} loading={loading} onPickQuadrant={pickFromQuadrant} />

        <section className="mv-section" id="gapmap" ref={mapRef}>
          <div className="mv-head">
            <div className="mv-head__eyebrow">수요 − 생태계 지도</div>
            <h2 className="mv-head__title">
              두 축이 어긋난 자리에 <em>선점 후보</em>가 있습니다
            </h2>
            <p className="mv-head__lead">
              점 하나가 기술 하나입니다. 오른쪽 아래로 갈수록 생태계는 이미 달아올랐는데 채용
              공고는 아직 따라오지 않은 기술입니다.
            </p>
          </div>

          <MobileFilterBar
            roles={roles}
            selectedRole={selectedRole}
            onRoleChange={setSelectedRole}
            hasRoleData={hasRoleData}
            resultCount={filteredData.length}
            totalCount={data.length}
          />

          <div className="mv-chart">
            <div className="mv-chart__head">
              <div className="mv-chart__title">생태계 × 채용 수요</div>
              <div className="mv-chart__hint">점을 탭해 상세 정보 보기</div>
            </div>
            <MobileGapMap
              data={filteredData}
              selectedTech={selectedTech}
              onSelectPoint={setSelectedTech}
              loading={loading}
              error={error}
              revealed={mapInView}
            />
          </div>

          <Link className="mv-next" href="/m/dictionary">
            <div>
              <div className="mv-next__title">전체 기술 목록</div>
              <p className="mv-next__text">
                지도에 찍힌 기술을 이름순으로 정리했습니다. 각 기술이 무엇인지, 어떤 기술과 함께
                쓰이는지 한 항목에서 볼 수 있습니다.
              </p>
            </div>
            <span className="mv-next__cta">
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

      <footer className="mv-footer">
        <span className="mv-footer__brand">DevCompass</span>
        채용공고 태그 추출은 tech_stack_pipeline 집계 결과를 사용합니다. 경쟁 강도 등 일부 지표는
        예시 값입니다.
      </footer>

      <MobileDetailSheet tech={selectedTech} onClose={() => setSelectedTech(null)} />

      <MobileTabBar />
    </div>
  );
}
