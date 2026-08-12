// 상승/하락/보합 추세를 색상에 매핑한다. GapMap 툴팁과 DetailPanel 배지가 함께 쓴다.
export function trendColor(trend) {
  if (trend === "up") return "var(--status-good-text)";
  if (trend === "down") return "var(--status-error-text)";
  return "var(--text-secondary)";
}
