/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */

  // 폰 등 다른 기기에서 로컬 dev 서버(예: http://192.168.x.x:3000)로 접속해 테스트할 때,
  // Next.js가 기본으로 차단하는 cross-origin dev 리소스 요청(JS 청크, HMR)을 허용한다.
  // 이 목록이 없으면 페이지 골격은 보이지만 클라이언트 JS가 로드되지 않아
  // 데이터 fetch가 실행되지 않고 로딩 상태에서 멈춘 것처럼 보인다.
  // PC의 로컬 IP가 바뀌면(ipconfig로 확인) 아래 주소도 함께 바꿔야 한다.
  allowedDevOrigins: ["192.168.45.174", "192.168.45.23"],
};

export default nextConfig;
