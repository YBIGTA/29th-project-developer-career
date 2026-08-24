/**
 * 히어로의 나침반 그림. 장식이지만 아무 그림이나 놓은 것은 아니다 — 서비스가
 * 읽는 판 그대로다. 네 호가 사분면 넷이고, 바늘은 선점 후보(앞)와 희소가치(뒤)
 * 를 함께 가리킨다. 움직임·색은 전부 globals.css의 .compass__* 가 맡는다.
 *
 * 좌표계는 400×400, 중심 (200, 200). 호의 반지름 134는 사분원 길이가
 * 2π·134/4 ≈ 210이 되게 잡은 값이다 — .compass__arc의 stroke-dasharray: 210과
 * 맞아야 arcDraw 애니메이션이 정확히 한 호를 그려낸다.
 *
 * 데스크톱은 히어로를 걷어냈고, 지금은 모바일 히어로(MobileHero)만 쓴다.
 */
export default function Compass() {
  return (
    <svg className="compass" viewBox="0 0 400 400" role="img" aria-label="DevCompass 나침반">
      <circle className="compass__halo" cx="200" cy="200" r="190" />
      <circle className="compass__ticks" cx="200" cy="200" r="168" />
      <circle className="compass__ring" cx="200" cy="200" r="150" />

      <line className="compass__cross" x1="200" y1="44" x2="200" y2="356" />
      <line className="compass__cross" x1="44" y1="200" x2="356" y2="200" />

      {/* 호는 그리는 순서가 아니라 animation-delay로 순서가 잡힌다. */}
      <path className="compass__arc compass__arc--niche" d="M66 200A134 134 0 0 1 200 66" />
      <path className="compass__arc compass__arc--essential" d="M200 66A134 134 0 0 1 334 200" />
      <path className="compass__arc compass__arc--early-mover" d="M334 200A134 134 0 0 1 200 334" />
      <path className="compass__arc compass__arc--minimal" d="M200 334A134 134 0 0 1 66 200" />

      <text className="compass__label compass__label--niche" x="126" y="133" textAnchor="middle">
        희소가치
      </text>
      <text className="compass__label" x="274" y="133" textAnchor="middle">
        필수
      </text>
      <text className="compass__label" x="126" y="287" textAnchor="middle">
        저관심
      </text>
      <text
        className="compass__label compass__label--early-mover"
        x="274"
        y="287"
        textAnchor="middle"
      >
        선점 후보
      </text>

      <g className="compass__orbit">
        <circle className="compass__orbit-dot" cx="200" cy="32" r="4" />
      </g>

      {/* 등장(needleArrive)과 상시 흔들림(needleSway)은 같은 transform을 쓴다.
          한 요소에 겹쳐 걸면 뒤에 오는 것이 앞을 덮으므로 층을 나눠 건다. */}
      <g className="compass__needle-arrive">
        <g className="compass__needle">
          <polygon className="compass__needle-front" points="200,72 208,202 192,202" />
          <polygon className="compass__needle-back" points="200,306 206,198 194,198" />
        </g>
      </g>

      <circle className="compass__hub" cx="200" cy="200" r="13" />
      <circle className="compass__hub-core" cx="200" cy="200" r="4.5" />
    </svg>
  );
}
