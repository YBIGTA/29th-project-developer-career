// 사분면 메타데이터 — 색상/설명/배경 강조 여부를 한 곳에서 관리한다.
//
// 중요: quadrant 값은 데이터팀이 이미 계산해서 내려주는 필드다.
// 프론트에서는 이 값을 색상/라벨에 매핑만 하고, 좌표로부터 재계산하지 않는다.
// (차트의 X=50 / Y=50 배경 4분할선은 어디까지나 시각적 참고선이며,
//  실제 색상은 각 점의 quadrant 필드를 따른다.)
export const QUADRANTS = [
  {
    key: "필수",
    slug: "essential",
    label: "필수",
    description: "생태계 열기와 채용 수요가 모두 높은, 지금 갖춰야 하는 기술",
    zone: "top-right",
    tint: "var(--quad-essential-bg)",
  },
  {
    key: "선점 후보",
    slug: "early-mover",
    label: "선점 후보",
    description:
      "생태계에서는 이미 뜨고 있지만 채용 수요엔 아직 반영되지 않은, 먼저 익히면 유리한 기술",
    zone: "bottom-right",
    highlight: true,
    tint: "var(--quad-early-mover-bg)",
  },
  {
    key: "희소가치",
    slug: "niche",
    label: "희소가치",
    description: "생태계 열기는 낮지만 일부 채용에서는 여전히 요구되는 기술",
    zone: "top-left",
    tint: "var(--quad-niche-bg)",
  },
  {
    key: "저관심",
    slug: "minimal",
    label: "저관심",
    description: "생태계 열기와 채용 수요가 모두 낮아 우선순위가 낮은 기술",
    zone: "bottom-left",
    tint: "var(--quad-minimal-bg)",
  },
];

const QUADRANT_MAP = Object.fromEntries(QUADRANTS.map((q) => [q.key, q]));

const UNKNOWN_QUADRANT = {
  key: "미분류",
  slug: "unknown",
  label: "미분류",
  description: "데이터팀 분류가 아직 없는 기술입니다.",
  zone: null,
  tint: "var(--quad-unknown-bg)",
};

export function getQuadrantMeta(key) {
  return QUADRANT_MAP[key] ?? { ...UNKNOWN_QUADRANT, key: key || "미분류" };
}
