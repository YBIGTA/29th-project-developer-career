"use client";

import { useEffect, useState } from "react";
import { getTechPostings } from "@/lib/api";

/**
 * 공고 탭이 실제로 열렸을 때만 공고를 가져온다. 지도 첫 로드에 모든 기술의
 * 공고를 전부 딸려 받는 낭비를 피하기 위한 것으로, 데스크톱 상세 패널과
 * 모바일 바텀시트가 함께 쓴다.
 *
 * loading을 별도 state로 두지 않고 "응답이 담긴 key가 지금 보고 있는 key와
 * 같은가"로 판정한다. 그래야 effect 본문에서 setState를 부르지 않아도 되고
 * (react-hooks/set-state-in-effect), 기술을 바꿨을 때 이전 기술의 공고가
 * 잠깐 비치는 일도 없다.
 */
export function useTechPostings(skillCode, enabled) {
  const [result, setResult] = useState({ key: null, postings: [], isSample: false });
  const key = enabled && skillCode ? skillCode : null;

  useEffect(() => {
    if (!key) return;

    let cancelled = false;
    getTechPostings(key).then(({ items, isSample }) => {
      if (!cancelled) setResult({ key, postings: items, isSample });
    });

    return () => {
      cancelled = true;
    };
  }, [key]);

  const ready = result.key === key;
  return {
    postings: ready ? result.postings : [],
    loading: Boolean(key) && !ready,
    isSample: ready && result.isSample,
  };
}
