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

  // 두 페이지가 같은 꼬리말을 쓴다.
  function fillFooter() {
    const el = $("#footer-note");
    if (!el) return;
    const m = window.PREVIEW.meta;
    el.textContent =
      `미리보기용 정적 사본입니다. 생태계·채용 수요 지표는 ${m.fromDate} ~ ${m.toDate} 기준 목업 데이터입니다.`;
  }

  return { $, QUADRANTS, metaOf, fillFooter };
})();
