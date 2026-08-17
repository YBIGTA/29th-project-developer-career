from datetime import datetime

from pydantic import BaseModel


class Score(BaseModel):
    score: float
    raw: int


class RoleBreakdown(BaseModel):
    role: str
    count: int
    demand: float
    rank: int
    quadrant: str


class GapItem(BaseModel):
    tech: str
    skillCode: str
    kind: str
    category: str
    aliases: list[str]
    roles: list[str]
    roleBreakdown: list[RoleBreakdown]
    demand: float
    demandRank: int
    ecosystemScore: float
    quadrant: str
    postings: int
    postingsShare: float
    postingsNote: str
    ecosystem: dict[str, Score]
    signals: list[dict[str, str]]


class GapMeta(BaseModel):
    fromDate: str | None
    toDate: str | None
    totalTechs: int
    mappedTechs: int
    totalPostings: int
    mapLimit: int
    detailedTechs: int
    roles: list[str]


class GapMapResponse(BaseModel):
    meta: GapMeta
    items: list[GapItem]


class SkillItem(BaseModel):
    tech: str
    skillCode: str
    category: str
    aliases: list[str]
    postings: int
    postingsShare: float
    rank: int | None
    roles: list[str]
    detailed: bool


class SkillsResponse(BaseModel):
    meta: dict[str, int | list[str]]
    items: list[SkillItem]


class Posting(BaseModel):
    company: str
    title: str
    location: str | None = None
    employmentType: str | None = None
    publishedAt: datetime | None = None
    applyUrl: str | None = None


class PostingsResponse(BaseModel):
    items: list[Posting]
