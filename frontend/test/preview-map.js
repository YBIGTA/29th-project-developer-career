/* ==========================================================================
   지도 페이지(preview.html) 동작.
   실제 앱의 GapMap.jsx / DetailPanel.jsx 가 하던 일을 순수 JS로 옮긴 것이고,
   좌표 계산은 frontend/lib/mapPoints.js 와 같은 식이다.
   ========================================================================== */
(() => {
  "use strict";

  const { $, QUADRANTS, metaOf, fillFooter } = window.PV;
  const DATA = window.PREVIEW;

  // ------------------------------------------------- 좌표 (lib/mapPoints.js)
  const LOW = [0, 46], HIGH = [54, 100], PAD = 4;

  const plot = (v) => PAD + (Math.min(100, Math.max(0, v ?? 0)) * (100 - 2 * PAD)) / 100;
  // 판 바닥에 붙은 점은 이름표를 위로 뒤집는다. 아래로 두면 판 밖으로 잘린다.
  const labelFlipsUp = (demand) => (demand ?? 0) < 12;

  function spread(v, min, max, [lo, hi]) {
    if (max <= min) return (lo + hi) / 2;
    return lo + ((v - min) * (hi - lo)) / (max - min);
  }

  // 50(사분면 경계)을 고정한 채 위/아래 띠 안에서만 편다. 축 전체를 한 번에
  // 펴면 점이 경계를 넘나들어 색과 위치가 어긋난다.
  function makeAxisScale(values) {
    const low = values.filter((v) => v < 50);
    const high = values.filter((v) => v >= 50);
    const lowMin = Math.min(...low), lowMax = Math.max(...low);
    const highMin = Math.min(...high), highMax = Math.max(...high);
    return (value) => {
      const v = value ?? 0;
      if (v < 50) return low.length ? spread(v, lowMin, lowMax, LOW) : LOW[1];
      return high.length ? spread(v, highMin, highMax, HIGH) : HIGH[0];
    };
  }

  // 채용 수요는 동점이 많아 값으로 찍으면 점이 한 줄에 가로로 쌓인다.
  // 값이 같아도 순위가 다르면 다른 높이를 받게 한다.
  function makeRankScale(items) {
    const pos = new Map();
    for (const band of [LOW, HIGH]) {
      const group = items
        .filter((it) => (band === LOW ? (it.demand ?? 0) < 50 : (it.demand ?? 0) >= 50))
        .sort((a, b) =>
          (a.demand ?? 0) - (b.demand ?? 0) ||
          a.ecosystemScore - b.ecosystemScore ||
          a.tech.localeCompare(b.tech));
      const [lo, hi] = band;
      group.forEach((it, i) =>
        pos.set(it.skillCode, group.length === 1 ? lo : lo + ((hi - lo) * i) / (group.length - 1)));
    }
    return pos;
  }

  // 사분면별로 돌아가며 뽑는다 — 수요 상위 N개만 자르면 한 구역이 독식해
  // 점이 판 위쪽 좁은 띠에만 쌓인다.
  function pickMapPoints(items, limit) {
    if (items.length <= limit) return items.slice();
    const groups = new Map();
    for (const it of items) {
      const k = it.quadrant ?? "미분류";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(it);
    }
    const queues = [...groups.entries()]
      .map(([key, list]) => ({
        key,
        list: list.slice().sort((a, b) => b.demand - a.demand || a.tech.localeCompare(b.tech)),
      }))
      .sort((a, b) => b.list.length - a.list.length || a.key.localeCompare(b.key));

    const picked = [];
    for (let round = 0; picked.length < limit; round++) {
      let took = false;
      for (const q of queues) {
        if (picked.length >= limit) break;
        if (round >= q.list.length) continue;
        picked.push(q.list[round]);
        took = true;
      }
      if (!took) break;
    }
    return picked;
  }

  // ------------------------------------------------------------------ 상태
  let limit = 60;
  let selected = null;
  let openZone = null;

  const plane = $("#plane");
  const wrap = $("#plane-wrap");

  let view = [], scaleX = () => 50, yPos = new Map();
  const yOf = (d) => yPos.get(d.skillCode) ?? 0;

  function recompute() {
    view = pickMapPoints(DATA.items, limit === "all" ? Infinity : limit);
    scaleX = makeAxisScale(view.map((d) => d.ecosystemScore));
    yPos = makeRankScale(view);
  }

  // ------------------------------------------------------------------ 지도
  function renderMap() {
    plane.innerHTML = "";
    wrap.querySelectorAll(".gap-map__dot-label, .gap-map__tooltip, .gap-map__zone-pop")
      .forEach((n) => n.remove());

    const selectedOnMap = selected && view.some((d) => d.skillCode === selected.skillCode);
    const activeZone = selected ? metaOf(selected.quadrant).zone : null;

    for (const q of QUADRANTS) {
      const z = document.createElement("span");
      z.className = `gap-map__zone gap-map__zone--${q.zone} gap-map__zone--${q.slug}`;
      z.dataset.active = String(activeZone === q.zone || openZone === q.zone);
      plane.appendChild(z);
    }

    for (const axis of ["x", "y"]) {
      const line = document.createElement("span");
      line.className = `gap-map__crossline gap-map__crossline--${axis}`;
      plane.appendChild(line);
    }

    // 모서리 이름표가 곧 구역 설명 버튼이다. 구역 바닥 전체를 누르게 하면
    // 점을 고르려다 빗나갈 때마다 설명이 열려 거슬린다.
    for (const q of QUADRANTS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `gap-map__corner gap-map__corner--${q.zone}`;
      b.dataset.open = String(openZone === q.zone);
      b.innerHTML = `<span class="gap-map__corner-swatch gap-map__corner-swatch--${q.slug}"></span>${q.label}`;
      b.addEventListener("click", () => { openZone = openZone === q.zone ? null : q.zone; renderMap(); });
      plane.appendChild(b);
    }

    // 고른 기술이 지금 판에 없으면(30 <-> 60 전환 등) 고리를 그리지 않는다.
    if (selectedOnMap) {
      const ring = document.createElement("span");
      ring.className = "gap-map__ring";
      ring.style.left = `${plot(scaleX(selected.ecosystemScore))}%`;
      ring.style.bottom = `${plot(yOf(selected))}%`;
      plane.appendChild(ring);
    }

    for (const d of view) {
      const m = metaOf(d.quadrant);
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = `gap-map__dot gap-map__dot--${m.slug}` +
        (selected && selected.skillCode === d.skillCode ? " gap-map__dot--selected" : "");
      dot.style.left = `${plot(scaleX(d.ecosystemScore))}%`;
      dot.style.bottom = `${plot(yOf(d))}%`;
      dot.setAttribute("aria-label",
        `${d.tech} — ${m.label}, 생태계 ${d.ecosystemScore}, 수요 ${d.demand}`);
      dot.addEventListener("click", () => { selected = d; renderAll(); });
      dot.addEventListener("mouseenter", () => showTooltip(d));
      dot.addEventListener("mouseleave", hideTooltip);
      dot.addEventListener("focus", () => showTooltip(d));
      dot.addEventListener("blur", hideTooltip);
      plane.appendChild(dot);
    }

    // 이름표는 "고른 점" 하나에만 붙는다. 점마다 달면 반드시 겹친다.
    if (selectedOnMap) {
      const m = metaOf(selected.quadrant);
      const label = document.createElement("span");
      label.className = `gap-map__dot-label gap-map__dot-label--${m.slug}`;
      if (labelFlipsUp(yOf(selected))) label.dataset.flip = "up";
      label.style.left = `${plot(scaleX(selected.ecosystemScore))}%`;
      label.style.bottom = `${plot(yOf(selected))}%`;
      label.textContent = selected.tech;
      wrap.appendChild(label);
    }

    if (openZone) renderZonePopover(QUADRANTS.find((q) => q.zone === openZone));
  }

  // 상자 자기 높이를 기준으로 놓는다(--tip-y). 높이를 상수로 어림해서 빼면
  // 상자 윗변이 점에 딱 붙는다.
  const TIP_GAP = 26;

  function showTooltip(d) {
    hideTooltip();
    const m = metaOf(d.quadrant);
    const filled = m.slug === "early-mover" || m.slug === "essential";
    const x = plot(scaleX(d.ecosystemScore));
    const y = plot(yOf(d));
    const above = yOf(d) < 45;

    const tip = document.createElement("div");
    tip.className = "gap-map__tooltip";
    tip.style.left = `${x}%`;
    tip.style.bottom = above ? `calc(${y}% + ${TIP_GAP}px)` : `calc(${y}% - ${TIP_GAP}px)`;
    tip.style.setProperty("--tip-x", x <= 18 ? "0" : x >= 82 ? "-100%" : "-50%");
    tip.style.setProperty("--tip-y", above ? "0px" : "100%");
    tip.innerHTML = `
      <div class="tooltip__row">
        <span class="tooltip__name">${d.tech}</span>
        <span class="tooltip__kind">${d.kind || d.category || ""}</span>
      </div>
      <div class="tooltip__quad">
        <span class="tooltip__quad-dot" style="${
          filled
            ? `background: var(--quad-${m.slug})`
            : `background: transparent; border: 1.5px ${m.slug === "niche" ? "dashed" : "solid"} var(--quad-${m.slug})`
        }"></span>${m.label}
      </div>
      <div class="tooltip__coords">
        <span>생태계 ${d.ecosystemScore}</span><span>수요 ${d.demand}</span>
      </div>
      ${d.postings > 0 ? `<div class="tooltip__postings">공고 ${d.postings.toLocaleString("ko-KR")}건</div>` : ""}`;
    wrap.appendChild(tip);
  }

  const hideTooltip = () =>
    wrap.querySelectorAll(".gap-map__tooltip").forEach((n) => n.remove());

  function renderZonePopover(q) {
    const members = view.filter((d) => d.quadrant === q.key);
    const samples = members.slice()
      .sort((a, b) => b.ecosystemScore + b.demand - (a.ecosystemScore + a.demand))
      .slice(0, 2);

    const pop = document.createElement("div");
    pop.className = `gap-map__zone-pop gap-map__zone-pop--${q.zone}`;
    pop.setAttribute("role", "dialog");
    pop.innerHTML = `
      <div class="gap-map__zone-pop-head">
        <span class="legend-swatch legend-swatch--${q.slug}"></span>
        <span class="gap-map__zone-pop-label">${q.label}</span>
        <span class="gap-map__zone-pop-count">${members.length}개</span>
        <button type="button" class="gap-map__zone-pop-close" aria-label="설명 닫기">
          <svg viewBox="0 0 16 16" aria-hidden="true" width="11" height="11">
            <path d="m4.5 4.5 7 7m0-7-7 7" fill="none" stroke="currentColor"
              stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <p class="gap-map__zone-pop-desc">${q.description}</p>
      <div class="gap-map__zone-pop-samples">
        ${samples.map((s) => `<button type="button" class="gap-map__zone-pop-tag" data-tech="${s.skillCode}">${s.tech}</button>`).join("")}
      </div>`;

    pop.querySelector(".gap-map__zone-pop-close")
      .addEventListener("click", () => { openZone = null; renderMap(); });
    pop.querySelectorAll(".gap-map__zone-pop-tag").forEach((b) => {
      b.addEventListener("click", () => {
        selected = view.find((d) => d.skillCode === b.dataset.tech) || selected;
        openZone = null;
        renderAll();
      });
    });
    wrap.appendChild(pop);
  }

  // -------------------------------------------------------------- 상세 패널
  // 클래스 이름은 앱의 DetailPanel과 같게 맞춘다 — preview.css가 곧 앱의
  // globals.css라, 이름이 어긋나면 스타일이 하나도 안 붙는다.
  function renderDetail() {
    const el = $("#detail-panel");
    if (!selected) {
      el.innerHTML = `
        <div class="detail-panel__empty">
          <div class="detail-panel__empty-title">기술을 골라보세요</div>
          <p class="detail-panel__empty-text">
            판 위의 점을 누르거나 아래 목록에서 고르면 그 기술의 지표가 여기에 나옵니다.
          </p>
        </div>`;
      return;
    }

    const m = metaOf(selected.quadrant);
    const bar = (label, value) => `
      <div>
        <div class="detail-panel__metric-row">
          <span class="detail-panel__metric-label">${label}</span>
          <span class="detail-panel__metric-value">${value}</span>
        </div>
        <div class="detail-panel__metric-track">
          <div class="detail-panel__metric-fill"
               style="width: ${Math.max(0, Math.min(100, value))}%; background: var(--quad-${m.slug})"></div>
        </div>
      </div>`;

    el.innerHTML = `
      <div class="detail-panel__card">
        <div class="detail-panel__head">
          <div>
            <div class="detail-panel__eyebrow">선택한 기술</div>
            <div class="detail-panel__name-row">
              <span class="detail-panel__title">${selected.tech}</span>
              <span class="detail-panel__kind">${selected.kind || selected.category || ""}</span>
            </div>
          </div>
          <button type="button" class="detail-panel__close" id="detail-close" aria-label="닫기">✕</button>
        </div>
        <div class="detail-panel__badges">
          <span class="detail-panel__badge" style="background: var(--quad-${m.slug}-bg)">
            <span class="detail-panel__badge-dot" style="background: var(--quad-${m.slug})"></span>${m.label}
          </span>
        </div>
        <p class="detail-panel__summary">${m.description}</p>
        <div class="detail-panel__metrics">
          ${bar("생태계 활동", selected.ecosystemScore)}
          ${bar("채용 수요", selected.demand)}
        </div>
        <div class="detail-panel__footnote">
          공고 ${(selected.postings ?? 0).toLocaleString("ko-KR")}건에서 요구됩니다.
        </div>
      </div>`;

    el.querySelector("#detail-close")
      .addEventListener("click", () => { selected = null; renderAll(); });
  }

  // ---------------------------------------------------------------- 칩 목록
  function renderWatchlist() {
    const box = $("#watchlist");
    box.innerHTML = "";
    for (const d of view) {
      const m = metaOf(d.quadrant);
      const b = document.createElement("button");
      b.type = "button";
      b.className = `gap-map__chip gap-map__chip--${m.slug}` +
        (selected && selected.skillCode === d.skillCode ? " gap-map__chip--selected" : "");
      b.innerHTML = `<span class="legend-swatch legend-swatch--${m.slug}"></span>${d.tech}`;
      b.addEventListener("click", () => { selected = d; renderAll(); });
      box.appendChild(b);
    }
  }

  // ------------------------------------------------------------------- 배선
  function renderAll() {
    recompute();
    renderMap();
    renderDetail();
    renderWatchlist();
    $("#result-count").textContent = `${view.length}개 표시 · 전체 ${DATA.items.length}개`;
  }

  document.querySelectorAll(".chart-panel__limit").forEach((b) => {
    b.addEventListener("click", () => {
      limit = b.dataset.limit === "all" ? "all" : Number(b.dataset.limit);
      document.querySelectorAll(".chart-panel__limit")
        .forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
      renderAll();
    });
  });

  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (openZone) { openZone = null; renderMap(); }
    else if (selected) { selected = null; renderAll(); }
  });

  fillFooter();
  renderAll();
})();
