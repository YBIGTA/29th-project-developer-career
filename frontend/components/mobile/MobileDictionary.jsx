"use client";

import { useEffect, useMemo, useState } from "react";
import MobileTopBar from "@/components/mobile/MobileTopBar";
import MobileTabBar from "@/components/mobile/MobileTabBar";
import { QUADRANTS, getQuadrantMeta } from "@/lib/quadrants";
import { ecosystemBars } from "@/lib/ecosystem";
import { mapCodeSet } from "@/lib/mapPoints";
import { getGapMapData } from "@/lib/api";
import { getSkillIndex, isExactSkillName, mergeSkills, skillHaystack } from "@/lib/skills";
import LearnList from "@/components/LearnList";

const SORTS = [
  { key: "dict", label: "사전순" },
  { key: "postings", label: "공고순" },
  { key: "ecosystem", label: "생태계순" },
];

function initialOf(name) {
  const first = name.trim()[0]?.toUpperCase() ?? "#";
  return first >= "A" && first <= "Z" ? first : "#";
}

function matches(skill, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return skillHaystack(skill).includes(q);
}

export default function MobileDictionary() {
  const [data, setData] = useState([]);
  const [dataMeta, setDataMeta] = useState(null);
  const [indexMeta, setIndexMeta] = useState(null);
  const [mapItems, setMapItems] = useState([]);
  const [catFilter, setCatFilter] = useState("all");
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
        // 사전 전체(217)와 지표가 수집된 기술(200)은 별개 소스라 함께 받아 합친다.
        const [index, gapmap] = await Promise.all([getSkillIndex(), getGapMapData()]);
        if (!cancelled) {
          setData(mergeSkills(index.items, gapmap.items));
          setIndexMeta(index.meta);
          setDataMeta(gapmap.meta);
          setMapItems(gapmap.items);
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

  const filtered = useMemo(() => {
    const hits = data.filter((d) => matches(d, query));
    // 이름이 정확히 맞는 표제어가 있으면 그것만 남긴다. 없으면 지금까지처럼
    // 넓게 걸린다 (lib/skills.js isExactSkillName 참고).
    const exact = hits.filter((d) => isExactSkillName(d, query));
    const rows = (exact.length ? exact : hits).filter(
      (d) =>
        (quadFilter === "all" || d.quadrant === quadFilter) &&
        (catFilter === "all" || d.category === catFilter)
    );
    if (sort === "postings") return rows.sort((a, b) => b.postings - a.postings);
    // 생태계 점수는 지표가 수집된 200개에만 있다. 점수가 없는 항목은 뒤로 민다.
    if (sort === "ecosystem")
      return rows.sort((a, b) => (b.ecosystemScore ?? -1) - (a.ecosystemScore ?? -1));
    return rows.sort((a, b) => a.tech.localeCompare(b.tech, "en"));
  }, [data, query, quadFilter, catFilter, sort]);

  // 지도는 사분면별로 고르게 뽑은 N개까지만 찍는다. 사전에는 전부 실리므로, 지도에서
  // 잘린 항목임을 여기서 알려준다.
  const onMap = useMemo(
    () => mapCodeSet(mapItems, dataMeta?.mapLimit),
    [mapItems, dataMeta?.mapLimit]
  );

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
    for (const d of data) if (d.quadrant) counts[d.quadrant] = (counts[d.quadrant] ?? 0) + 1;
    return counts;
  }, [data]);

  const catCounts = useMemo(() => {
    const counts = {};
    for (const d of data) counts[d.category] = (counts[d.category] ?? 0) + 1;
    return counts;
  }, [data]);

  return (
    <div className="mv">
      <MobileTopBar />

      <main className="mv-dict">
        <h1 className="mv-dict__title">전체 기술 목록</h1>

        <p className="mv-dict__lead">
          기술 {indexMeta?.totalSkills ?? 217}개를 이름·별칭·분류로 찾아보고, 각각이 채용공고에
          얼마나 나오는지 확인하세요.
        </p>

        <div className="mv-dict-search">
          <svg className="mv-dict-search__icon" viewBox="0 0 16 16" aria-hidden="true" width="16" height="16">
            <circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="m10.5 10.5 3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            className="mv-dict-search__input"
            placeholder="이름, 별칭(K8s·Golang), 분류로 찾기"
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

        <div className="mv-dict-filters" role="group" aria-label="분류로 거르기">
          <button
            type="button"
            className="mv-dict-chip"
            data-selected={catFilter === "all"}
            onClick={() => setCatFilter("all")}
          >
            전체 분류
            <span className="mv-dict-chip__count">{data.length}</span>
          </button>
          {(indexMeta?.categories ?? []).map((c) => (
            <button
              key={c}
              type="button"
              className="mv-dict-chip"
              data-selected={catFilter === c}
              onClick={() => setCatFilter(c)}
            >
              {c}
              <span className="mv-dict-chip__count">{catCounts[c] ?? 0}</span>
            </button>
          ))}
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
                    setCatFilter("all");
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

                  {group.items.map((tech) =>
                    tech.detailed ? (
                      <MobileDetailedEntry
                        key={tech.skillCode}
                        tech={tech}
                        open={openTech === tech.skillCode}
                        onToggle={() =>
                          setOpenTech(openTech === tech.skillCode ? null : tech.skillCode)
                        }
                        offMap={!onMap.has(tech.skillCode)}
                        onPickStack={setQuery}
                      />
                    ) : (
                      <MobileBriefEntry key={tech.skillCode} tech={tech} />
                    )
                  )}
                </section>
              ))
            )}
          </>
        )}
      </main>

      <footer className="mv-footer">
        <span className="mv-footer__brand">DevCompass</span>
        표제어는 tech_stack_pipeline이 채용공고에서 추출한 태그를 기준으로 수집했습니다. 채용
        수요는 그 태그 빈도의 백분위 순위입니다.
      </footer>

      <MobileTabBar />
    </div>
  );
}

/**
 * 생태계 지표까지 수집된 200개. 펼치면 지표 3분해와 근거를 보여준다.
 * 손으로 쓴 설명 문장(summary)은 그중 일부에만 있어서 조건부로 그린다.
 */
function MobileDetailedEntry({ tech, open, onToggle, offMap, onPickStack }) {
  const meta = getQuadrantMeta(tech.quadrant);
  const color = `var(--quad-${meta.slug})`;

  return (
    <article className="mv-dict-entry" data-open={open}>
      <button
        type="button"
        className="mv-dict-entry__head"
        aria-expanded={open}
        aria-controls={`mv-entry-${tech.skillCode}`}
        onClick={onToggle}
      >
        <span className="mv-dict-entry__title-row">
          <span className="mv-dict-entry__name">{tech.tech}</span>
          <span className="mv-dict-entry__kind">{tech.kind ?? tech.category}</span>
          <span className="mv-dict-entry__quad">
            <span className={`mv-legend-swatch mv-legend-swatch--${meta.slug}`} />
            {meta.label}
          </span>
          {(tech.roles ?? []).map((r) => (
            <span key={r} className="mv-dict-entry__role">
              {r}
            </span>
          ))}
        </span>

        <span className="mv-dict-entry__summary">
          {tech.summary ?? tech.signals?.[0]?.title}
        </span>

        <span className="mv-dict-entry__scores">
          <span className="mv-dict-score">
            생태계 <span className="mv-dict-score__value">{tech.ecosystemScore}</span>
          </span>
          <span className="mv-dict-score">
            채용 수요 <span className="mv-dict-score__value">{tech.demand}</span>
          </span>
          <span className="mv-dict-score">
            공고 언급{" "}
            <span className="mv-dict-score__value">{tech.postings.toLocaleString("ko-KR")}</span>
          </span>
          {offMap && <span className="mv-dict-score__offmap">지도 미표시</span>}
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
        <div className="mv-dict-entry__panel" id={`mv-entry-${tech.skillCode}`}>
          <div>
            <div className="mv-dict-entry__sub">생태계 지표</div>
            <div className="mv-dict-entry__metrics">
              {ecosystemBars(tech).map((bar) => (
                <div key={bar.key}>
                  <div className="mv-dict-entry__metric-row">
                    <span>{bar.label}</span>
                    <span className="mv-dict-entry__metric-value">
                      {bar.score}
                      <span className="mv-dict-entry__metric-raw">{bar.rawText}</span>
                    </span>
                  </div>
                  <div className="mv-dict-entry__metric-track">
                    <div
                      className="mv-dict-entry__metric-fill"
                      style={{ width: `${bar.score}%`, background: color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mv-dict-entry__sub">이 자리에 있는 이유</div>
            <div className="mv-dict-entry__signals">
              {(tech.signals ?? []).map((s) => (
                <div className="mv-dict-entry__signal" key={s.meta}>
                  <span className="mv-dict-entry__signal-dot" style={{ background: color }} />
                  <span className="mv-dict-entry__signal-meta">{s.meta}</span>
                  <span className="mv-dict-entry__signal-title">{s.title}</span>
                </div>
              ))}
            </div>

            {tech.stack?.length > 0 && (
              <>
                <div className="mv-dict-entry__sub">함께 요구되는 기술</div>
                <div className="mv-dict-entry__stack">
                  {tech.stack.map((s) => (
                    <button
                      type="button"
                      className="mv-dict-entry__chip"
                      key={s}
                      onClick={() => onPickStack(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <LearnList tech={tech} prefix="mv-dict-entry" />
        </div>
      )}
    </article>
  );
}

/**
 * 생태계 지표가 없는 나머지 표제어. 서술 문구를 지어내지 않고, 채용공고에서
 * 실제로 세어진 값(공고 건수·순위·직군)과 사전에 등록된 별칭만 보여준다.
 */
function MobileBriefEntry({ tech }) {
  const untagged = tech.postings === 0;

  return (
    <article className="mv-dict-entry mv-dict-entry--brief">
      <div className="mv-dict-entry__head mv-dict-entry__head--static">
        <span className="mv-dict-entry__title-row">
          <span className="mv-dict-entry__name">{tech.tech}</span>
          <span className="mv-dict-entry__kind">{tech.category}</span>
        </span>

        <span className="mv-dict-entry__summary">
          {untagged ? (
            <>수집된 공고 어디에서도 아직 발견되지 않았습니다. 사전에는 등록돼 있습니다.</>
          ) : (
            <>
              공고 {tech.postings.toLocaleString("ko-KR")}건({tech.postingsShare}%)에서 요구돼 사전
              전체 {tech.rank}위입니다.
              {tech.aliases.length > 0 && ` 별칭 — ${tech.aliases.join(", ")}.`}
            </>
          )}
        </span>

        <span className="mv-dict-entry__scores">
          <span className="mv-dict-score">
            공고 <span className="mv-dict-score__value">{tech.postings.toLocaleString("ko-KR")}</span>
          </span>
          {(tech.roles ?? []).length > 0 && (
            <span className="mv-dict-score">{tech.roles.join(" · ")}</span>
          )}
          <span className="mv-dict-score__offmap">생태계 미수집</span>
        </span>
      </div>
    </article>
  );
}
