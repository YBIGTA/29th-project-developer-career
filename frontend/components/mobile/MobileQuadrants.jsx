"use client";

import { useMemo } from "react";
import { QUADRANTS } from "@/lib/quadrants";
import { useInView } from "@/lib/useInView";

// 데스크톱과 같은 순서 — 선점 후보(오른쪽 아래)를 마지막에 두어 결론을 가장 나중에 보여준다.
const REVEAL_ORDER = ["top-left", "top-right", "bottom-left", "bottom-right"];

export default function MobileQuadrants({ data, loading, onPickQuadrant }) {
  const [ref, inView] = useInView({ threshold: 0.2 });

  const byZone = useMemo(() => {
    const groups = {};
    for (const q of QUADRANTS) {
      const members = data.filter((d) => d.quadrant === q.key);
      groups[q.zone] = {
        meta: q,
        count: members.length,
        samples: members
          .slice()
          .sort((a, b) => b.ecosystemScore + b.demand - (a.ecosystemScore + a.demand))
          .slice(0, 3),
      };
    }
    return groups;
  }, [data]);

  return (
    <section className="mv-section" id="quadrants" ref={ref}>
      <div className="mv-head">
        <div className="mv-head__eyebrow">사분면 읽는 법</div>
        <h2 className="mv-head__title">두 개의 축이 기술을 네 자리로 나눕니다</h2>
        <p className="mv-head__lead">
          가로축은 개발 생태계에서 실제로 얼마나 다뤄지는지, 세로축은 채용 시장이 얼마나
          찾는지를 나타냅니다. 두 값이 어긋나는 지점이 곧 기회입니다.
        </p>
      </div>

      <div className="mv-quad-frame">
        <div className="mv-quad-axis mv-quad-axis--y">
          <span className="mv-quad-axis-cap">높음</span>
          <span className="mv-quad-axis-name">채용 시장 수요</span>
          <span className="mv-quad-axis-cap">낮음</span>
        </div>

        {/* REVEAL_ORDER가 이미 좌상 → 우상 → 좌하 → 우하 순서라 2열 그리드에
            그대로 흘려 넣으면 실제 사분면 자리와 일치한다. */}
        <div className="mv-quad-grid" data-revealed={inView}>
          {REVEAL_ORDER.map((zone, i) => {
            const group = byZone[zone];
            if (!group) return null;
            const { meta, count, samples } = group;
            return (
              <button
                type="button"
                key={zone}
                className={`mv-quad-card mv-quad-card--${meta.slug} mv-quad-card--${zone}`}
                style={{ "--reveal-delay": `${80 + i * 90}ms` }}
                onClick={() => onPickQuadrant?.(samples[0])}
                disabled={!samples.length}
              >
                <span className="mv-quad-card__top">
                  <span className="mv-quad-card__marker" />
                  <span className="mv-quad-card__label">{meta.label}</span>
                  <span className="mv-quad-card__count">{loading ? "···" : `${count}`}</span>
                </span>
                <span className="mv-quad-card__desc">{meta.description}</span>
                <span className="mv-quad-card__samples">
                  {loading ? (
                    <>
                      <span className="mv-quad-card__skeleton" />
                      <span className="mv-quad-card__skeleton" />
                    </>
                  ) : samples.length ? (
                    samples.map((s) => (
                      <span className="mv-quad-card__tag" key={s.tech}>
                        {s.tech}
                      </span>
                    ))
                  ) : (
                    <span className="mv-quad-card__empty">해당 기술 없음</span>
                  )}
                </span>
              </button>
            );
          })}
          <span className="mv-quad-crosshair mv-quad-crosshair--x" />
          <span className="mv-quad-crosshair mv-quad-crosshair--y" />
        </div>

        <div className="mv-quad-axis mv-quad-axis--x">
          <span className="mv-quad-axis-cap">낮음</span>
          <span className="mv-quad-axis-name">개발 생태계 활동</span>
          <span className="mv-quad-axis-cap">높음</span>
        </div>
      </div>
    </section>
  );
}
