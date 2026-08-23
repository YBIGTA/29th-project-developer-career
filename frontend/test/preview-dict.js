/* ==========================================================================
   기술 사전 페이지(dictionary.html) 동작.
   실제 앱의 DictionaryClient.jsx 가 하던 일을 순수 JS로 옮긴 것이다.
   ========================================================================== */
(() => {
  "use strict";

  const { $, QUADRANTS, metaOf, fillFooter, formatCount, formatDuration,
          ecosystemBars, normalizeVideos, docHost, esc } = window.PV;
  const DATA = window.PREVIEW;

  let query = "", quadFilter = "all", catFilter = "all", sort = "dict";

  // 검색 대상 문자열. 별칭까지 넣어야 "K8s", "Golang" 같은 표기로도 찾힌다.
  // 앱의 lib/skills.js skillHaystack과 같다.
  const haystack = (d) => [
    d.tech, d.category, d.kind, ...(d.aliases ?? []), ...(d.roles ?? []),
    d.summary, ...(d.stack ?? []),
  ].filter(Boolean).join(" ").toLowerCase();

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

  // 학습 자료. 공식 문서 1개 + 추천 영상 3개를, 모두 썸네일이 보이는 카드로 건다.
  // 없는 자료는 카드를 만들지 않는다 — 빈 껍데기를 그리느니 장수가 주는 편이 낫다.
  // URL만 있어도 카드가 서게 하는 헬퍼는 preview-common.js에 있다(지도와 공용).
  // 문서 카드에는 쓸 썸네일 이미지가 없다. 그 사이트의 파비콘을 얹고, 못 받아오면
  // (onerror로 스스로 지워져) 뒤에 깔린 머리글자 타일이 그대로 보인다.
  function docCard(d, color) {
    const host = docHost(d.docs);
    if (!host) return "";
    return `
      <a class="dict-learn__item" href="${esc(d.docs.url)}" target="_blank" rel="noopener noreferrer"
        ${d.docs.note ? `title="${esc(d.docs.note)}"` : ""}>
        <span class="dict-learn__thumb dict-learn__thumb--doc" style="color:${color}">
          <span class="dict-learn__initial">${esc(d.tech.slice(0, 2))}</span>
          <img class="dict-learn__favicon" src="https://${esc(host)}/favicon.ico" alt=""
            loading="lazy" onerror="this.remove()" />
        </span>
        <span class="dict-learn__body">
          <span class="dict-learn__kind" style="color:${color}">공식 문서</span>
          <span class="dict-learn__title">${esc(d.tech)} 공식 문서</span>
          <span class="dict-learn__meta">${esc(host)}</span>
        </span>
      </a>`;
  }

  function videoCards(d, color) {
    return normalizeVideos(d.videos).map((v, i) => `
      <a class="dict-learn__item" href="https://www.youtube.com/watch?v=${esc(v.id)}"
        target="_blank" rel="noopener noreferrer">
        <span class="dict-learn__thumb">
          <img src="https://i.ytimg.com/vi/${esc(v.id)}/hqdefault.jpg" alt="" loading="lazy" />
          ${typeof v.seconds === "number"
            ? `<span class="dict-learn__duration">${formatDuration(v.seconds)}</span>` : ""}
        </span>
        <span class="dict-learn__body">
          <span class="dict-learn__kind" style="color:${color}">영상</span>
          <span class="dict-learn__title dict-learn__title--clamp">${esc(v.title || `${d.tech} 입문 영상 ${i + 1}`)}</span>
          ${(() => {
            const meta = [v.channel, typeof v.views === "number" ? `조회 ${formatCount(v.views)}회` : null]
              .filter(Boolean).join(" · ");
            return meta ? `<span class="dict-learn__meta">${esc(meta)}</span>` : "";
          })()}
        </span>
      </a>`).join("");
  }


  function panelHTML(d, m) {
    const color = `var(--quad-${m.slug})`;

    // 지표도 근거 문장도 응답에 실려 온 실측값이다. 예전에는 여기서 기술명을
    // 씨앗 삼아 난수로 지어냈는데, preview-data.js가 앱과 같은 필드를 갖게
    // 되면서 지어낼 이유가 없어졌다. ecosystemBars는 응답에 있는 지표만
    // 돌려주므로 세 개가 다 오지 않아도 그대로 그린다.
    const metrics = ecosystemBars(d).map((bar) => `
      <div>
        <div class="dict-entry__metric-row">
          <span>${esc(bar.label)}</span>
          <span class="dict-entry__metric-value">${bar.score}<span class="dict-entry__metric-raw">${esc(bar.rawText)}</span></span>
        </div>
        <div class="dict-entry__metric-track">
          <div class="dict-entry__metric-fill" style="width:${bar.score}%;background:${color}"></div>
        </div>
      </div>`).join("");

    const signals = (d.signals ?? []).map((s) => `
      <div class="dict-entry__signal">
        <span class="dict-entry__signal-dot" style="background:${color}"></span>
        <span class="dict-entry__signal-meta">${esc(s.meta)}</span>
        <span class="dict-entry__signal-title">${esc(s.title)}</span>
      </div>`).join("");

    // 칩을 누르면 그 기술로 검색이 걸린다. 앱의 onPickStack과 같은 동작이다.
    const stack = d.stack?.length ? `
      <div class="dict-entry__sub">함께 요구되는 기술</div>
      <div class="dict-entry__stack">${d.stack.map((t) =>
        `<button type="button" class="dict-entry__chip" data-stack="${esc(t)}">${esc(t)}</button>`).join("")}</div>` : "";

    const learn = docCard(d, color) + videoCards(d, color);

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
            ${stack}
          </div>
        </div>

        ${learn ? `
        <div class="dict-learn">
          <div class="dict-entry__sub">어떻게 배우나</div>
          <div class="dict-learn__grid">${learn}</div>
        </div>` : ""}
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
          <span class="dict-entry__summary">${esc(d.summary ?? d.signals?.[0]?.title ?? m.description)}</span>
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

    // 연관 기술 칩 -> 그 기술로 검색. 앱의 onPickStack과 같은 동작이다.
    entry.querySelectorAll(".dict-entry__chip").forEach((b) => {
      b.addEventListener("click", () => {
        query = b.dataset.stack;
        $("#dict-search").value = query;
        render();
      });
    });
  }

  function render() {
    renderFilters();

    const q = query.trim().toLowerCase();
    const rows = DATA.items.filter((d) =>
      (!q || haystack(d).includes(q)) &&
      (quadFilter === "all" || d.quadrant === quadFilter) &&
      (catFilter === "all" || d.category === catFilter));

    $("#dict-count").innerHTML = `${rows.length}개 표제어` +
      (query ? `<span class="dict-count__q"> · &ldquo;${esc(query)}&rdquo; 검색 결과</span>` : "");
    $("#dict-clear").hidden = !query;

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
          <button type="button" class="dict-status__btn" id="dict-reset">조건 초기화</button>
        </div>`;
      $("#dict-reset").addEventListener("click", () => {
        query = ""; quadFilter = "all"; catFilter = "all";
        $("#dict-search").value = "";
        render();
      });
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

  $("#dict-clear").addEventListener("click", () => {
    query = "";
    $("#dict-search").value = "";
    $("#dict-search").focus();
    render();
  });

  document.querySelectorAll("#dict-sort .dict-sort__btn").forEach((b) => {
    b.addEventListener("click", () => {
      sort = b.dataset.sort;
      document.querySelectorAll("#dict-sort .dict-sort__btn")
        .forEach((o) => { o.dataset.selected = String(o === b); });
      render();
    });
  });

  window.addEventListener("scroll", syncRail, { passive: true });

  // preview-map.js의 __previewSelect와 같은 이유로 열어둔 검사용 문 하나.
  window.__previewPanel = (d) => panelHTML(d, metaOf(d.quadrant));

  $("#dict-total").textContent = DATA.items.length;
  fillFooter();
  render();
})();
