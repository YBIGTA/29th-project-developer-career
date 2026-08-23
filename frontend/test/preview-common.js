/* ==========================================================================
   두 페이지(preview.html · dictionary.html)가 함께 쓰는 것.
   실제 앱의 lib/quadrants.js 에 해당한다.
   ========================================================================== */
window.PV = (() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  // 사분면 메타. 순서·slug·zone 은 앱의 lib/quadrants.js 와 같다.
  const QUADRANTS = [
    { key: "필수", slug: "essential", label: "필수", zone: "top-right",
      description: "생태계 열기와 채용 수요가 모두 높은, 지금 갖춰야 하는 기술" },
    { key: "선점 후보", slug: "early-mover", label: "선점 후보", zone: "bottom-right",
      description: "생태계에서는 이미 뜨고 있지만 채용 수요엔 아직 반영되지 않은, 먼저 익히면 유리한 기술" },
    { key: "희소가치", slug: "niche", label: "희소가치", zone: "top-left",
      description: "생태계 열기는 낮지만 일부 채용에서는 여전히 요구되는 기술" },
    { key: "저관심", slug: "minimal", label: "저관심", zone: "bottom-left",
      description: "생태계 열기와 채용 수요가 모두 낮아 우선순위가 낮은 기술" },
  ];

  const UNKNOWN = {
    key: "미분류", slug: "unknown", label: "미분류", zone: null,
    description: "분류가 아직 없는 기술입니다.",
  };

  const metaOf = (key) => QUADRANTS.find((q) => q.key === key) || UNKNOWN;


  // ---- 월별 점유율 지수 (미리보기용 임의값) ---------------------------------
  // 앱의 build_tech_extras.py와 같은 정의를 흉내낸다: 원시 건수가 아니라 그 달
  // 전체에서 차지하는 비중을, 첫 달 100으로 잡은 지수. 원시 건수로 그리면
  // 시장/플랫폼 전체의 성장·축소가 모든 기술에 똑같이 실려 개별 신호가 사라진다.
  //
  // 목업이라 실제 월별 데이터가 없다. 기술명으로 씨앗을 잡아 다시 그려도 숫자가
  // 흔들리지 않게 한다. 실데이터는 GET /api/v1/timeseries 에서 온다 (아직 프론트
  // 어디서도 부르지 않는다).
  const TREND_MONTHS = ["2025-12", "2026-01", "2026-02", "2026-03",
                        "2026-04", "2026-05", "2026-06", "2026-07"];

  const seedOf = (str) => {
    let h = 2166136261;
    for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  const jitter = (name, key, spread) => ((seedOf(name + key) % 1000) / 1000 - 0.5) * spread;
  const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
  const compact = (n) =>
    n >= 10000 ? `${Math.round(n / 10000).toLocaleString("ko-KR")}만` : n.toLocaleString("ko-KR");

  /** 첫 달 100에서 출발하는 지수와, 마지막 두 달의 증감률. */
  function indexSeries(name, key) {
    const slope = jitter(name, key + "s", 9);        // 월 평균 기울기
    const index = TREND_MONTHS.map((_, i) =>
      i === 0 ? 100 : Math.round(clamp(100 + slope * i + jitter(name, key + i, 22), 20, 260) * 10) / 10);
    const to = index[index.length - 1], from = index[index.length - 2];
    return {
      months: TREND_MONTHS,
      index,
      delta: {
        pct: Math.round((to / from - 1) * 1000) / 10,
        value: to,
        prevValue: from,
        month: TREND_MONTHS[TREND_MONTHS.length - 1],
      },
    };
  }

  // 두 페이지가 같은 꼬리말을 쓴다.
  function fillFooter() {
    const el = $("#footer-note");
    if (!el) return;
    const m = window.PREVIEW.meta;
    el.textContent =
      `미리보기용 정적 사본입니다. 생태계·채용 수요 지표는 ${m.fromDate} ~ ${m.toDate} 기준 목업 데이터입니다.`;
  }

  return { $, QUADRANTS, metaOf, fillFooter,
           TREND_MONTHS, seedOf, jitter, clamp, compact, indexSeries };
})();
