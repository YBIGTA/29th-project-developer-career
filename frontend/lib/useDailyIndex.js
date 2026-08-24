"use client";

import { useEffect, useState } from "react";
import { getDailyIndex } from "@/lib/api";

/**
 * 상세가 실제로 열렸을 때만 Stack Overflow 일별 지수를 가져온다.
 * 데스크톱 상세 패널과 모바일 바텀시트가 함께 쓴다.
 *
 * lib/useTechPostings.js와 같은 방식으로 "응답이 담긴 key가 지금 보고 있는
 * key와 같은가"로 로딩을 판정한다. effect 본문에서 setState를 부르지 않아도
 * 되고, 기술을 바꿨을 때 이전 기술의 선이 잠깐 비치지도 않는다.
 *
 * 요청 크기와 캐시는 lib/api.js의 getDailyIndex()가 맡는다. 같은 기술을 다시
 * 열면 요청이 나가지 않고, 필터가 없는 옛 API를 만나도 낭비가 한 번을 넘지
 * 않는다.
 */
export function useDailyIndex(skillCode, enabled) {
  const [result, setResult] = useState({ key: null, series: null });
  const key = enabled && skillCode ? skillCode : null;

  useEffect(() => {
    if (!key) return;

    let cancelled = false;
    getDailyIndex(key).then((series) => {
      if (!cancelled) setResult({ key, series: series ?? null });
    });

    return () => {
      cancelled = true;
    };
  }, [key]);

  const ready = result.key === key;
  return {
    series: ready ? result.series : null,
    loading: Boolean(key) && !ready,
  };
}
