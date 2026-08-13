"use client";

import { useEffect, useMemo, useState } from "react";
import MobileTopBar from "@/components/mobile/MobileTopBar";
import MobileTabBar from "@/components/mobile/MobileTabBar";
import { QUADRANTS, getQuadrantMeta } from "@/lib/quadrants";
import { trendColor } from "@/lib/trend";
import { getGapMapData } from "@/lib/api";

const SORTS = [
  { key: "dict", label: "사전순" },
  { key: "demand", label: "채용 수요순" },
  { key: "ecosystem", label: "생태계순" },
];

function initialOf(name) {
  const first = name.trim()[0]?.toUpperCase() ?? "#";
  return first >= "A" && first <= "Z" ? first : "#";
}

function matches(tech, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [tech.tech, tech.kind, tech.role, tech.summary, ...tech.stack]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export default function MobileDictionary() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [quadFilter, setQuadFilter] = useState("all");
  const [sort, setSort] = useState("dict");
  const [openTech, setOpenTech] = useState(null);

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

  const filtered = useMemo(() => {
    const rows = data.filter(
      (d) => matches(d, query) && (quadFilter === "all" || d.quadrant === quadFilter)
    );
    if (sort === "demand") return rows.sort((a, b) => b.demand - a.demand);
    if (sort === "ecosystem") return rows.sort((a, b) => b.ecosystemScore - a.ecosystemScore);
    return rows.sort((a, b) => a.tech.localeCompare(b.tech, "en"));
  }, [data, query, quadFilter, sort]);

  const groups = useMemo(() => {
    if (sort !== "dict") return [{ letter: null, items: filtered }];
    const map = new Map();
    for (const item of filtered) {
      const letter = initialOf(item.tech);
      if (!map.has(letter)) map.set(letter, []);
      map.get(letter).push(item);
    }
    return Array.from(map, ([letter, items]) => ({ letter, items }));
  }, [filtered, sort]);

  const quadCounts = useMemo(() => {
    const counts = {};
    for (const d of data) counts[d.quadrant] = (counts[d.quadrant] ?? 0) + 1;
    return counts;
  }, [data]);

  return (
    <div className="mv">
      <MobileTopBar />

      <main className="mv-dict">
        <h1 className="mv-dict__title">전체 기술 목록</h1>

        <div className="mv-dict-search">
          <svg className="mv-dict-search__icon" viewBox="0 0 16 16" aria-hidden="true" width="16" height="16">
            <circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="m10.5 10.5 3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            className="mv-dict-search__input"
            placeholder="기술 이름, 분류, 함께 쓰는 스택으로 찾기"
            aria-label="기술 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="mv-dict-search__clear"
              onClick={() => setQuery("")}
              aria-label="검색어 지우기"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true" width="12" height="12">
                <path d="m4.5 4.5 7 7m0-7-7 7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        <div className="mv-dict-filters" role="group" aria-label="사분면으로 거르기">
          <button
            type="button"
            className="mv-dict-chip"
            data-selected={quadFilter === "all"}
            onClick={() => setQuadFilter("all")}
          >
            전체
            <span className="mv-dict-chip__count">{data.length}</span>
          </button>
          {QUADRANTS.map((q) => (
            <button
              key={q.key}
              type="button"
              className="mv-dict-chip"
              data-selected={quadFilter === q.key}
              onClick={() => setQuadFilter(q.key)}
            >
              <span className={`mv-legend-swatch mv-legend-swatch--${q.slug}`} />
              {q.label}
              <span className="mv-dict-chip__count">{quadCounts[q.key] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="mv-dict-sort" role="group" aria-label="정렬 기준">
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              className="mv-dict-sort__btn"
              data-selected={sort === s.key}
              onClick={() => setSort(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>

        {sort === "dict" && !loading && !error && (
          <nav className="mv-dict-rail" aria-label="첫 글자로 이동">
            {groups.map((g) => (
              <a key={g.letter} className="mv-dict-rail__link" href={`#mv-dict-${g.letter}`}>
                {g.letter}
              </a>
            ))}
          </nav>
        )}

        {loading ? (
          <div className="mv-dict-skeleton" role="status" aria-live="polite">
            <span className="sr-only">기술 사전을 불러오는 중입니다.</span>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="mv-dict-skeleton__row" style={{ "--i": i }}>
                <span className="mv-dict-skeleton__name" />
                <span className="mv-dict-skeleton__line" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="mv-dict-status" role="alert">
            <div className="mv-dict-status__title">사전을 불러오지 못했습니다</div>
            <p className="mv-dict-status__text">수집 서버 응답이 없습니다. 잠시 후 새로고침해주세요.</p>
          </div>
        ) : (
          <>
            <div className="mv-dict-count" aria-live="polite">
              {filtered.length}개 표제어
              {query && <span> · &ldquo;{query}&rdquo; 검색 결과</span>}
            </div>

            {filtered.length === 0 ? (
              <div className="mv-dict-status">
                <div className="mv-dict-status__title">찾는 기술이 없습니다</div>
                <p className="mv-dict-status__text">
                  다른 이름으로 검색하거나, 사분면 필터를 전체로 되돌려보세요.
                </p>
                <button
                  type="button"
                  className="mv-dict-status__btn"
                  onClick={() => {
                    setQuery("");
                    setQuadFilter("all");
                  }}
                >
                  조건 초기화
                </button>
              </div>
            ) : (
              groups.map((group) => (
                <section
                  key={group.letter ?? "flat"}
                  className="mv-dict-group"
                  id={group.letter ? `mv-dict-${group.letter}` : undefined}
                >
                  {group.letter && (
                    <h2 className="mv-dict-group__letter">
                      {group.letter}
                      <span className="mv-dict-group__rule" />
                      <span className="mv-dict-group__count">{group.items.length}</span>
                    </h2>
                  )}

                  {group.items.map((tech) => {
                    const meta = getQuadrantMeta(tech.quadrant);
                    const open = openTech === tech.tech;
                    const color = `var(--quad-${meta.slug})`;

                    return (
                      <article key={tech.tech} className="mv-dict-entry" data-open={open}>
                        <button
                          type="button"
                          className="mv-dict-entry__head"
                          aria-expanded={open}
                          aria-controls={`mv-entry-${tech.tech}`}
                          onClick={() => setOpenTech(open ? null : tech.tech)}
                        >
                          <span className="mv-dict-entry__title-row">
                            <span className="mv-dict-entry__name">{tech.tech}</span>
                            <span className="mv-dict-entry__kind">{tech.kind}</span>
                            <span className="mv-dict-entry__quad">
                              <span className={`mv-legend-swatch mv-legend-swatch--${meta.slug}`} />
                              {meta.label}
                            </span>
                          </span>

                          <span className="mv-dict-entry__summary">{tech.summary}</span>

                          <span className="mv-dict-entry__scores">
                            <span className="mv-dict-score">
                              생태계 <span className="mv-dict-score__value">{tech.ecosystemScore}</span>
                            </span>
                            <span className="mv-dict-score">
                              채용 수요 <span className="mv-dict-score__value">{tech.demand}</span>
                            </span>
                            <span className="mv-dict-score__trend" style={{ color: trendColor(tech.trend) }}>
                              {tech.trendLabel}
                            </span>
                          </span>

                          <span className="mv-dict-entry__chevron" aria-hidden="true">
                            <svg viewBox="0 0 16 16" width="14" height="14">
                              <path
                                d="M4 6.4 8 10.4 12 6.4"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </span>
                        </button>

                        {open && (
                          <div className="mv-dict-entry__panel" id={`mv-entry-${tech.tech}`}>
                            <div>
                              <div className="mv-dict-entry__sub">지표</div>
                              <div className="mv-dict-entry__metrics">
                                {tech.metrics.map((m) => (
                                  <div key={m.label}>
                                    <div className="mv-dict-entry__metric-row">
                                      <span>{m.label}</span>
                                      <span className="mv-dict-entry__metric-value">{m.value}</span>
                                    </div>
                                    <div className="mv-dict-entry__metric-track">
                                      <div
                                        className="mv-dict-entry__metric-fill"
                                        style={{ width: `${m.value}%`, background: color }}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <div className="mv-dict-entry__sub">경쟁 강도</div>
                              <div className="mv-dict-entry__competition">
                                <strong>{tech.competition}</strong>
                                <span>{tech.competitionNote}</span>
                              </div>
                            </div>

                            <div>
                              <div className="mv-dict-entry__sub">이 자리에 있는 이유</div>
                              <div className="mv-dict-entry__signals">
                                {tech.signals.map((s) => (
                                  <div className="mv-dict-entry__signal" key={s.meta}>
                                    <span className="mv-dict-entry__signal-dot" style={{ background: color }} />
                                    <span className="mv-dict-entry__signal-meta">{s.meta}</span>
                                    <span className="mv-dict-entry__signal-title">{s.title}</span>
                                  </div>
                                ))}
                              </div>

                              <div className="mv-dict-entry__sub">함께 요구되는 기술</div>
                              <div className="mv-dict-entry__stack">
                                {tech.stack.map((s) => (
                                  <button
                                    type="button"
                                    className="mv-dict-entry__chip"
                                    key={s}
                                    onClick={() => setQuery(s)}
                                  >
                                    {s}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="mv-dict-entry__verdict" style={{ background: meta.tint }}>
                              <div className="mv-dict-entry__sub">지금 배운다면</div>
                              <p className="mv-dict-entry__verdict-text">{tech.verdict}</p>
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </section>
              ))
            )}
          </>
        )}
      </main>

      <footer className="mv-footer">
        <span className="mv-footer__brand">DevCompass</span>
        표제어는 tech_stack_pipeline이 채용공고에서 추출한 태그를 기준으로 수집했습니다. 경쟁
        강도 등 일부 지표는 예시 값입니다.
      </footer>

      <MobileTabBar />
    </div>
  );
}
