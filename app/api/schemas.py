from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """JSON은 camelCase, 파이썬 코드는 snake_case로 쓰기 위한 공통 베이스.

    populate_by_name=True라 코드에서는 snake_case 필드명으로 생성/접근하고,
    직렬화된 JSON(및 Swagger 스키마)에는 camelCase로 나간다.
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


# ── GET /api/v1/gapmap ──────────────────────────────────────────────


class GapMapMeta(CamelModel):
    from_date: date = Field(description="집계 기간 시작일")
    to_date: date = Field(description="집계 기간 종료일")
    total_techs: int = Field(description="집계 대상 기술 총 개수")
    mapped_techs: int = Field(description="괴리맵에 매핑된 기술 개수")
    total_postings: int = Field(description="집계 대상 채용 공고 총 건수")
    map_limit: int = Field(description="괴리맵에 표시하는 기술 개수 상한")
    roles: list[str] = Field(description="직군 분류 목록")


class EcosystemMetric(CamelModel):
    score: float = Field(ge=0, le=100, description="0~100으로 정규화된 점수")
    raw: int = Field(description="정규화 이전의 원본 집계값")


class EcosystemScores(CamelModel):
    github_repo: EcosystemMetric = Field(description="GitHub 저장소 수 기반 점수")
    github_activity: EcosystemMetric = Field(
        description="최근 180일 GitHub 이슈·PR 활동 기반 점수"
    )
    stackoverflow: EcosystemMetric = Field(
        description="최근 180일 Stack Overflow 질문 수 기반 점수"
    )


class TechSignal(CamelModel):
    meta: str = Field(description="신호의 근거가 된 데이터 출처/기간 요약")
    title: str = Field(description="신호 본문")


class TechItem(CamelModel):
    tech: str = Field(description="기술명")
    skill_code: str = Field(description="기술을 가리키는 고유 코드 (postings 조회 등에 사용)")
    kind: str = Field(description="기술 분류 (예: 범용 언어, 클라우드 플랫폼)")
    roles: list[str] = Field(max_length=2, description="연관 직군 (최대 2개)")
    demand: float = Field(ge=0, le=100, description="채용 공고 언급 빈도의 백분위 순위 (0~100)")
    demand_rank: int = Field(description="채용 수요 기준 순위")
    ecosystem_score: float = Field(ge=0, le=100, description="생태계 종합 점수 (0~100)")
    quadrant: Literal["필수", "선점 후보", "희소가치", "저관심"] = Field(
        description="생태계 점수 × 채용 수요 기준 사분면 분류. 서버가 계산해서 내려준다."
    )
    postings: int = Field(description="이 기술을 요구하는 채용 공고 건수")
    postings_share: float = Field(description="전체 공고 대비 postings의 비율(%)")
    postings_note: str = Field(description="postings/postingsShare를 문장으로 풀어쓴 설명")
    ecosystem: EcosystemScores
    sample_repositories: list[str] = Field(description="대표 GitHub 저장소 이름 목록")
    description: str | None = Field(
        default=None, description="기술 사전적 설명 (기술설명 탭에 표시). 없으면 null"
    )
    summary: str = Field(description="기술에 대한 한 줄 요약")
    signals: list[TechSignal] = Field(description="요약을 뒷받침하는 근거 신호 목록")
    stack: list[str] = Field(description="함께 쓰이는 대표 스택/도구")
    verdict: str = Field(description="이 기술을 어떻게 취급해야 하는지에 대한 결론")


class GapMapResponse(CamelModel):
    meta: GapMapMeta
    items: list[TechItem]


# ── GET /api/v1/tech/{skill_code}/postings ──────────────────────────


class JobPosting(CamelModel):
    company: str = Field(description="채용 공고를 게시한 회사명")
    title: str = Field(description="공고 제목")
    location: str = Field(description="근무지")
    employment_type: str = Field(description="고용 형태 (예: 정규직, 계약직)")
    published_at: date = Field(description="공고 게시일")
    apply_url: str | None = Field(description="지원 페이지 URL. 없으면 null")


class TechPostingsResponse(CamelModel):
    items: list[JobPosting]


# ── GET /api/v1/skills ──────────────────────────────────────────────


class SkillIndexMeta(CamelModel):
    total_skills: int = Field(description="사전에 등록된 전체 기술 개수")
    detailed_skills: int = Field(description="괴리맵에도 매핑된(상세 정보가 있는) 기술 개수")
    tagged_skills: int = Field(description="직군 태그가 붙은 기술 개수")
    total_postings: int = Field(description="집계 대상 채용 공고 총 건수")
    categories: list[str] = Field(description="기술 카테고리 목록")


class SkillIndexItem(CamelModel):
    tech: str = Field(description="기술명")
    skill_code: str = Field(description="기술을 가리키는 고유 코드")
    category: str = Field(description="기술 카테고리 (예: 언어, 프론트엔드)")
    aliases: list[str] = Field(description="검색에 쓰이는 별칭 목록")
    postings: int = Field(description="이 기술을 요구하는 채용 공고 건수")
    postings_share: float = Field(description="전체 공고 대비 postings의 비율(%)")
    rank: int = Field(description="공고 건수 기준 내림차순 순위")
    roles: list[str] = Field(description="연관 직군 (최대 2개)")
    description: str | None = Field(
        default=None, description="기술 사전적 설명 (기술설명 탭에 표시). 없으면 null"
    )
    detailed: bool = Field(
        description="괴리맵(gapmap)에도 상세 항목으로 존재하는지 여부. "
        "true면 프론트가 TechItem 필드를 이 항목에 병합해 사용한다."
    )


class SkillIndexResponse(CamelModel):
    meta: SkillIndexMeta
    items: list[SkillIndexItem]
