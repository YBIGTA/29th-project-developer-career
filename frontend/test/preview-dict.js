/* ==========================================================================
   기술 사전 페이지(dictionary.html) 동작.
   실제 앱의 DictionaryClient.jsx 가 하던 일을 순수 JS로 옮긴 것이다.
   ========================================================================== */
(() => {
  "use strict";

  const { $, QUADRANTS, metaOf, fillFooter } = window.PV;
  const DATA = window.PREVIEW;

  let query = "", quadFilter = "all", catFilter = "all", sort = "dict";

  // 표제어의 첫 글자. 기술명은 대부분 로마자라 A-Z로 묶고 나머지는 #으로 보낸다.
  const initialOf = (name) => {
    const c = (name.trim()[0] || "#").toUpperCase();
    return c >= "A" && c <= "Z" ? c : "#";
  };

  function chip(box, { key, label, slug, count, current, onPick }) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "dict-chip" + (slug ? ` dict-chip--${slug}` : "");
    b.dataset.selected = String(current === key);
    b.innerHTML = (slug ? `<span class="legend-swatch legend-swatch--${slug}"></span>` : "") +
      `${label}<span class="dict-chip__count">${count}</span>`;
    b.addEventListener("click", onPick);
    box.appendChild(b);
  }

  function renderFilters() {
    const quadCounts = {}, catCounts = {};
    for (const d of DATA.items) {
      quadCounts[d.quadrant] = (quadCounts[d.quadrant] ?? 0) + 1;
      if (d.category) catCounts[d.category] = (catCounts[d.category] ?? 0) + 1;
    }

    const quadBox = $("#dict-filters");
    quadBox.innerHTML = "";
    chip(quadBox, { key: "all", label: "전체", slug: null, count: DATA.items.length,
      current: quadFilter, onPick: () => { quadFilter = "all"; render(); } });
    for (const q of QUADRANTS) {
      chip(quadBox, { key: q.key, label: q.label, slug: q.slug, count: quadCounts[q.key] ?? 0,
        current: quadFilter, onPick: () => { quadFilter = q.key; render(); } });
    }

    const catBox = $("#dict-cats");
    catBox.innerHTML = "";
    chip(catBox, { key: "all", label: "전체 분류", slug: null, count: DATA.items.length,
      current: catFilter, onPick: () => { catFilter = "all"; render(); } });
    for (const c of Object.keys(catCounts).sort()) {
      chip(catBox, { key: c, label: c, slug: null, count: catCounts[c],
        current: catFilter, onPick: () => { catFilter = c; render(); } });
    }
  }

  // ---- 펼침 패널용 임의 지표 -------------------------------------------------
  // 목업이라 실제 GitHub/SO 수치가 없다. 기술명으로 씨앗을 잡아 매번 같은 값이
  // 나오게 한다 (다시 그려도 숫자가 안 흔들린다).
  const seedOf = (str) => {
    let h = 2166136261;
    for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  const jitter = (name, i, spread) => ((seedOf(name + i) % 1000) / 1000 - 0.5) * spread;
  const clamp = (n) => Math.max(0, Math.min(100, n));
  const compact = (n) =>
    n >= 10000 ? `${Math.round(n / 10000).toLocaleString("ko-KR")}만` : n.toLocaleString("ko-KR");

  function metricsOf(d) {
    const base = d.ecosystemScore ?? 40;
    const rows = [
      { label: "GitHub 저장소", score: clamp(base + jitter(d.tech, 1, 8)), unit: "개", scale: 1 },
      { label: "GitHub 이슈·PR", score: clamp(base + jitter(d.tech, 2, 10)), unit: "건", scale: 1.4 },
      { label: "Stack Overflow 질문", score: clamp(base + jitter(d.tech, 3, 14)), unit: "개", scale: 0.0002 },
    ];
    return rows.map((r) => ({
      ...r,
      score: Math.round(r.score * 10) / 10,
      raw: Math.max(1, Math.round((r.score ** 3) * 0.4 * r.scale * (1 + jitter(d.tech, r.label, 0.5)))),
    }));
  }

  // 학습 자료. 목업이라 검색 링크로 건다 — 눌러도 죽은 링크가 아니게.
  function learnOf(d) {
    const q = encodeURIComponent(d.tech);
    const hours = 1 + (seedOf(d.tech) % 6);
    return [
      { kind: "영상", title: `${d.tech} 입문 — ${hours}시간 완성`, meta: "YouTube · 한국어 자막",
        href: `https://www.youtube.com/results?search_query=${q}+tutorial` },
      { kind: "문서", title: `${d.tech} 공식 문서`, meta: "레퍼런스 · 영어",
        href: `https://www.google.com/search?q=${q}+official+documentation` },
      { kind: "로드맵", title: `${d.tech}를 어디서부터 볼지`, meta: "roadmap.sh · 학습 순서",
        href: "https://roadmap.sh/" },
      { kind: "실습", title: `${d.tech}로 만든 것들`, meta: `GitHub · ${d.skillCode || d.tech} 토픽`,
        href: `https://github.com/topics/${encodeURIComponent(d.skillCode || d.tech.toLowerCase())}` },
    ];
  }

  // 머리말 요약 — 사분면 설명 대신 이 기술이 공고에서 어떻게 나오는지로 바꾼다.
  function summaryOf(d, m) {
    const roles = d.roleBreakdown || [];
    if (!d.postings) return m.description;
    const share = ((d.postings / DATA.meta.totalPostings) * 100).toFixed(1);
    let out = `활성 공고 ${d.postings.toLocaleString("ko-KR")}건(${share}%)에서 요구됩니다.`;
    if (roles.length) {
      out += ` ${roles[0].role} 직군에서 가장 많이 쓰이고(${roles[0].count}건), ` +
        `${roles.length}개 직군에 걸쳐 요구됩니다.`;
    }
    return out;
  }

  // ---- 추세선 ---------------------------------------------------------------
  // 채용 언급과 생태계 열기는 단위가 다르다(건수 vs 지표). 축을 둘로 나누면
  // 기울기 비교가 거짓말이 되므로, 둘 다 백분위 0~100 한 축에 얹는다.
  const MONTHS = ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"];

  function seriesOf(d) {
    // 끝점은 지금 카드에 찍힌 값 그대로. 거기서 거꾸로 걸어 나간다 — 표에 보이는
    // 숫자와 선의 오른쪽 끝이 어긋나지 않게.
    const walk = (end, seedKey) => {
      const slope = jitter(d.tech, seedKey, 9);   // 월 평균 기울기
      const out = [];
      for (let i = MONTHS.length - 1; i >= 0; i--) {
        const back = MONTHS.length - 1 - i;
        out[i] = clamp(end - slope * back + jitter(d.tech, seedKey + i, 6));
      }
      out[MONTHS.length - 1] = clamp(end);
      return out.map((v) => Math.round(v * 10) / 10);
    };
    return {
      hiring: walk(d.demand ?? 0, "h"),
      eco: walk(d.ecosystemScore ?? 0, "e"),
      // 백분위 옆에 실제 건수도 같이 읽히게. 끝점이 지금 공고 수와 맞는다.
      counts: walk(d.demand ?? 0, "h").map((v, i, a) =>
        Math.max(0, Math.round((d.postings ?? 0) * (v / (a[a.length - 1] || 1))))),
    };
  }

  const CHART = { w: 1000, h: 230, l: 44, r: 92, t: 18, b: 30 };

  function trendHTML(d) {
    const s = seriesOf(d);
    const { w, h, l, r, t, b } = CHART;
    const x = (i) => l + (i * (w - l - r)) / (MONTHS.length - 1);
    const y = (v) => t + (1 - v / 100) * (h - t - b);
    const path = (arr) => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");

    const grid = [0, 25, 50, 75, 100].map((v) => `
      <line class="trend__grid" x1="${l}" x2="${w - r}" y1="${y(v)}" y2="${y(v)}" />
      <text class="trend__tick" x="${l - 10}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join("");

    const months = MONTHS.map((m, i) => `
      <text class="trend__tick" x="${x(i)}" y="${h - 8}" text-anchor="middle">${m.slice(2)}</text>`).join("");

    // 선 끝에 이름표를 직접 붙인다. 두 줄뿐이라 범례를 눈으로 왕복할 이유가 없다.
    const lines = [
      { key: "hiring", label: "채용 공고", color: "var(--series-hiring)", data: s.hiring },
      { key: "eco", label: "생태계", color: "var(--series-eco)", data: s.eco },
    ].map((ln) => `
      <path class="trend__line" d="${path(ln.data)}" stroke="${ln.color}" />
      <circle class="trend__end" cx="${x(MONTHS.length - 1)}" cy="${y(ln.data.at(-1))}" r="4.5" fill="${ln.color}" />
      <text class="trend__end-label" x="${w - r + 12}" y="${y(ln.data.at(-1)) + 4}" fill="${ln.color}">${ln.label}</text>
      <circle class="trend__cursor" data-series="${ln.key}" cx="0" cy="0" r="5.5" fill="${ln.color}" hidden />`).join("");

    const rows = MONTHS.map((m, i) => `
      <tr><th scope="row">${m}</th><td>${s.hiring[i].toFixed(1)}</td>
      <td>${s.counts[i].toLocaleString("ko-KR")}건</td><td>${s.eco[i].toFixed(1)}</td></tr>`).join("");

    return `
      <div class="dict-trend">
        <div class="dict-trend__head">
          <div class="dict-entry__sub">최근 6개월 추세 <span class="dict-trend__unit">· 백분위(0–100), 200개 기술 안에서의 자리</span></div>
          <div class="dict-trend__readout" hidden>
            <span class="dict-trend__readout-month"></span>
            <span class="dict-trend__readout-item">
              <span class="dict-trend__key" style="background:var(--series-hiring)"></span>
              <b class="dict-trend__readout-hiring"></b> <span class="dict-trend__readout-count"></span>
            </span>
            <span class="dict-trend__readout-item">
              <span class="dict-trend__key" style="background:var(--series-eco)"></span>
              <b class="dict-trend__readout-eco"></b>
            </span>
          </div>
        </div>

        <div class="dict-trend__frame">
          <svg class="dict-trend__svg" viewBox="0 0 ${w} ${h}" width="100%" role="img"
            aria-label="${d.tech} 최근 6개월 채용 공고·생태계 백분위 추세">
            ${grid}${months}
            <line class="trend__hair" x1="0" x2="0" y1="${t}" y2="${h - b}" hidden />
            ${lines}
          </svg>
        </div>

        <details class="dict-trend__table">
          <summary>표로 보기</summary>
          <table>
            <thead><tr><th>월</th><th>채용 백분위</th><th>공고</th><th>생태계 백분위</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </details>
      </div>`;
  }

  // 포인터가 가장 가까운 달로 붙는다. 2px 선을 정확히 겨누게 하지 않는다.
  function bindTrend(entry, d) {
    const svg = entry.querySelector(".dict-trend__svg");
    if (!svg) return;
    const s = seriesOf(d);
    const { w, l, r, t, b, h } = CHART;
    const hair = svg.querySelector(".trend__hair");
    const cursors = { hiring: svg.querySelector('[data-series="hiring"]'),
                      eco: svg.querySelector('[data-series="eco"]') };
    const box = entry.querySelector(".dict-trend__readout");
    const q = (sel) => box.querySelector(sel);

    const move = (e) => {
      const rect = svg.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;          // 화면 → viewBox
      const px = ratio * w;
      const i = Math.max(0, Math.min(MONTHS.length - 1,
        Math.round(((px - l) / (w - l - r)) * (MONTHS.length - 1))));
      const cx = l + (i * (w - l - r)) / (MONTHS.length - 1);
      const cy = (v) => t + (1 - v / 100) * (h - t - b);

      hair.hidden = false; hair.setAttribute("x1", cx); hair.setAttribute("x2", cx);
      cursors.hiring.hidden = false; cursors.hiring.setAttribute("cx", cx);
      cursors.hiring.setAttribute("cy", cy(s.hiring[i]));
      cursors.eco.hidden = false; cursors.eco.setAttribute("cx", cx);
      cursors.eco.setAttribute("cy", cy(s.eco[i]));

      box.hidden = false;
      q(".dict-trend__readout-month").textContent = MONTHS[i];
      q(".dict-trend__readout-hiring").textContent = s.hiring[i].toFixed(1);
      q(".dict-trend__readout-count").textContent = `${s.counts[i].toLocaleString("ko-KR")}건`;
      q(".dict-trend__readout-eco").textContent = s.eco[i].toFixed(1);
    };

    const leave = () => {
      hair.hidden = true; cursors.hiring.hidden = true; cursors.eco.hidden = true;
      box.hidden = true;
    };

    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerleave", leave);
  }

  function panelHTML(d, m) {
    const color = `var(--quad-${m.slug})`;
    const mt = metricsOf(d);

    const metrics = mt.map((r) => `
      <div>
        <div class="dict-entry__metric-row">
          <span>${r.label}</span>
          <span>
            <span class="dict-entry__metric-value">${r.score.toFixed(1)}</span>
            <span class="dict-entry__metric-raw">${compact(r.raw)}${r.unit}</span>
          </span>
        </div>
        <div class="dict-entry__metric-track">
          <div class="dict-entry__metric-fill" style="width:${r.score}%;background:${color}"></div>
        </div>
      </div>`).join("");

    const signals = [
      ["채용", `활성 공고 ${(d.postings ?? 0).toLocaleString("ko-KR")}건에서 요구됩니다.`],
      ["생태계 · GitHub", `저장소 ${mt[0].raw.toLocaleString("ko-KR")}개 기준 백분위 ${mt[0].score.toFixed(1)}점입니다.`],
      ["생태계 · GitHub 활동", `최근 180일 이슈·PR ${mt[1].raw.toLocaleString("ko-KR")}건 기준 백분위 ${mt[1].score.toFixed(1)}점입니다.`],
      ["생태계 · Stack Overflow", `최근 180일 질문 ${mt[2].raw.toLocaleString("ko-KR")}개 기준 백분위 ${mt[2].score.toFixed(1)}점입니다.`],
    ].map(([meta, title]) => `
      <div class="dict-entry__signal">
        <span class="dict-entry__signal-dot" style="background:${color}"></span>
        <span class="dict-entry__signal-meta">${meta}</span>
        <span class="dict-entry__signal-title">${title}</span>
      </div>`).join("");

    const learn = learnOf(d).map((l) => `
      <a class="dict-learn__item" href="${l.href}" target="_blank" rel="noopener noreferrer">
        <span class="dict-learn__kind" style="color:${color};border-color:${color}">${l.kind}</span>
        <span class="dict-learn__body">
          <span class="dict-learn__title">${l.title}</span>
          <span class="dict-learn__meta">${l.meta}</span>
        </span>
        <svg class="dict-learn__arrow" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <path d="M5.5 10.5 10.5 5.5M6 5.5h4.5V10" fill="none" stroke="currentColor"
            stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </a>`).join("");

    return `
      <div class="dict-entry__panel" style="border-top-color:${color}">
        <div class="dict-entry__cols">
          <div>
            <div class="dict-entry__sub">생태계 지표</div>
            <div class="dict-entry__metrics">${metrics}</div>
          </div>
          <div>
            <div class="dict-entry__sub">이 자리에 있는 이유</div>
            <div class="dict-entry__signals">${signals}</div>
          </div>
        </div>

        ${trendHTML(d)}

        <div class="dict-learn">
          <div class="dict-entry__sub">어떻게 배우나</div>
          <div class="dict-learn__grid">${learn}</div>
        </div>
      </div>`;
  }

  function entryHTML(d) {
    const m = metaOf(d.quadrant);
    const roles = (d.roleBreakdown || []).slice(0, 2)
      .map((r) => `<span class="dict-entry__role">${r.role}</span>`).join("");
    return `
      <article class="dict-entry dict-entry--${m.slug}" data-open="false" data-tech="${d.tech}">
        <button type="button" class="dict-entry__head" aria-expanded="false">
          <span class="dict-entry__title-row">
            <span class="dict-entry__name">${d.tech}</span>
            <span class="dict-entry__kind">${d.kind || d.category || ""}</span>
            <span class="dict-entry__quad"><span class="legend-swatch legend-swatch--${m.slug}"></span>${m.label}</span>
            ${roles}
          </span>
          <span class="dict-entry__summary">${summaryOf(d, m)}</span>
          <span class="dict-entry__scores">
            <span class="dict-score"><span class="dict-score__label">생태계</span><span class="dict-score__value">${d.ecosystemScore}</span></span>
            <span class="dict-score"><span class="dict-score__label">채용 수요</span><span class="dict-score__value">${d.demand}</span></span>
            <span class="dict-score"><span class="dict-score__label">공고 언급</span><span class="dict-score__value">${(d.postings ?? 0).toLocaleString("ko-KR")}</span></span>
          </span>
          <svg class="dict-entry__chevron" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
            <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6"
              stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </article>`;
  }

  // 패널은 누를 때 만든다. 185개를 미리 그려두면 DOM만 무거워진다.
  function toggle(entry) {
    const open = entry.dataset.open !== "true";
    entry.dataset.open = String(open);
    entry.querySelector(".dict-entry__head").setAttribute("aria-expanded", String(open));
    if (!open) { entry.querySelector(".dict-entry__panel")?.remove(); return; }
    const d = DATA.items.find((x) => x.tech === entry.dataset.tech);
    if (!d) return;
    entry.insertAdjacentHTML("beforeend", panelHTML(d, metaOf(d.quadrant)));
    bindTrend(entry, d);
  }

  function render() {
    renderFilters();

    const q = query.trim().toLowerCase();
    const rows = DATA.items.filter((d) =>
      (!q || d.tech.toLowerCase().includes(q) || (d.category || "").toLowerCase().includes(q)) &&
      (quadFilter === "all" || d.quadrant === quadFilter) &&
      (catFilter === "all" || d.category === catFilter));

    if (sort === "postings") rows.sort((a, b) => (b.postings ?? 0) - (a.postings ?? 0));
    else if (sort === "ecosystem") rows.sort((a, b) => (b.ecosystemScore ?? -1) - (a.ecosystemScore ?? -1));
    else rows.sort((a, b) => a.tech.localeCompare(b.tech, "en"));

    // 사전순일 때만 첫 글자로 묶는다. 점수순에서는 묶음이 의미가 없다 (앱과 동일).
    const grouped = sort === "dict";
    $("#dict-body").dataset.rail = String(grouped);
    // hidden 속성은 .dict-rail의 display: flex에 밀린다. 직접 끈다.
    $("#dict-rail").style.display = grouped ? "" : "none";

    const list = $("#dict-list");
    const rail = $("#dict-rail");
    list.innerHTML = "";
    rail.innerHTML = "";

    if (!rows.length) {
      list.innerHTML = `
        <div class="dict-status dict-status--empty">
          <div class="dict-status__title">찾는 기술이 없습니다</div>
          <p class="dict-status__text">다른 이름으로 검색하거나, 필터를 전체로 되돌려보세요.</p>
        </div>`;
      return;
    }

    if (!grouped) {
      const sec = document.createElement("section");
      sec.className = "dict-group";
      sec.innerHTML = rows.map(entryHTML).join("");
      list.appendChild(sec);
      return;
    }

    const groups = new Map();
    for (const d of rows) {
      const letter = initialOf(d.tech);
      if (!groups.has(letter)) groups.set(letter, []);
      groups.get(letter).push(d);
    }

    for (const [letter, items] of groups) {
      const sec = document.createElement("section");
      sec.className = "dict-group";
      sec.id = `dict-${letter}`;
      sec.innerHTML =
        `<h2 class="dict-group__letter">${letter}` +
        `<span class="dict-group__rule"></span>` +
        `<span class="dict-group__count">${items.length}</span></h2>` +
        items.map(entryHTML).join("");
      list.appendChild(sec);

      const a = document.createElement("a");
      a.className = "dict-rail__link";
      a.href = `#dict-${letter}`;
      a.textContent = letter;
      a.dataset.active = "false";
      // 색인은 "훑는" 게 아니라 "건너뛰는" 것이므로 부드러운 스크롤을 쓰지 않는다.
      // 부드럽게 굴리면 지나가는 글자마다 강조가 딸려 다닌다.
      a.addEventListener("click", (e) => {
        e.preventDefault();
        sec.scrollIntoView({ behavior: "instant", block: "start" });
        markRail(letter);
      });
      rail.appendChild(a);
    }
    markRail(groups.keys().next().value);
  }

  function markRail(letter) {
    document.querySelectorAll("#dict-rail .dict-rail__link").forEach((a) => {
      a.dataset.active = String(a.textContent === letter);
    });
  }

  // 스크롤하면 레일에서 지금 보고 있는 글자를 짚어준다. 경계 200px은 앱이
  // scroll-padding-top(88) + scroll-margin-top(108)으로 착지시키는 자리와 같다.
  function syncRail() {
    // 한 화면 넘게 내려간 뒤에야 올라갈 곳이 생긴다. 그전엔 버튼이 방해만 된다.
    $("#to-top").dataset.show = String(window.scrollY > window.innerHeight * 0.8);

    const secs = [...document.querySelectorAll("#dict-list .dict-group[id]")];
    if (!secs.length) return;
    let current = secs[0];
    for (const s of secs) if (s.getBoundingClientRect().top <= 200) current = s;
    markRail(current.id.replace("dict-", ""));
  }

  $("#dict-list").addEventListener("click", (e) => {
    const head = e.target.closest(".dict-entry__head");
    if (head) toggle(head.closest(".dict-entry"));
  });

  // Esc — 펼쳐둔 것을 전부 접는다 (지도 쪽 Esc 동작과 같은 감각).
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    document.querySelectorAll('.dict-entry[data-open="true"]').forEach(toggle);
  });

  $("#dict-search").addEventListener("input", (e) => { query = e.target.value; render(); });

  document.querySelectorAll("#dict-sort .dict-sort__btn").forEach((b) => {
    b.addEventListener("click", () => {
      sort = b.dataset.sort;
      document.querySelectorAll("#dict-sort .dict-sort__btn")
        .forEach((o) => { o.dataset.selected = String(o === b); });
      render();
    });
  });

  window.addEventListener("scroll", syncRail, { passive: true });

  $("#dict-total").textContent = DATA.items.length;
  fillFooter();
  render();
})();
