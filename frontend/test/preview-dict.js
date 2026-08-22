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

  function entryHTML(d) {
    const m = metaOf(d.quadrant);
    return `
      <article class="dict-entry dict-entry--${m.slug}">
        <div class="dict-entry__head dict-entry__head--static">
          <span class="dict-entry__title-row">
            <span class="dict-entry__name">${d.tech}</span>
            <span class="dict-entry__kind">${d.kind || d.category || ""}</span>
            <span class="dict-entry__quad"><span class="legend-swatch legend-swatch--${m.slug}"></span>${m.label}</span>
          </span>
          <span class="dict-entry__summary">${m.description}</span>
          <span class="dict-entry__scores">
            <span class="dict-score"><span class="dict-score__label">생태계</span><span class="dict-score__value">${d.ecosystemScore}</span></span>
            <span class="dict-score"><span class="dict-score__label">채용 수요</span><span class="dict-score__value">${d.demand}</span></span>
            <span class="dict-score"><span class="dict-score__label">공고 언급</span><span class="dict-score__value">${(d.postings ?? 0).toLocaleString("ko-KR")}</span></span>
          </span>
        </div>
      </article>`;
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

    $("#dict-count").innerHTML =
      `${rows.length}개 표제어${q ? `<span class="dict-count__q"> · &ldquo;${query}&rdquo; 검색 결과</span>` : ""}`;

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
    const secs = [...document.querySelectorAll("#dict-list .dict-group[id]")];
    if (!secs.length) return;
    let current = secs[0];
    for (const s of secs) if (s.getBoundingClientRect().top <= 200) current = s;
    markRail(current.id.replace("dict-", ""));
  }

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
