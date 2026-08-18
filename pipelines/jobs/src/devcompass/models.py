from dataclasses import dataclass, field
from datetime import datetime, timezone
import hashlib
import json
from typing import Any, Dict, List, Optional


def parse_datetime(value: Any) -> Optional[datetime]:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, (int, float)):
        # Lever uses Unix milliseconds for createdAt.
        seconds = value / 1000 if value > 10_000_000_000 else value
        return datetime.fromtimestamp(seconds, tz=timezone.utc)
    if isinstance(value, str):
        normalized = value.strip().replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    raise ValueError("Unsupported datetime value: {!r}".format(value))


def join_names(items: Any) -> Optional[str]:
    if not items:
        return None
    names: List[str] = []
    for item in items:
        value = item.get("name") if isinstance(item, dict) else item
        if value and str(value).strip() not in names:
            names.append(str(value).strip())
    return ", ".join(names) or None


@dataclass(frozen=True)
class Board:
    board_id: int
    company_name: str
    ats_source: str
    board_slug: str


@dataclass(frozen=True)
class NormalizedJob:
    source_job_id: str
    title: str
    description: Optional[str] = None
    location: Optional[str] = None
    department: Optional[str] = None
    team: Optional[str] = None
    employment_type: Optional[str] = None
    published_at: Optional[datetime] = None
    source_updated_at: Optional[datetime] = None
    source_url: Optional[str] = None
    apply_url: Optional[str] = None
    content_hash: str = field(init=False)

    def __post_init__(self) -> None:
        source_job_id = str(self.source_job_id).strip()
        title = str(self.title).strip()
        if not source_job_id:
            raise ValueError("source_job_id must not be empty")
        if not title:
            raise ValueError("title must not be empty")
        object.__setattr__(self, "source_job_id", source_job_id)
        object.__setattr__(self, "title", title)
        object.__setattr__(self, "content_hash", self.calculate_content_hash())

    def calculate_content_hash(self) -> str:
        versioned: Dict[str, Optional[str]] = {
            "title": self.title,
            "description": self.description,
            "location": self.location,
            "department": self.department,
            "team": self.team,
            "employment_type": self.employment_type,
        }
        encoded = json.dumps(
            versioned,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()


@dataclass(frozen=True)
class CollectionPayload:
    jobs: List[NormalizedJob]
    http_status: int
    elapsed_sec: float


@dataclass(frozen=True)
class WriteSummary:
    new: int = 0
    changed: int = 0
    unchanged: int = 0
    closed: int = 0

