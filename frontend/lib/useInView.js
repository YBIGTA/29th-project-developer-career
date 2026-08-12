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
