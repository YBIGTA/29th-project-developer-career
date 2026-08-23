/* ==========================================================================
   두 페이지(preview.html · dictionary.html)가 함께 쓰는 것.
   실제 앱의 lib/quadrants.js 에 해당한다.
   ========================================================================== */
window.PV = (() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  // 사분면 메타. 순서·slug·zone 은 앱의 lib/quadrants.js 와 같다.
  const QUADRANTS = [
    { key: "필수", slug: "essential", tint: "var(--quad-essential-bg)", label: "필수", zone: "top-right",
      description: "생태계 열기와 채용 수요가 모두 높은, 지금 갖춰야 하는 기술" },
    { key: "선점 후보", slug: "early-mover", tint: "var(--quad-early-mover-bg)", label: "선점 후보", zone: "bottom-right",
      description: "생태계에서는 이미 뜨고 있지만 채용 수요엔 아직 반영되지 않은, 먼저 익히면 유리한 기술" },
    { key: "희소가치", slug: "niche", tint: "var(--quad-niche-bg)", label: "희소가치", zone: "top-left",
      description: "생태계 열기는 낮지만 일부 채용에서는 여전히 요구되는 기술" },
    { key: "저관심", slug: "minimal", tint: "var(--quad-minimal-bg)", label: "저관심", zone: "bottom-left",
      description: "생태계 열기와 채용 수요가 모두 낮아 우선순위가 낮은 기술" },
  ];

  const UNKNOWN = {
    key: "미분류", slug: "unknown", label: "미분류", zone: null,
    description: "분류가 아직 없는 기술입니다.",
  };

  const metaOf = (key) => QUADRANTS.find((q) => q.key === key) || UNKNOWN;


  // ---- 앱 lib/ecosystem.js 이식 -------------------------------------------
  // 상세 패널이 배포본과 같은 문구·같은 3분해 막대를 그리려면 같은 함수가
  // 있어야 한다. 값은 preview-data.js에 이미 들어 있으니 계산이 아니라
  // 표현만 옮긴다.
  const ECOSYSTEM_SOURCES = [
    { key: "githubRepo", label: "GitHub 저장소", unit: "개" },
    { key: "githubActivity", label: "GitHub 이슈·PR", unit: "건" },
    { key: "stackoverflow", label: "Stack Overflow 질문", unit: "개" },
  ];

  function formatCount(n) {
    if (typeof n !== "number" || Number.isNaN(n)) return "—";
    if (n >= 1e8) return `${(n / 1e8).toFixed(1)}억`;
    if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString("ko-KR")}만`;
    return n.toLocaleString("ko-KR");
  }

  function ecosystemBars(tech) {
    if (!tech?.ecosystem) return [];
    return ECOSYSTEM_SOURCES.filter(({ key }) => tech.ecosystem[key]).map(({ key, label, unit }) => {
      const source = tech.ecosystem[key];
      return { key, label, score: source.score ?? 0, rawText: `${formatCount(source.raw)}${unit}` };
    });
  }

  function ecosystemNote(tech) {
    const count = ecosystemBars(tech).length;
    if (count === 0) return "생태계 지표가 아직 연결되지 않았습니다.";
    if (count === 1) return "아래 지표(0~100)를 그대로 씁니다.";
    return `아래 ${count}개 지표(각 0~100)의 평균입니다.`;
  }

  // innerHTML로 그리므로 데이터에서 온 문자열은 한 번 막아둔다.
  const esc = (v) =>
    String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // 두 페이지가 같은 꼬리말을 쓴다.
  function fillFooter() {
    const el = $("#footer-note");
    if (!el) return;
    const m = window.PREVIEW.meta;
    el.textContent =
      `미리보기용 정적 사본입니다. 생태계·채용 수요 지표는 ${m.fromDate} ~ ${m.toDate} 기준 목업 데이터입니다.`;
  }

  return { $, QUADRANTS, metaOf, fillFooter, formatCount, ecosystemBars, ecosystemNote, esc };
})();
