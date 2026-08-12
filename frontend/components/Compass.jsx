import { QUADRANTS } from "@/lib/quadrants";

// 나침반 눈금판 위 사분면 배치는 아래 지도의 배치와 같다.
// (오른쪽 = 생태계 활동 높음, 위 = 채용 수요 높음)
//
// 네 라벨은 모두 중심(200,200)에서 대각선으로 정확히 ±80 떨어진 자리에 놓는다.
// 라벨이 들어갈 자리는 바늘 끝(r=88)과 호 안쪽 모서리 사이의 띠뿐이라,
// 가장 긴 '선점 후보'가 들어가도록 호를 r=150까지 밀어 띠를 넓혔다.
// (호 바깥 끝 155.5 < 눈금 링 안쪽 161이라 눈금과도 겹치지 않는다.)
const DIAL = {
  "top-right": { arc: "M210.5 50.4 A150 150 0 0 1 349.6 189.5", x: 280, y: 120 },
  "bottom-right": { arc: "M349.6 210.5 A150 150 0 0 1 210.5 349.6", x: 280, y: 280 },
  "bottom-left": { arc: "M189.5 349.6 A150 150 0 0 1 50.4 210.5", x: 120, y: 280 },
  "top-left": { arc: "M50.4 189.5 A150 150 0 0 1 189.5 50.4", x: 120, y: 120 },
};

export default function Compass() {
  return (
    <svg className="compass" viewBox="0 0 400 400" role="img" aria-label="네 개의 사분면과 선점 후보 구역을 가리키는 바늘로 이루어진 나침반">
      <circle className="compass__halo" cx="200" cy="200" r="188" />
      <circle className="compass__ring" cx="200" cy="200" r="176" />
      <circle className="compass__ticks" cx="200" cy="200" r="164" />

      <line className="compass__cross" x1="30" y1="200" x2="370" y2="200" />
      <line className="compass__cross" x1="200" y1="30" x2="200" y2="370" />

      {QUADRANTS.map((q) => (
        <path
          key={q.key}
          className={`compass__arc compass__arc--${q.slug}`}
          d={DIAL[q.zone].arc}
        />
      ))}

      {QUADRANTS.map((q) => (
        <text
          key={q.key}
          className={`compass__label compass__label--${q.slug}`}
          x={DIAL[q.zone].x}
          y={DIAL[q.zone].y}
          textAnchor="middle"
          /* y를 베이스라인이 아닌 글자의 시각적 중심으로 잡아야
             위아래 두 줄이 실제로 대칭이 된다. */
          dominantBaseline="central"
        >
          {q.label}
        </text>
      ))}

      <g className="compass__orbit">
        <circle className="compass__orbit-dot" cx="200" cy="36" r="3.5" />
      </g>

      <g className="compass__needle-arrive">
        <g className="compass__needle">
          <path className="compass__needle-front" d="M200 112 L207 200 L200 213 L193 200 Z" />
          <path className="compass__needle-back" d="M200 288 L193 200 L200 187 L207 200 Z" />
        </g>
      </g>

      <circle className="compass__hub" cx="200" cy="200" r="9" />
      <circle className="compass__hub-core" cx="200" cy="200" r="3" />
    </svg>
  );
}
