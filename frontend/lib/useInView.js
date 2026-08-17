"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 스크롤 진입 감지. scroll 이벤트 대신 IntersectionObserver를 쓴다.
 * once=true면 한 번 드러난 뒤에는 다시 숨기지 않는다.
 */
export function useInView({ threshold = 0.2, once = true, initial = false } = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(initial);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, once]);

  return [ref, inView];
}

/**
 * 지금 화면 위쪽에 걸려 있는 구획의 id를 돌려준다. 사전의 알파벳 레일에서
 * "지금 어느 글자를 보고 있는지" 표시하는 데 쓴다.
 *
 * useInView는 ref 하나에 불리언 하나라 여러 구획을 동시에 볼 수 없다.
 * 여기서는 옵저버 하나로 전부 관찰하되, 판정은 콜백이 불릴 때마다 각 구획의
 * 위치를 새로 재서 한다 — IntersectionObserverEntry의 boundingClientRect는
 * 그 항목이 마지막으로 교차 상태를 바꿨을 때의 스냅샷이라, 그대로 쓰면
 * 스크롤을 한참 내려도 옛 좌표로 판정해 엉뚱한 글자가 켜진 채로 남는다.
 *
 * 경계(topOffset)를 이미 지난 것 중 가장 마지막 것을 고른다. 화면에 여러
 * 글자가 함께 보여도 "방금 지나온 글자"가 켜져 표시가 튀지 않는다.
 *
 * 설정 함수도 함께 돌려준다. 글자를 눌러 이동할 때 옵저버가 반응할 때까지
 * 기다리면 누른 표시가 한 박자 늦게 켜져 "안 눌린 것처럼" 보인다. 누른
 * 즉시 그 글자를 켜 두면 되고, 스크롤이 멎은 뒤 옵저버가 실제 위치로 다시
 * 판정하므로 잘못 켜진 채로 남지도 않는다.
 */
export function useActiveSection(ids, { topOffset = 120 } = {}) {
  const [active, setActive] = useState(null);
  const key = ids.join("|");

  useEffect(() => {
    const els = (key ? key.split("|") : [])
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    if (!els.length) return undefined;

    const update = () => {
      let current = els[0].id;
      for (const el of els) {
        if (el.getBoundingClientRect().top <= topOffset) current = el.id;
      }
      setActive(current);
    };

    const observer = new IntersectionObserver(update, {
      rootMargin: `-${topOffset}px 0px 0px 0px`,
      threshold: [0, 1],
    });
    for (const el of els) observer.observe(el);
    return () => observer.disconnect();
  }, [key, topOffset]);

  return [active, setActive];
}
