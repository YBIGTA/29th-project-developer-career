"use client";

import { useEffect, useState } from "react";
import { getTechCluster } from "@/lib/api";

/**
 * 상세가 열렸을 때만 그 기술의 군집 정보를 가져온다.
 * 데스크톱 상세 패널과 모바일 바텀시트가 함께 쓴다.
 *
 * lib/useTechPostings.js와 같은 판정 방식이다. mock이 없으므로 API가 없거나
 * 실패하면 null이고, 화면은 지금까지처럼 이름 칩만 보여준다.
 */
export function useTechCluster(skillCode, enabled) {
  const [result, setResult] = useState({ key: null, cluster: null });
  const key = enabled && skillCode ? skillCode : null;

  useEffect(() => {
    if (!key) return;

    let cancelled = false;
    getTechCluster(key).then((cluster) => {
      if (!cancelled) setResult({ key, cluster });
    });

    return () => {
      cancelled = true;
    };
  }, [key]);

  const ready = result.key === key;
  return {
    cluster: ready ? result.cluster : null,
    loading: Boolean(key) && !ready,
  };
}
