"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import { QUADRANTS, getQuadrantMeta } from "@/lib/quadrants";
import { trendColor } from "@/lib/trend";
import { getGapMapData } from "@/lib/api";

const SORTS = [
  { key: "dict", label: "사전순" },
  { key: "demand", label: "채용 수요순" },
  { key: "ecosystem", label: "생태계순" },
];

// 표제어의 첫 글자. 기술명은 대부분 로마자라 A-Z로 묶고, 나머지는 # 묶음으로 보낸다.
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

export default function DictionaryClient() {
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

  // 사전순일 때만 표제어를 첫 글자로 묶는다. 점수순 정렬에서는 묶음이 의미가 없다.
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
    <div className="page">
      <TopBar
        searchActive
        links={[
          { href: "/#quadrants", label: "사분면" },
          { href: "/#gapmap", label: "지도" },
        ]}
      />

      <main className="dict">
        <header className="dict__head">
          <h1 className="dict__title">전체 기술 목록</h1>
          <Link className="dict__back" href="/#gapmap">
            지도로 돌아가기
          </Link>
        </header>

        <div className="dict-toolbar">
          <div className="dict-search">
            <svg className="dict-search__icon" viewBox="0 0 16 16" aria-hidden="true" width="16" height="16">
              <circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="m10.5 10.5 3 3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="search"
              className="dict-search__input"
              placeholder="기술 이름, 분류, 함께 쓰는 스택으로 찾기"
              aria-label="기술 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                type="button"
                className="dict-search__clear"
                onClick={() => setQuery("")}
                aria-label="검색어 지우기"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true" width="12" height="12">
                  <path
                    d="m4.5 4.5 7 7m0-7-7 7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            )}
          </div>

          <div className="dict-toolbar__row">
            <div className="dict-filters" role="group" aria-label="사분면으로 거르기">
              <button
                type="button"
                className="dict-chip"
                data-selected={quadFilter === "all"}
                onClick={() => setQuadFilter("all")}
              >
                전체
                <span className="dict-chip__count">{data.length}</span>
              </button>
              {QUADRANTS.map((q) => (
                <button
                  key={q.key}
                  type="button"
                  className={`dict-chip dict-chip--${q.slug}`}
                  data-selected={quadFilter === q.key}
                  onClick={() => setQuadFilter(q.key)}
                >
                  <span className={`legend-swatch legend-swatch--${q.slug}`} />
                  {q.label}
                  <span className="dict-chip__count">{quadCounts[q.key] ?? 0}</span>
                </button>
              ))}
            </div>

            <div className="dict-sort" role="group" aria-label="정렬 기준">
              {SORTS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className="dict-sort__btn"
                  data-selected={sort === s.key}
                  onClick={() => setSort(s.key)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="dict-skeleton" role="status" aria-live="polite">
            <span className="sr-only">기술 사전을 불러오는 중입니다.</span>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="dict-skeleton__row" style={{ "--i": i }}>
                <span className="dict-skeleton__name" />
                <span className="dict-skeleton__line" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="dict-status" role="alert">
            <div className="dict-status__title">사전을 불러오지 못했습니다</div>
            <p className="dict-status__text">
              수집 서버 응답이 없습니다. 잠시 후 페이지를 새로고침해주세요.
            </p>
          </div>
        ) : (
          <>
            <div className="dict-count" aria-live="polite">
              {filtered.length}개 표제어
              {query && <span className="dict-count__q"> · &ldquo;{query}&rdquo; 검색 결과</span>}
            </div>

            {filtered.length === 0 ? (
              <div className="dict-status dict-status--empty">
                <div className="dict-status__title">찾는 기술이 없습니다</div>
                <p className="dict-status__text">
                  다른 이름으로 검색하거나, 사분면 필터를 전체로 되돌려보세요.
                </p>
                <button
                  type="button"
                  className="dict-status__btn"
                  onClick={() => {
                    setQuery("");
                    setQuadFilter("all");
                  }}
                >
                  조건 초기화
                </button>
              </div>
            ) : (
              <div className="dict-body" data-rail={sort === "dict"}>
                {sort === "dict" && (
                  <nav className="dict-rail" aria-label="첫 글자로 이동">
                    {groups.map((g) => (
                      <a key={g.letter} className="dict-rail__link" href={`#dict-${g.letter}`}>
                        {g.letter}
                      </a>
                    ))}
                  </nav>
                )}

                <div className="dict-list">
                  {groups.map((group) => (
                    <section
                      key={group.letter ?? "flat"}
                      className="dict-group"
                      id={group.letter ? `dict-${group.letter}` : undefined}
                    >
                      {group.letter && (
                        <h2 className="dict-group__letter">
                          {group.letter}
                          <span className="dict-group__rule" />
                          <span className="dict-group__count">{group.items.length}</span>
                        </h2>
                      )}

                      {group.items.map((tech) => {
                        const meta = getQuadrantMeta(tech.quadrant);
                        const open = openTech === tech.tech;
                        const color = `var(--quad-${meta.slug})`;

                        return (
                          <article
                            key={tech.tech}
                            className={`dict-entry dict-entry--${meta.slug}`}
                            data-open={open}
                          >
                            <button
                              type="button"
                              className="dict-entry__head"
                              aria-expanded={open}
                              aria-controls={`entry-${tech.tech}`}
                              onClick={() => setOpenTech(open ? null : tech.tech)}
                            >
                              <span className="dict-entry__title-row">
                                <span className="dict-entry__name">{tech.tech}</span>
                                <span className="dict-entry__kind">{tech.kind}</span>
                                <span className="dict-entry__quad">
                                  <span className={`legend-swatch legend-swatch--${meta.slug}`} />
                                  {meta.label}
                                </span>
                                {tech.role && <span className="dict-entry__role">{tech.role}</span>}
                              </span>

                              <span className="dict-entry__summary">{tech.summary}</span>

                              <span className="dict-entry__scores">
                                <span className="dict-score">
                                  <span className="dict-score__label">생태계</span>
                                  <span className="dict-score__value">{tech.ecosystemScore}</span>
                                </span>
                                <span className="dict-score">
                                  <span className="dict-score__label">채용 수요</span>
                                  <span className="dict-score__value">{tech.demand}</span>
                                </span>
                                <span className="dict-score">
                                  <span className="dict-score__label">공고 언급</span>
                                  <span className="dict-score__value">{tech.postings}</span>
                                </span>
                                <span
                                  className="dict-score__trend"
                                  style={{ color: trendColor(tech.trend) }}
                                >
                                  {tech.trendLabel}
                                </span>
                              </span>

                              <span className="dict-entry__chevron" aria-hidden="true">
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
                              <div className="dict-entry__panel" id={`entry-${tech.tech}`}>
                                <div className="dict-entry__cols">
                                  <div>
                                    <div className="dict-entry__sub">지표</div>
                                    <div className="dict-entry__metrics">
                                      {tech.metrics.map((m) => (
                                        <div key={m.label}>
                                          <div className="dict-entry__metric-row">
                                            <span>{m.label}</span>
                                            <span className="dict-entry__metric-value">
                                              {m.value}
                                            </span>
                                          </div>
                                          <div className="dict-entry__metric-track">
                                            <div
                                              className="dict-entry__metric-fill"
                                              style={{ width: `${m.value}%`, background: color }}
                                            />
                                          </div>
                                        </div>
                                      ))}
                                    </div>

                                    <div className="dict-entry__sub">경쟁 강도</div>
                                    <div className="dict-entry__competition">
                                      <strong>{tech.competition}</strong>
                                      <span>{tech.competitionNote}</span>
                                    </div>
                                  </div>

                                  <div>
                                    <div className="dict-entry__sub">이 자리에 있는 이유</div>
                                    <div className="dict-entry__signals">
                                      {tech.signals.map((s) => (
                                        <div className="dict-entry__signal" key={s.meta}>
                                          <span
                                            className="dict-entry__signal-dot"
                                            style={{ background: color }}
                                          />
                                          <span className="dict-entry__signal-meta">{s.meta}</span>
                                          <span className="dict-entry__signal-title">{s.title}</span>
                                        </div>
                                      ))}
                                    </div>

                                    <div className="dict-entry__sub">함께 요구되는 기술</div>
                                    <div className="dict-entry__stack">
                                      {tech.stack.map((s) => (
                                        <button
                                          type="button"
                                          className="dict-entry__chip"
                                          key={s}
                                          onClick={() => setQuery(s)}
                                        >
                                          {s}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </div>

                                <div className="dict-entry__verdict" style={{ background: meta.tint }}>
                                  <div className="dict-entry__sub">지금 배운다면</div>
                                  <p className="dict-entry__verdict-text">{tech.verdict}</p>
                                </div>
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </section>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="page__footer">
        <span className="page__footer-brand">DevCompass</span>
        <span>
          표제어는 tech_stack_pipeline이 채용공고에서 추출한 태그를 기준으로 수집했습니다. 경쟁
          강도 등 일부 지표는 예시 값입니다.
        </span>
      </footer>
    </div>
  );
}
