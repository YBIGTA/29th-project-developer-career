from fastapi import APIRouter

from app.api.schemas import GapResponse, TechDetail

router = APIRouter()


@router.get("/gap", response_model=GapResponse)
def get_gap(job_category: str):
    raise NotImplementedError


@router.get("/tech/{name}", response_model=TechDetail)
def get_tech(name: str):
    raise NotImplementedError
