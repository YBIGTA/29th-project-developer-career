/* ==========================================================================
   지도 페이지(preview.html) 동작.
   실제 앱의 GapMap.jsx / DetailPanel.jsx 가 하던 일을 순수 JS로 옮긴 것이고,
   좌표 계산은 frontend/lib/mapPoints.js 와 같은 식이다.
   ========================================================================== */
(() => {
  "use strict";

  const { $, QUADRANTS, metaOf, fillFooter, formatCount, formatDuration,
          ecosystemBars, ecosystemNote, normalizeVideos, docHost, esc } = window.PV;
  const DATA = window.PREVIEW;
  const PREVIEW_POSTINGS = window.PREVIEW_POSTINGS;

  // ------------------------------------------------- 좌표 (lib/mapPoints.js)
  const LOW = [0, 46], HIGH = [54, 100];

  // 점을 판 안쪽으로 들여 찍는다. 0%/100% 자리에 그대로 찍으면 원의 절반이
  // 판 밖으로 잘리고(.gap-map__plane이 overflow: hidden), 모서리에서는 구역
  // 이름표(.gap-map__corner) 뒤로 숨는다.
  //
  // **백분율이 아니라 픽셀로 들인다.** 이름표는 판 안쪽 12px 자리에 약 30px
  // 높이로 앉아 있고, 그 크기는 판이 커지든 작아지든 변하지 않는다. 백분율로
  // 들이면 판이 낮아질수록(--plot-h는 340px까지 내려간다) 여백이 같이 줄어
  // 가장자리 점이 다시 이름표 밑으로 들어간다.
  //
  //   세로 50px = 12(안쪽 여백) + 30(이름표 높이) + 7.5(점 반지름) + 여유
  //   가로 14px = 점 반지름 + 여유
  //
  // 가로는 이름표 너비(약 96px)만큼 들이지 않는다. 세로에서 이미 이름표를
  // 비껴가므로 가로까지 들이면 판만 좁아지고 얻는 게 없다.
  const PAD_X = 14, PAD_Y = 50;

  // `v ?? 0`으로는 NaN이 통과한다. calc()에 NaN이 들어가면 선언 자체가 무효라
  // 브라우저가 통째로 버리고, 점이 판 구석에 쌓인다.
  const clamp100 = (v) => Math.min(100, Math.max(0, Number(v) || 0));
  // 0~100 점수를 판 위의 CSS 길이로. left/bottom에 그대로 넣는다.
  const posX = (v) => `calc(${PAD_X}px + (100% - ${PAD_X * 2}px) * ${clamp100(v) / 100})`;
  const posY = (v) => `calc(${PAD_Y}px + (100% - ${PAD_Y * 2}px) * ${clamp100(v) / 100})`;
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
  let detailTab = "overview";
  let detailPrev = null;
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
      ring.style.left = posX(scaleX(selected.ecosystemScore));
      ring.style.bottom = posY(yOf(selected));
      plane.appendChild(ring);
    }

    for (const d of view) {
      const m = metaOf(d.quadrant);
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = `gap-map__dot gap-map__dot--${m.slug}` +
        (selected && selected.skillCode === d.skillCode ? " gap-map__dot--selected" : "");
      dot.style.left = posX(scaleX(d.ecosystemScore));
      dot.style.bottom = posY(yOf(d));
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
      label.style.left = posX(scaleX(selected.ecosystemScore));
      label.style.bottom = posY(yOf(selected));
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
    const x = clamp100(scaleX(d.ecosystemScore));
    const y = yOf(d);
    const above = y < 45;

    const tip = document.createElement("div");
    tip.className = "gap-map__tooltip";
    tip.style.left = posX(x);
    tip.style.bottom = `calc(${posY(y)} ${above ? "+" : "-"} ${TIP_GAP}px)`;
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
  // 배포본(components/DetailPanel.jsx)을 그대로 옮긴 것이다. 클래스 이름·문구·
  // 섹션 순서·탭 구성까지 같게 맞춘다 — preview.css가 곧 앱의 globals.css라,
  // 이름이 어긋나면 스타일이 하나도 안 붙는다.
  const EXT_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true" width="12" height="12">
      <path d="M6 3.4h6.6V10M12.6 3.4 3.6 12.4" fill="none" stroke="currentColor"
        stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>`;

  const SPARK_W = 100, SPARK_H = 44, SPARK_PAD = 5;

  /**
   * 최근 8개월 생태계 활동 추이. 그리는 값은 원시 건수가 아니라 점유율
   * 지수다 — 원시값을 쓰면 GitHub는 거의 다 상승, Stack Overflow는 거의 다
   * 하락으로 나와 개별 기술 정보가 사라진다.
   *
   * viewBox를 preserveAspectRatio="none"으로 늘려 쓰므로 선에는
   * non-scaling-stroke를 준다. 마지막 값 표시가 원이 아니라 세로 선인 것도
   * 같은 이유다 — 원은 가로로 늘어나 찌그러진다.
   */
  function trendHtml(trend) {
    const { months, index, github, stackoverflow, hasStackoverflow, delta } = trend;
    const lo = Math.min(...index, 100), hi = Math.max(...index, 100);
    const span = hi - lo;
    const yOf = (v) =>
      span === 0 ? SPARK_H / 2 : SPARK_H - SPARK_PAD - ((v - lo) / span) * (SPARK_H - SPARK_PAD * 2);
    const xOf = (i) => (index.length === 1 ? SPARK_W / 2 : (i / (index.length - 1)) * SPARK_W);

    const last = index[index.length - 1];
    const rising = last >= 100;
    const stroke = rising ? "var(--status-good-text)" : "var(--status-error-text)";
    const pts = index.map((v, i) => `${xOf(i).toFixed(2)},${yOf(v).toFixed(2)}`).join(" ");

    const rawText = [
      `GitHub 이슈·PR ${formatCount(github[github.length - 1])}건`,
      hasStackoverflow ? `Stack Overflow ${formatCount(stackoverflow[stackoverflow.length - 1])}건` : null,
    ].filter(Boolean).join(" + ");

    return `
      <div class="detail-panel__trend">
        <div class="detail-panel__trend-head">
          <span class="detail-panel__section-title">생태계 활동 추이</span>
          <span class="detail-panel__trend-range">${months[0]} → ${months[months.length - 1]}</span>
        </div>
        <div class="detail-panel__trend-body">
          <svg class="detail-panel__spark" viewBox="0 0 ${SPARK_W} ${SPARK_H}"
            preserveAspectRatio="none" role="img">
            <title>${months[0]} 대비 ${months[months.length - 1]} 지수 ${Math.round(last)}, ${rising ? "기준선 위" : "기준선 아래"}</title>
            <line x1="0" x2="${SPARK_W}" y1="${yOf(100)}" y2="${yOf(100)}" stroke="var(--line-strong)"
              stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />
            <polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="1.75"
              stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
            <line x1="${SPARK_W}" x2="${SPARK_W}" y1="${yOf(last) - 4}" y2="${yOf(last) + 4}"
              stroke="${stroke}" stroke-width="2.5" vector-effect="non-scaling-stroke" />
          </svg>
          <div class="detail-panel__trend-figures">
            <div class="detail-panel__trend-value" style="color: ${stroke}">지수 ${Math.round(last)}</div>
            ${delta ? `<div class="detail-panel__trend-sub">전월 대비 ${delta.pct > 0 ? "+" : ""}${delta.pct}%</div>` : ""}
          </div>
        </div>
        <p class="detail-panel__trend-note">${months[0]} = 100 기준 · ${months[months.length - 1]} ${rawText}</p>
        <p class="detail-panel__trend-note">${
          hasStackoverflow ? "GitHub·Stack Overflow 활동량" : "GitHub 활동량"}</p>
      </div>`;
  }

  // 학습 자료 카드. 헬퍼는 preview-common.js에 있다(사전과 공용).
  function learnHtml(t) {
    const videos = normalizeVideos(t.videos);
    const host = docHost(t.docs);
    if (!host && !videos.length) return "";

    // 문서 카드에는 쓸 그림이 없다. 머리글자 타일을 깔고 그 위에 사이트
    // 파비콘을 얹는다. 못 받아오면 img가 스스로 지워지고 타일만 남는다.
    const doc = host ? `
      <li>
        <a class="detail-panel__learn-link" href="${esc(t.docs.url)}" target="_blank"
          rel="noopener noreferrer"${t.docs.note ? ` title="${esc(t.docs.note)}"` : ""}>
          <span class="detail-panel__learn-thumb detail-panel__learn-thumb--doc">
            <span class="detail-panel__learn-initial">${esc(t.tech.slice(0, 2))}</span>
            <img class="detail-panel__learn-favicon" src="https://${esc(host)}/favicon.ico"
              alt="" loading="lazy" onerror="this.remove()" />
          </span>
          <span class="detail-panel__learn-body">
            <span class="detail-panel__learn-kind">공식 문서</span>
            <span class="detail-panel__learn-title">${esc(t.tech)} 공식 문서</span>
            <span class="detail-panel__learn-meta">${esc(host)}</span>
          </span>
        </a>
      </li>` : "";

    const clips = videos.map((v, i) => {
      // 제목이 없으면 주소만 있는 것이다. 순번으로 최소한의 이름을 만든다 —
      // 카드 넷이 전부 "영상"이면 무엇을 눌렀는지 되짚을 수 없다.
      const title = v.title || `${t.tech} 입문 영상 ${i + 1}`;
      const meta = [
        v.channel,
        typeof v.views === "number" ? `조회 ${formatCount(v.views)}회` : null,
      ].filter(Boolean).join(" · ");
      return `
      <li>
        <a class="detail-panel__learn-link" href="https://www.youtube.com/watch?v=${esc(v.id)}"
          target="_blank" rel="noopener noreferrer">
          <span class="detail-panel__learn-thumb">
            <img src="https://i.ytimg.com/vi/${esc(v.id)}/hqdefault.jpg" alt="" loading="lazy" />
            ${typeof v.seconds === "number"
              ? `<span class="detail-panel__learn-duration">${formatDuration(v.seconds)}</span>` : ""}
          </span>
          <span class="detail-panel__learn-body">
            <span class="detail-panel__learn-kind">영상</span>
            <span class="detail-panel__learn-title">${esc(title)}</span>
            ${meta ? `<span class="detail-panel__learn-meta">${esc(meta)}</span>` : ""}
          </span>
        </a>
      </li>`;
    }).join("");

    return `<ul class="detail-panel__learn">${doc}${clips}</ul>`;
  }

  // 앱은 /api/v1/tech/{code}/postings를 부르고 실패하면 mockPostings.json으로
  // 떨어진다. 미리보기는 API가 없으니 항상 그 대체 경로다 — 그래서 각주도
  // 언제나 "예시 공고"라고 밝힌다.
  function postingsHtml(tech) {
    const items = (PREVIEW_POSTINGS[tech.skillCode] ?? []).slice(0, 5);
    if (!items.length) {
      return `<div class="detail-panel__postings-status">
        ${esc(tech.tech)}을(를) 요구하는 공고를 아직 찾지 못했습니다.</div>`;
    }
    return `<ul class="detail-panel__postings">${items.map((p) => `
      <li class="detail-panel__posting">
        <div class="detail-panel__posting-company">${esc(p.company)}</div>
        <div class="detail-panel__posting-title">${esc(p.title)}</div>
        <div class="detail-panel__posting-meta">
          ${[p.location, p.employmentType, p.publishedAt].filter(Boolean).map(esc).join(" · ")}
        </div>
        ${p.applyUrl ? `<a class="detail-panel__posting-link" href="${esc(p.applyUrl)}"
          target="_blank" rel="noopener noreferrer">공고 열기${EXT_ICON}</a>` : ""}
      </li>`).join("")}</ul>`;
  }

  function renderDetail() {
    const el = $("#detail-panel");

    // 다른 기술을 고르면 개요 탭으로 되돌린다.
    if (selected !== detailPrev) { detailPrev = selected; detailTab = "overview"; }

    if (!selected) {
      el.innerHTML = `
        <div class="detail-panel__empty">
          <div class="detail-panel__empty-title">기술을 선택하세요</div>
          <p class="detail-panel__empty-text">
            차트의 점이나 아래 목록을 클릭하면 채용 공고 수요, 생태계 지표, 함께 요구되는 기술,
            그리고 이 기술을 요구하는 실제 공고를 한 자리에서 볼 수 있습니다.
          </p>
          <div class="detail-panel__empty-hint">
            오른쪽 아래 <strong style="color: var(--quad-early-mover)">선점 후보</strong>
            구역부터 보는 것을 권합니다. 생태계는 이미 활발한데 채용 수요가 아직 따라오지 않은
            자리입니다.
          </div>
        </div>`;
      return;
    }

    const t = selected;
    const m = metaOf(t.quadrant);
    const color = `var(--quad-${m.slug})`;
    const bars = ecosystemBars(t);
    const delta = t.trend?.delta;
    // 영상은 200개 중 87개 기술에만 있다. 없으면 탭 자체를 만들지 않는다 —
    // 공식 문서 링크는 배지 줄에 따로 있어서 탭이 없어도 잃는 것이 없다.
    // 배지 줄에 있던 공식 문서 알약을 없앴으므로, 문서로 가는 통로는 이제
    // 학습 탭 하나뿐이다. 영상이 없어도 문서만 있으면 탭을 만든다.
    const learnCards = learnHtml(t);
    if (detailTab === "learn" && !learnCards) detailTab = "overview";

    const deltaTone = !delta || Math.abs(delta.pct) < 1 ? "flat" : delta.pct > 0 ? "up" : "down";
    const tabBtn = (key, label) =>
      `<button type="button" role="tab" class="detail-panel__tab" data-tab="${key}"
        aria-selected="${detailTab === key}">${label}</button>`;

    const overview = `
      ${t.summary ? `<p class="detail-panel__summary">${esc(t.summary)}</p>` : ""}

      <div class="detail-panel__stats">
        <div class="detail-panel__stat">
          <div class="detail-panel__stat-label">채용 공고 언급</div>
          <div class="detail-panel__stat-value">${t.postings.toLocaleString("ko-KR")}건</div>
          <div class="detail-panel__stat-note">${esc(t.postingsNote)}</div>
        </div>
        <div class="detail-panel__stat">
          <div class="detail-panel__stat-label">채용 수요${t.roleContext ? " (직군 기준)" : ""}</div>
          <div class="detail-panel__stat-value">${t.demand}</div>
          <div class="detail-panel__stat-note">${
            t.roleContext
              ? `${esc(t.roleContext.role)} 공고 ${t.roleContext.count.toLocaleString("ko-KR")}건 · 이 직군 안에서 ${t.roleContext.rank}위`
              : `공고 언급 빈도의 백분위 순위${t.demandRank ? ` · ${DATA.meta.totalTechs}개 중 ${t.demandRank}위` : ""}`
          }</div>
        </div>
        <div class="detail-panel__stat">
          <div class="detail-panel__stat-label">생태계 종합</div>
          <div class="detail-panel__stat-value">${t.ecosystemScore}</div>
          <div class="detail-panel__stat-note">${ecosystemNote(t)}</div>
        </div>
        ${delta ? `
        <div class="detail-panel__stat">
          <div class="detail-panel__stat-label">전월 대비 생태계 활동</div>
          <div class="detail-panel__stat-value" data-tone="${deltaTone}">${
            deltaTone === "flat" ? "보합" : `${delta.pct > 0 ? "+" : ""}${delta.pct}%`}</div>
          <div class="detail-panel__stat-note">${delta.month} 점유율 지수 ${Math.round(delta.value)} · 전월 ${Math.round(delta.prevValue)}${
            deltaTone === "flat" ? "에서 거의 변동 없음" : deltaTone === "up" ? "에서 상승" : "에서 하락"}</div>
        </div>` : ""}
      </div>

      <div class="detail-panel__metrics">${bars.map((bar) => `
        <div>
          <div class="detail-panel__metric-row">
            <span class="detail-panel__metric-label">${bar.label}</span>
            <span class="detail-panel__metric-value">${bar.score}<span class="detail-panel__metric-raw">${bar.rawText}</span></span>
          </div>
          <div class="detail-panel__metric-track">
            <div class="detail-panel__metric-fill" style="width: ${bar.score}%; background: ${color}"></div>
          </div>
        </div>`).join("")}</div>

      ${t.trend ? trendHtml(t.trend) : ""}

      ${t.signals?.length ? `
        <div class="detail-panel__section-title">이 자리에 있는 이유</div>
        <div class="detail-panel__signals">${t.signals.map((s) => `
          <div class="detail-panel__signal">
            <span class="detail-panel__signal-dot" style="background: ${color}"></span>
            <div class="detail-panel__signal-meta">${esc(s.meta)}</div>
            <div class="detail-panel__signal-title">${esc(s.title)}</div>
          </div>`).join("")}</div>` : ""}

      ${t.stack?.length ? `
        <div class="detail-panel__section-title">함께 요구되는 기술</div>
        <div class="detail-panel__stack">${t.stack.map((s) =>
          `<span class="detail-panel__chip">${esc(s)}</span>`).join("")}</div>` : ""}

      <p class="detail-panel__footnote">
        생태계 지표는 GitHub·Stack Overflow의 최근 180일 실측값이고, 채용 수요는 수집된
        공고에서 추출한 기술 태그 빈도의 백분위 순위입니다. Esc 키로 닫을 수 있습니다.
      </p>`;

    const learn = `
      <p class="detail-panel__summary">
        ${esc(t.tech)}을(를) 처음 배울 때 볼 만한 공식 문서와 영상입니다.
      </p>
      ${learnCards}
      <p class="detail-panel__footnote">
        영상은 조회수와 평가를 함께 반영해 고른 영어 입문 강의입니다. 새 탭에서 열립니다.
      </p>`;

    const postings = `
      <p class="detail-panel__summary">
        ${esc(t.tech)}을(를) 요구하는 공고입니다. 회사명과 지원 링크는 수집된 채용공고에서
        그대로 가져옵니다.
      </p>
      ${postingsHtml(t)}
      <p class="detail-panel__footnote">
        채용 API에서 공고를 받지 못해 예시 공고를 대신 표시합니다.
      </p>`;

    el.innerHTML = `
      <div class="detail-panel__card">
        <div class="detail-panel__head">
          <div>
            <div class="detail-panel__eyebrow">선택한 기술</div>
            <div class="detail-panel__name-row">
              <span class="detail-panel__title">${esc(t.tech)}</span>
              <span class="detail-panel__kind">${esc(t.kind || t.category || "")}</span>
            </div>
          </div>
          <button type="button" class="detail-panel__close" id="detail-close" aria-label="닫기">✕</button>
        </div>

        <div class="detail-panel__badges">
          <span class="detail-panel__badge" style="background: ${m.tint}">
            <span class="detail-panel__badge-dot" style="background: ${color}"></span>${m.label}
          </span>
          ${(t.roles ?? []).map((r) => `<span class="detail-panel__badge">${esc(r)}</span>`).join("")}
        </div>

        <div class="detail-panel__tabs" role="tablist" aria-label="상세 정보 보기">
          ${tabBtn("overview", "개요")}
          ${learnCards ? tabBtn("learn", "학습") : ""}
          ${tabBtn("postings", "채용 공고")}
        </div>

        ${detailTab === "overview" ? overview : detailTab === "learn" ? learn : postings}
      </div>`;

    el.querySelector("#detail-close")
      .addEventListener("click", () => { selected = null; renderAll(); });
    el.querySelectorAll(".detail-panel__tab").forEach((b) => {
      b.addEventListener("click", () => { detailTab = b.dataset.tab; renderDetail(); });
    });
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

  // 미리보기는 정적 HTML이라 검사가 붙을 자리가 없다. detailPanel.test.mjs가
  // 200개 기술을 전부 그려보려고 쓰는 문 하나만 열어둔다.
  window.__previewSelect = (tech, tab) => {
    selected = tech;
    detailPrev = tech;
    detailTab = tab ?? "overview";
    renderDetail();
  };

  fillFooter();
  renderAll();
})();
