import DictionaryClient from "@/components/DictionaryClient";

export const metadata = {
  title: "기술 사전 | DevCompass",
  description: "DevCompass가 수집한 기술 스택을 이름순으로 정리한 사전",
};

export default function DictionaryPage() {
  return <DictionaryClient />;
}
