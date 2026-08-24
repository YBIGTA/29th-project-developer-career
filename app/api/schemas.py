from datetime import date, datetime

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


class Trend(BaseModel):
    """생태계 활동 추이. index는 원시 건수가 아니라 그 달 전체 합계 대비
    점유율을 첫 달 100으로 잡은 지수다 (routes.build_trends 참고)."""

    months: list[str]
    index: list[float]
    github: list[int]
    stackoverflow: list[int] | None
    hasStackoverflow: bool
    delta: dict[str, float | str] | None


class Docs(BaseModel):
    url: str
    note: str | None = None


class Video(BaseModel):
    """썸네일 주소는 없다. 화면이 id로 만든다(i.ytimg.com/vi/{id}/hqdefault.jpg)."""

    id: str
    title: str | None = None
    channel: str | None = None
    views: int | None = None
    seconds: int | None = None


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
    # 월별 수집이 있는 기술에만 붙는다. 프론트는 없으면 스파크라인을 안 그린다.
    trend: Trend | None = None
    # 같은 군집에서 가장 가까운 기술들. 군집 대상이 아니면 없다.
    stack: list[str] | None = None
    # 학습 자료. 자료가 없는 기술에는 키가 없다.
    docs: Docs | None = None
    videos: list[Video] | None = None


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


class ClusterNeighbor(BaseModel):
    tech: str
    score: float
    companies: int


class ClusterResponse(BaseModel):
    asOfDate: date
    clusterId: int | None
    clusterSize: int | None
    membershipQuality: str | None
    evidenceLabel: str | None
    jobCount: int
    companyCount: int
    coherence: float | None
    stability: float | None
    marginRatio: float | None
    neighborCompanyShare: float | None
    dominantCompany: str | None
    dominantCompanyShare: float | None
    neighbors: list[ClusterNeighbor]
    globalNeighbors: list[ClusterNeighbor]


class TimeSeriesItem(BaseModel):
    month: str
    skillCode: str
    skillName: str
    postingCount: int
    githubIssueCount: int
    githubPullRequestCount: int
    stackoverflowQuestionCount: int


class TimeSeriesResponse(BaseModel):
    meta: dict[str, str | None]
    items: list[TimeSeriesItem]


class TimeSeriesDailyItem(BaseModel):
    date: str
    skillCode: str
    skillName: str
    stackoverflowQuestionCount: int
    stackoverflowRollingAvg30d: float
    stackoverflowIndex: float | None
    hasIndexBaseline: bool


class TimeSeriesDailyResponse(BaseModel):
    meta: dict[str, str | None]
    items: list[TimeSeriesDailyItem]
