import json
from pathlib import Path

from fastapi import APIRouter, Path as PathParam, Query

from app.api.schemas import GapMapResponse, SkillIndexResponse, TechPostingsResponse

router = APIRouter(prefix="/api/v1")

# DB 연동 전까지는 frontend/lib의 mock JSON을 그대로 복사해서 쓴다.
# 나중에 app/db 쿼리로 교체할 때 이 파일들은 지운다.
_FIXTURES_DIR = Path(__file__).parent / "fixtures"
_gapmap_data = json.loads((_FIXTURES_DIR / "gapmap.json").read_text())
_skills_data = json.loads((_FIXTURES_DIR / "skills.json").read_text())
_postings_data = json.loads((_FIXTURES_DIR / "postings.json").read_text())


@router.get(
    "/gapmap",
    response_model=GapMapResponse,
    summary="괴리맵(수요-생태계) 데이터 조회",
    description="생태계 점수와 채용 수요를 함께 매핑한 27개 상세 기술 데이터를 반환한다.",
    tags=["gapmap"],
)
def get_gapmap():
    return _gapmap_data


@router.get(
    "/skills",
    response_model=SkillIndexResponse,
    summary="기술 사전 전체 조회",
    description="괴리맵의 27개 상세 기술을 포함해, 채용 공고에서 뽑아낸 전체 기술 사전을 반환한다.",
    tags=["skills"],
)
def get_skills():
    return _skills_data


@router.get(
    "/tech/{skill_code}/postings",
    response_model=TechPostingsResponse,
    summary="기술별 채용 공고 조회",
    description="특정 기술을 요구하는 채용 공고 목록을 최신순으로 반환한다.",
    tags=["tech"],
)
def get_tech_postings(
    skill_code: str = PathParam(description="기술 고유 코드 (예: python, aws)"),
    limit: int = Query(default=5, ge=1, description="반환할 공고 최대 개수"),
):
    items = _postings_data.get(skill_code, [])[:limit]
    return {"items": items}
