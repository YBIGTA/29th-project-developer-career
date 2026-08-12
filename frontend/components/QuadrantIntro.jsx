"use client";

import { useMemo } from "react";
import { QUADRANTS } from "@/lib/quadrants";
import { useInView } from "@/lib/useInView";

// 스크롤로 드러나는 순서. 선점 후보(오른쪽 아래)를 마지막에 배치해
// 서비스가 말하려는 결론이 가장 나중에 눈에 들어오게 한다.
const REVEAL_ORDER = ["top-left", "top-right", "bottom-left", "bottom-right"];

export default function QuadrantIntro({ data, loading, onPickQuadrant }) {
  const [ref, inView] = useInView({ threshold: 0.45 });

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
    <section className="quadrants" id="quadrants" ref={ref} data-revealed={inView}>
      <div className="section-head">
        <div className="section-head__eyebrow">사분면 읽는 법</div>
        <h2 className="section-head__title">
          두 개의 축이 기술을 네 자리로 나눕니다
        </h2>
        <p className="section-head__lead">
          가로축은 개발 생태계에서 실제로 얼마나 다뤄지는지, 세로축은 채용 시장이 얼마나 찾는지를
          나타냅니다. 두 값이 어긋나는 지점이 곧 기회입니다.
        </p>
      </div>

      <div className="quadrants__frame">
        <div className="quadrants__axis quadrants__axis--y">
          <span className="quadrants__axis-cap">높음</span>
          <span className="quadrants__axis-name">채용 시장 수요</span>
          <span className="quadrants__axis-cap">낮음</span>
        </div>

        <div className="quadrants__grid">
          {REVEAL_ORDER.map((zone, i) => {
            const group = byZone[zone];
            if (!group) return null;
            const { meta, count, samples } = group;
            return (
              <button
                type="button"
                key={zone}
                className={`quadrant-cell quadrant-cell--${zone} quadrant-cell--${meta.slug}`}
                style={{ "--reveal-delay": `${120 + i * 130}ms` }}
                onClick={() => onPickQuadrant?.(samples[0])}
                disabled={!samples.length}
              >
                <span className="quadrant-cell__top">
                  <span className="quadrant-cell__marker" />
                  <span className="quadrant-cell__label">{meta.label}</span>
                  <span className="quadrant-cell__count">
                    {loading ? "···" : `${count}`}
                  </span>
                </span>
                <span className="quadrant-cell__desc">{meta.description}</span>
                <span className="quadrant-cell__samples">
                  {loading ? (
                    <>
                      <span className="quadrant-cell__skeleton" />
                      <span className="quadrant-cell__skeleton" />
                    </>
                  ) : samples.length ? (
                    samples.map((s) => (
                      <span className="quadrant-cell__tag" key={s.tech}>
                        {s.tech}
                      </span>
                    ))
                  ) : (
                    <span className="quadrant-cell__empty">해당 기술 없음</span>
                  )}
                </span>
              </button>
            );
          })}
          <span className="quadrants__crosshair quadrants__crosshair--x" />
          <span className="quadrants__crosshair quadrants__crosshair--y" />
        </div>

        <div className="quadrants__axis quadrants__axis--x">
          <span className="quadrants__axis-cap">낮음</span>
          <span className="quadrants__axis-name">개발 생태계 활동</span>
          <span className="quadrants__axis-cap">높음</span>
        </div>
      </div>
    </section>
  );
}
