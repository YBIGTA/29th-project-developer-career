// 폰에서 데스크톱 주소로 들어온 요청을 모바일 전용 화면(/m)으로 넘긴다.
//
// 데스크톱과 모바일은 같은 데이터를 쓰지만 완전히 다른 컴포넌트 트리다
// (components/ 와 globals.css vs components/mobile/ 과 mobile.css). 두 화면을
// 잇는 링크가 없어서, 폰으로 주소를 직접 치면 데스크톱 화면에 그대로 머문다.
//
// 화면 폭을 클라이언트에서 재는 방법을 쓰지 않는 이유: 데스크톱 화면이 한 번
// 그려진 뒤에 바뀌므로 깜빡이고, 정적 프리렌더된 페이지라 그 사이 주소도
// 어긋난다. 서버에서 갈라주면 폰은 처음부터 /m 만 받는다.
//
// matcher가 /m/* 를 포함하지 않으므로 리다이렉트 루프는 생기지 않는다.
// 308(영구)이 아니라 307(임시)을 쓴다 — 308은 브라우저가 캐시해버려서
// 같은 기기에서 나중에 데스크톱 화면을 보려 해도 계속 /m 으로 끌려간다.
// 폰 브라우저의 "데스크톱 사이트 요청"이 UA를 바꾸므로 그게 탈출구가 된다.
//
// Next.js 16에서 middleware 파일 규칙은 proxy 로 이름이 바뀌었다.
import { NextResponse } from "next/server";

const MOBILE_UA = /Android|iPhone|iPod|iPad|Windows Phone|BlackBerry|Opera Mini|IEMobile/i;

const MOBILE_PATH = {
  "/": "/m",
  "/dictionary": "/m/dictionary",
};

export function proxy(request) {
  const target = MOBILE_PATH[request.nextUrl.pathname];
  if (!target || !MOBILE_UA.test(request.headers.get("user-agent") ?? "")) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL(target, request.url), 307);
}

export const config = {
  matcher: ["/", "/dictionary"],
};
