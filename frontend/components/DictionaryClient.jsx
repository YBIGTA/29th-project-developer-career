"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import { QUADRANTS, getQuadrantMeta } from "@/lib/quadrants";
import { ecosystemBars, formatCount, formatDuration } from "@/lib/ecosystem";
import { mapCodeSet } from "@/lib/mapPoints";
import { getGapMapData } from "@/lib/api";
import { getSkillIndex, mergeSkills, skillHaystack } from "@/lib/skills";
import { useActiveSection } from "@/lib/useInView";

const SORTS = [
  { key: "dict", label: "사전순" },
  { key: "postings", label: "공고 언급순" },
  { key: "ecosystem", label: "생태계순" },
];

// 표제어의 첫 글자. 기술명은 대부분 로마자라 A-Z로 묶고, 나머지는 # 묶음으로 보낸다.
function initialOf(name) {
  const first = name.trim()[0]?.toUpperCase() ?? "#";
  return first >= "A" && first <= "Z" ? first : "#";
}

function matches(skill, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return skillHaystack(skill).includes(q);
}

/**
 * "어떻게 배우나" — 공식 문서 1장 + 추천 영상 3장. 넷 다 썸네일이 보인다.
 *
 * 값은 lib/techExtras.js가 응답에 얹어 준다(docs / videos). 문서는 200개 중
 * 198개, 영상은 87개에만 있으므로 없는 카드는 만들지 않는다 — 빈 껍데기를
 * 그리느니 장수가 줄어드는 편이 낫다.
 */
function LearnCards({ tech, color }) {
  const videos = (tech.videos ?? []).slice(0, 3);
  if (!tech.docs?.url && !videos.length) return null;

  // 문서 카드에는 쓸 썸네일 이미지가 없다. 그 사이트의 파비콘을 얹고, 못
  // 받아오면 (onError로 스스로 지워져) 뒤에 깔린 머리글자 타일이 보인다.
  let host = null;
  try {
    if (tech.docs?.url) host = new URL(tech.docs.url).host.replace(/^www\./, "");
  } catch {
    host = null;
  }

  return (
    <div className="dict-learn">
      <div className="dict-entry__sub">어떻게 배우나</div>
      <div className="dict-learn__grid">
        {host && (
          <a
            className="dict-learn__item"
            href={tech.docs.url}
            target="_blank"
            rel="noopener noreferrer"
            title={tech.docs.note || undefined}
          >
            <span className="dict-learn__thumb dict-learn__thumb--doc" style={{ color }}>
              <span className="dict-learn__initial">{tech.tech.slice(0, 2)}</span>
              {/* next/image를 쓰려면 도메인 159개를 remotePatterns에 등록해야 한다.
                  저장소가 의존성 3개를 유지하고 있어 평범한 img로 둔다. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="dict-learn__favicon"
                src={`https://${host}/favicon.ico`}
                alt=""
                loading="lazy"
                onError={(e) => e.currentTarget.remove()}
              />
            </span>
            <span className="dict-learn__body">
              <span className="dict-learn__kind" style={{ color }}>
                공식 문서
              </span>
              <span className="dict-learn__title">{tech.tech} 공식 문서</span>
              <span className="dict-learn__meta">{host}</span>
            </span>
          </a>
        )}

        {videos.map((v) => (
          <a
            key={v.id}
            className="dict-learn__item"
            href={`https://www.youtube.com/watch?v=${v.id}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="dict-learn__thumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`} alt="" loading="lazy" />
              <span className="dict-learn__duration">{formatDuration(v.seconds)}</span>
            </span>
            <span className="dict-learn__body">
              <span className="dict-learn__kind" style={{ color }}>
                영상
              </span>
              <span className="dict-learn__title dict-learn__title--clamp">{v.title}</span>
              <span className="dict-learn__meta">
                {v.channel} · 조회 {formatCount(v.views)}회
              </span>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

/**
 * 맨 위로. 표제어가 217개라 아래쪽에서 상단바까지 거리가 멀다.
 * href="#"이면 브라우저가 문서 맨 위로 보내고, html에 걸린
 * scroll-behavior: smooth가 부드럽게 굴려주므로 스크립트는 보임/숨김만 맡는다.
 */
function ToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <a className="to-top" href="#" data-show={show} aria-label="맨 위로">
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <path
          d="M8 12.5V4M4 7.5 8 3.5l4 4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </a>
  );
}

export default function DictionaryClient() {
  const [skills, setSkills] = useState([]);
  const [dataMeta, setDataMeta] = useState(null);
  const [indexMeta, setIndexMeta] = useState(null);
  const [mapItems, setMapItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [quadFilter, setQuadFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
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
          setSkills(mergeSkills(index.items, gapmap.items));
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
    const rows = skills.filter(
      (d) =>
        matches(d, query) &&
        (quadFilter === "all" || d.quadrant === quadFilter) &&
        (catFilter === "all" || d.category === catFilter)
    );

    if (sort === "postings") return rows.sort((a, b) => b.postings - a.postings);
    // 생태계 점수는 지표가 수집된 200개에만 있다. 점수가 없는 항목은 뒤로 민다.
    if (sort === "ecosystem")
      return rows.sort((a, b) => (b.ecosystemScore ?? -1) - (a.ecosystemScore ?? -1));
    return rows.sort((a, b) => a.tech.localeCompare(b.tech, "en"));
  }, [skills, query, quadFilter, catFilter, sort]);

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

  // 레일에서 지금 보고 있는 글자를 짚어준다.
  //
  // 경계 200px은 글자를 눌렀을 때 그 묶음이 실제로 앉는 자리에서 나왔다.
  // html의 scroll-padding-top(88) + .dict-group의 scroll-margin-top(108)이
  // 더해져 196px에 착지한다. 경계를 그보다 위(예: 128)에 두면 방금 누른
  // 묶음이 "아직 안 지나간 것"으로 판정돼 강조가 바로 앞 글자로 튄다.
  const letterIds = useMemo(
    () => groups.filter((g) => g.letter).map((g) => `dict-${g.letter}`),
    [groups]
  );
  const [activeLetterId, setActiveLetterId] = useActiveSection(letterIds, { topOffset: 200 });

  // 지도는 사분면별로 고르게 뽑은 N개까지만 찍는다. 사전에는 전부 실리므로, 지도에서
  // 잘린 항목임을 여기서 알려준다.
  const onMap = useMemo(() => mapCodeSet(mapItems, dataMeta?.mapLimit), [mapItems, dataMeta?.mapLimit]);

  const quadCounts = useMemo(() => {
    const counts = {};
    for (const d of skills) if (d.quadrant) counts[d.quadrant] = (counts[d.quadrant] ?? 0) + 1;
    return counts;
  }, [skills]);

  const catCounts = useMemo(() => {
    const counts = {};
    for (const d of skills) counts[d.category] = (counts[d.category] ?? 0) + 1;
    return counts;
  }, [skills]);

  const resetFilters = () => {
    setQuery("");
    setQuadFilter("all");
    setCatFilter("all");
  };

  return (
    <div className="page">
      <TopBar active="dictionary" />

      <main className="dict">
        <header className="dict__head">
          <h1 className="dict__title">전체 기술 목록</h1>
          <Link className="dict__back" href="/">
            <svg viewBox="0 0 16 16" aria-hidden="true" width="15" height="15">
              <path
                d="M12.8 8H3.2M7.2 4l-4 4 4 4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            지도로 돌아가기
          </Link>
        </header>

        <p className="dict__lead">
          기술 {indexMeta?.totalSkills ?? 217}개를 이름·별칭·분류로 찾아보고, 각각이 채용공고에
          얼마나 나오는지 확인하세요.
        </p>

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
              placeholder="기술 이름, 별칭(K8s·Golang), 분류로 찾기"
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

          <div className="dict-filters dict-filters--cat" role="group" aria-label="분류로 거르기">
            <button
              type="button"
              className="dict-chip"
              data-selected={catFilter === "all"}
              onClick={() => setCatFilter("all")}
            >
              전체 분류
              <span className="dict-chip__count">{skills.length}</span>
            </button>
            {(indexMeta?.categories ?? []).map((c) => (
              <button
                key={c}
                type="button"
                className="dict-chip"
                data-selected={catFilter === c}
                onClick={() => setCatFilter(c)}
              >
                {c}
                <span className="dict-chip__count">{catCounts[c] ?? 0}</span>
              </button>
            ))}
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
                <span className="dict-chip__count">{skills.length}</span>
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
                  다른 이름으로 검색하거나, 필터를 전체로 되돌려보세요.
                </p>
                <button type="button" className="dict-status__btn" onClick={resetFilters}>
                  조건 초기화
                </button>
              </div>
            ) : (
              <div className="dict-body" data-rail={sort === "dict"}>
                {sort === "dict" && (
                  <nav className="dict-rail" aria-label="첫 글자로 이동">
                    {groups.map((g) => (
                      <a
                        key={g.letter}
                        className="dict-rail__link"
                        href={`#dict-${g.letter}`}
                        data-active={activeLetterId === `dict-${g.letter}`}
                        aria-current={
                          activeLetterId === `dict-${g.letter}` ? "location" : undefined
                        }
                        // 색인은 "훑어 내려가는" 것이 아니라 "건너뛰는" 것이므로
                        // 부드러운 스크롤을 쓰지 않는다. 부드럽게 굴리면 지나가는
                        // 글자마다 옵저버가 판정을 바꿔 강조가 C·D·E…로 딸려
                        // 다니다가 뒤늦게 목적지에 도착한다. 즉시 이동하면 강조가
                        // 누른 글자에 바로 맞고 그대로 있는다.
                        // 착지 위치는 .dict-group의 scroll-margin-top이 잡아준다.
                        onClick={(e) => {
                          const target = document.getElementById(`dict-${g.letter}`);
                          if (!target) return;
                          e.preventDefault();
                          target.scrollIntoView({ behavior: "instant", block: "start" });
                          setActiveLetterId(`dict-${g.letter}`);
                          history.replaceState(null, "", `#dict-${g.letter}`);
                        }}
                      >
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

                      {group.items.map((tech) =>
                        tech.detailed ? (
                          <DetailedEntry
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
                          <BriefEntry key={tech.skillCode} tech={tech} />
                        )
                      )}
                    </section>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <ToTop />

      <footer className="page__footer">
        <span className="page__footer-brand">DevCompass</span>
        <span>
          생태계 지표는 GitHub·Stack Overflow의 최근 180일 실측값이고, 채용 수요는 수집된 공고{" "}
          {dataMeta?.totalPostings ? `${dataMeta.totalPostings.toLocaleString("ko-KR")}건` : ""}에서
          tech_stack_pipeline이 추출한 기술 태그 기준입니다. 개별 공고 목록만 아직 예시입니다.
        </span>
      </footer>
    </div>
  );
}

/**
 * 생태계 지표까지 수집된 200개. 펼치면 지표 3분해와 근거를 보여준다.
 * 손으로 쓴 해설(summary / stack / verdict)은 그중 일부에만 있어서 조건부로 그린다.
 */
function DetailedEntry({ tech, open, onToggle, offMap, onPickStack }) {
  const meta = getQuadrantMeta(tech.quadrant);
  const color = `var(--quad-${meta.slug})`;

  return (
    <article className={`dict-entry dict-entry--${meta.slug}`} data-open={open}>
      <button
        type="button"
        className="dict-entry__head"
        aria-expanded={open}
        aria-controls={`entry-${tech.skillCode}`}
        onClick={onToggle}
      >
        <span className="dict-entry__title-row">
          <span className="dict-entry__name">{tech.tech}</span>
          <span className="dict-entry__kind">{tech.kind ?? tech.category}</span>
          <span className="dict-entry__quad">
            <span className={`legend-swatch legend-swatch--${meta.slug}`} />
            {meta.label}
          </span>
          {(tech.roles ?? []).map((r) => (
            <span key={r} className="dict-entry__role">
              {r}
            </span>
          ))}
        </span>

        <span className="dict-entry__summary">
          {tech.summary ?? tech.signals?.[0]?.title}
        </span>

        {/* 배지가 점수보다 앞에 온다. 뒤에 두면 배지가 있는 행에서만 점수
            세 칸이 배지 너비만큼 왼쪽으로 밀려 행끼리 줄이 어긋난다. */}
        <span className="dict-entry__scores">
          {offMap && <span className="dict-score__offmap">지도 미표시</span>}
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
            <span className="dict-score__value">{tech.postings.toLocaleString("ko-KR")}</span>
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
        <div className="dict-entry__panel" id={`entry-${tech.skillCode}`}>
          <div className="dict-entry__cols">
            <div>
              <div className="dict-entry__sub">생태계 지표</div>
              <div className="dict-entry__metrics">
                {ecosystemBars(tech).map((bar) => (
                  <div key={bar.key}>
                    <div className="dict-entry__metric-row">
                      <span>{bar.label}</span>
                      <span className="dict-entry__metric-value">
                        {bar.score}
                        <span className="dict-entry__metric-raw">{bar.rawText}</span>
                      </span>
                    </div>
                    <div className="dict-entry__metric-track">
                      <div
                        className="dict-entry__metric-fill"
                        style={{ width: `${bar.score}%`, background: color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="dict-entry__sub">이 자리에 있는 이유</div>
              <div className="dict-entry__signals">
                {(tech.signals ?? []).map((s) => (
                  <div className="dict-entry__signal" key={s.meta}>
                    <span className="dict-entry__signal-dot" style={{ background: color }} />
                    <span className="dict-entry__signal-meta">{s.meta}</span>
                    <span className="dict-entry__signal-title">{s.title}</span>
                  </div>
                ))}
              </div>

              {tech.stack?.length > 0 && (
                <>
                  <div className="dict-entry__sub">함께 요구되는 기술</div>
                  <div className="dict-entry__stack">
                    {tech.stack.map((s) => (
                      <button
                        type="button"
                        className="dict-entry__chip"
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
          </div>

          {tech.verdict && (
            <div className="dict-entry__verdict" style={{ background: meta.tint }}>
              <div className="dict-entry__sub">지금 배운다면</div>
              <p className="dict-entry__verdict-text">{tech.verdict}</p>
            </div>
          )}

          <LearnCards tech={tech} color={color} />
        </div>
      )}
    </article>
  );
}

/**
 * 생태계 지표가 없는 나머지 표제어. 서술 문구를 지어내지 않고, 채용공고에서
 * 실제로 세어진 값(공고 건수·순위·직군)과 사전에 등록된 별칭만 보여준다.
 */
function BriefEntry({ tech }) {
  const untagged = tech.postings === 0;

  return (
    <article className="dict-entry dict-entry--brief">
      <div className="dict-entry__head dict-entry__head--static">
        <span className="dict-entry__title-row">
          <span className="dict-entry__name">{tech.tech}</span>
          <span className="dict-entry__kind">{tech.category}</span>
          {(tech.roles ?? []).map((r) => (
            <span key={r} className="dict-entry__role">
              {r}
            </span>
          ))}
        </span>

        <span className="dict-entry__summary">
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

        <span className="dict-entry__scores">
          <span className="dict-score__offmap">생태계 미수집</span>
          <span className="dict-score">
            <span className="dict-score__label">공고 언급</span>
            <span className="dict-score__value">{tech.postings.toLocaleString("ko-KR")}</span>
          </span>
          <span className="dict-score">
            <span className="dict-score__label">사전 순위</span>
            <span className="dict-score__value">{untagged ? "—" : tech.rank}</span>
          </span>
        </span>
      </div>
    </article>
  );
}
