/* ==========================================================================
   지도 페이지(preview.html) 동작.
   실제 앱의 GapMap.jsx / DetailPanel.jsx 가 하던 일을 순수 JS로 옮긴 것이고,
   좌표 계산은 frontend/lib/mapPoints.js 와 같은 식이다.
   ========================================================================== */
(() => {
  "use strict";

  const { $, QUADRANTS, metaOf, fillFooter, indexSeries } = window.PV;
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

  // -------------------------------------------------------------- 직군 필터
  // "전체"에서 y축은 200개 전부를 놓고 매긴 백분위다. 직군을 고르면 그 직군
  // 공고에 실제로 등장한 기술끼리만 다시 매긴 값으로 갈아끼운다. 생태계 점수
  // (x축)는 직군과 무관하므로 그대로 둔다 — 앱의 lib/roles.js 와 같다.
  const ALL_ROLES = "all";

  function projectByRole(items, role) {
    if (!role || role === ALL_ROLES) return items;
    const out = [];
    for (const item of items) {
      const hit = (item.roleBreakdown || []).find((b) => b.role === role);
      if (!hit) continue;
      out.push({
        ...item,
        demand: hit.demand,
        quadrant: hit.quadrant,
        roleContext: { role, count: hit.count, rank: hit.rank },
      });
    }
    return out;
  }

  // ------------------------------------------------------------------ 상태
  let limit = 60;
  let selected = null;
  let openZone = null;
  let role = ALL_ROLES;

  const plane = $("#plane");
  const wrap = $("#plane-wrap");

  let filtered = [], view = [], scaleX = () => 50, yPos = new Map();
  const yOf = (d) => yPos.get(d.skillCode) ?? 0;

  function recompute() {
    filtered = projectByRole(DATA.items, role);
    view = pickMapPoints(filtered, limit === "all" ? Infinity : limit);
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
      ${
        // 직군이 걸려 있으면 y축이 그 직군 기준이므로 건수도 직군 건수를 보여준다.
        // 좌표와 다른 모집단의 숫자를 나란히 두지 않기 위해서다.
        d.roleContext
          ? `<div class="tooltip__postings">${d.roleContext.role} ${d.roleContext.count.toLocaleString("ko-KR")}건</div>`
          : d.postings > 0
            ? `<div class="tooltip__postings">공고 ${d.postings.toLocaleString("ko-KR")}건</div>`
            : ""
      }`;
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

    // 채용 수요는 백분위라 "몇 위인지"가 붙어야 읽힌다. 목업엔 순위가 없어 센다.
    const rank = DATA.items.filter((d) => (d.demand ?? 0) > (selected.demand ?? 0)).length + 1;
    const share = DATA.meta.totalPostings
      ? ((selected.postings ?? 0) / DATA.meta.totalPostings) * 100 : 0;

    const hiring = indexSeries(selected.tech, "hiring");
    const eco = indexSeries(selected.tech, "eco");

    const toneOf = (pct) => (Math.abs(pct) < 1 ? "flat" : pct > 0 ? "up" : "down");
    const signed = (pct) => `${pct > 0 ? "+" : ""}${pct}%`;

    // 공고가 적은 기술에서 전월 대비 %는 추세가 아니라 우연이다. 200개 중
    // 절반이 전 기간 12건 이하 — 월 2건짜리가 3건이 되면 +50%로 찍힌다.
    // 그래서 문턱을 넘지 못하면 숫자를 아예 내주지 않는다.
    const MIN_POSTINGS = 30;
    const thin = (selected.postings ?? 0) < MIN_POSTINGS;

    const deltaStat = (label, series, unit, gated) => `
      <div class="detail-panel__stat">
        <div class="detail-panel__stat-label">${label}</div>
        ${gated
          ? `<div class="detail-panel__stat-value" data-tone="flat">판단 유보</div>
             <div class="detail-panel__stat-note">
               전 기간 공고 ${(selected.postings ?? 0).toLocaleString("ko-KR")}건 · 월 ${Math.round((selected.postings ?? 0) / 8)}건
               수준이라 월별 증감을 추세로 읽지 않습니다.
             </div>`
          : `<div class="detail-panel__stat-value" data-tone="${toneOf(series.delta.pct)}">${signed(series.delta.pct)}</div>
             <div class="detail-panel__stat-note">
               ${series.delta.month} ${unit} ${series.delta.value} · 전월 ${series.delta.prevValue}에서
               ${series.delta.pct > 0 ? "상승" : series.delta.pct < 0 ? "하락" : "보합"}
             </div>`}
      </div>`;

    // 스파크라인. viewBox를 가로로 늘려 쓰므로 선에 non-scaling-stroke를 준다.
    // 같은 이유로 마지막 값 표시는 원이 아니라 세로 선이다 — 원은 찌그러진다.
    const spark = (series, gated) => {
      const W = 100, H = 40, PADY = 5;
      const lo = Math.min(...series.index, 100), hi = Math.max(...series.index, 100);
      const span = hi - lo;
      const y = (v) => span === 0 ? H / 2 : H - PADY - ((v - lo) / span) * (H - PADY * 2);
      const x = (i) => (i / (series.index.length - 1)) * W;
      const rising = series.index[series.index.length - 1] >= 100;
      const stroke = gated ? "var(--text-muted)"
        : rising ? "var(--status-good-text)" : "var(--status-error-text)";
      const pts = series.index.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
      const lastY = y(series.index[series.index.length - 1]);
      return `
        <svg class="detail-panel__spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">
          <title>${series.months[0]} 대비 ${series.delta.month} 지수 ${Math.round(series.delta.value)}</title>
          <line x1="0" x2="${W}" y1="${y(100)}" y2="${y(100)}" stroke="var(--line-strong)"
            stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />
          <polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="1.5"
            stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
          <line x1="${W}" x2="${W}" y1="${lastY - 3}" y2="${lastY + 3}" stroke="${stroke}"
            stroke-width="2" vector-effect="non-scaling-stroke" />
        </svg>`;
    };

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

        <div class="detail-panel__stats">
          <div class="detail-panel__stat">
            <div class="detail-panel__stat-label">채용 수요</div>
            <div class="detail-panel__stat-value">${selected.demand}</div>
            <div class="detail-panel__stat-note">
              활성 공고 ${(selected.postings ?? 0).toLocaleString("ko-KR")}건(${share.toFixed(1)}%)에서 요구
              · ${DATA.items.length}개 중 ${rank}위
            </div>
          </div>
          <div class="detail-panel__stat">
            <div class="detail-panel__stat-label">생태계 종합</div>
            <div class="detail-panel__stat-value">${selected.ecosystemScore}</div>
            <div class="detail-panel__stat-note">GitHub 저장소·이슈·PR과 Stack Overflow 질문을 0~100으로 환산한 값입니다.</div>
          </div>
          ${deltaStat("전월 대비 채용 공고", hiring, "점유율 지수", thin)}
          ${deltaStat("전월 대비 생태계 활동", eco, "점유율 지수", false)}
        </div>

        <div class="detail-panel__trend">
          <div class="detail-panel__trend-head">
            <span class="detail-panel__section-title">채용 공고 추이</span>
            <span class="detail-panel__trend-range">${hiring.months[0]} → ${hiring.delta.month}</span>
          </div>
          <div class="detail-panel__trend-body">
            ${spark(hiring, thin)}
            <div class="detail-panel__trend-read">
              <span class="detail-panel__trend-index">지수 ${Math.round(hiring.delta.value)}</span>
              ${thin
                ? `<span class="detail-panel__trend-delta">판단 유보</span>`
                : `<span class="detail-panel__trend-delta" data-tone="${toneOf(hiring.delta.pct)}">전월 대비 ${signed(hiring.delta.pct)}</span>`}
            </div>
          </div>
          <p class="detail-panel__trend-note">
            ${hiring.months[0]} = 100 기준 · 건수가 아니라 그 달 전체 공고에서 차지하는
            비중입니다. 채용시장 전체가 커지거나 줄어드는 효과를 걷어냈습니다.${
              thin ? ` 다만 이 기술은 표본이 ${MIN_POSTINGS}건에 못 미쳐 선을 회색으로 둡니다.` : ""}
          </p>
        </div>

        <div class="detail-panel__footnote">
          추세는 미리보기용 임의값입니다. 실데이터는 <code>/api/v1/timeseries</code>의
          월별 공고 수에서 나옵니다.
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

  // -------------------------------------------------------- 직군 드롭다운
  function renderRoleMenu() {
    const menu = $("#role-menu");
    menu.innerHTML = "";
    const options = [{ value: ALL_ROLES, label: "전체" },
      ...(DATA.meta.roles || []).map((r) => ({ value: r, label: r }))];

    for (const o of options) {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(o.value === role));
      const b = document.createElement("button");
      b.type = "button";
      b.className = "filter-select__option" +
        (o.value === role ? " filter-select__option--selected" : "");
      b.textContent = o.label;
      b.addEventListener("click", () => {
        role = o.value;
        // 직군을 바꾸면 y축 기준이 바뀐다. 열려 있던 상세는 이전 기준의 값을
        // 들고 있게 되므로 선택을 비워 섞이지 않게 한다 (앱과 동일).
        selected = null;
        openZone = null;
        closeRoleMenu();
        $("#role-current").textContent = o.label;
        renderAll();
      });
      li.appendChild(b);
      menu.appendChild(li);
    }
  }

  function openRoleMenu() {
    renderRoleMenu();
    $("#role-menu").hidden = false;
    $("#role-trigger").setAttribute("aria-expanded", "true");
    document.addEventListener("mousedown", onOutside);
  }

  function closeRoleMenu() {
    $("#role-menu").hidden = true;
    $("#role-trigger").setAttribute("aria-expanded", "false");
    document.removeEventListener("mousedown", onOutside);
  }

  const onOutside = (e) => {
    if (!$("#role-field").contains(e.target)) closeRoleMenu();
  };

  $("#role-trigger").addEventListener("click", () => {
    if ($("#role-menu").hidden) openRoleMenu();
    else closeRoleMenu();
  });

  // ------------------------------------------------------------------- 배선
  function renderAll() {
    recompute();
    renderMap();
    renderDetail();
    renderWatchlist();
    $("#result-count").textContent = `${filtered.length} / ${DATA.items.length}개 기술`;
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
    if (!$("#role-menu").hidden) closeRoleMenu();
    else if (openZone) { openZone = null; renderMap(); }
    else if (selected) { selected = null; renderAll(); }
  });

  fillFooter();
  renderAll();
})();
