"use client";

import { useMemo } from "react";
import { QUADRANTS } from "@/lib/quadrants";

// 스크롤로 드러나는 순서. 선점 후보(오른쪽 아래)를 마지막에 배치해
// 서비스가 말하려는 결론이 가장 나중에 눈에 들어오게 한다.
const REVEAL_ORDER = ["top-left", "top-right", "bottom-left", "bottom-right"];

export default function QuadrantIntro({ data, loading, onPickQuadrant, className = "" }) {
  const byZone = useMemo(() => {
    const groups = {};
    for (const q of QUADRANTS) {
      const members = data.filter((d) => d.quadrant === q.key);
      groups[q.zone] = {
        meta: q,
        count: members.length,
        // 2개만 보인다. 3개면 태그가 두 줄로 감겨 카드가 205px까지 커지는데,
        // 카드 4장이 판 높이 안에 2행으로 들어가야 하므로 그만큼 여유가 없다.
        samples: members
          .slice()
          .sort((a, b) => b.ecosystemScore + b.demand - (a.ecosystemScore + a.demand))
          .slice(0, 2),
      };
    }
    return groups;
  }, [data]);

  // data-revealed는 이제 자체 스크롤 감지가 아니라 부모 스테이지가 켠다.
  // 설명이 지도 위에 겹쳐 있어서, 언제 보일지를 두 곳에서 따로 정하면
  // 판이 드러나는 순간과 어긋난다.
  return (
    <section className={`quadrants ${className}`} data-revealed="true">
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

      {/* 카드가 눌린다는 것도, 누르면 무슨 일이 생기는지도 화면에 드러나 있지
          않았다. 반드시 프레임 "아래"에 둔다 — 이 설명은 지도 판 위에 포개져
          있고, 두 레이어는 각자의 프레임이 칸 위쪽에서 시작한다는 전제로
          정렬돼 있어서 프레임 위에 무언가를 넣으면 판과 어긋난다. */}
      <p className="quadrants__hint">
        각 사분면을 누르면 그 구역의 대표 기술이 지도에 표시됩니다 — 스크롤을 내려도 지도로
        넘어갑니다.
      </p>
    </section>
  );
}
