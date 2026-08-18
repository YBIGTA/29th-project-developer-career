from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class Skill:
    skill_id: int
    skill_code: str
    skill_name: str


@dataclass(frozen=True)
class GitHubCounts:
    repository_count: int
    issue_count: int
    pull_request_count: int
    repository_query: str
    activity_query: str


@dataclass(frozen=True)
class StackOverflowCounts:
    question_count: int
    tag: str
    tag_source: str


@dataclass(frozen=True)
class RunSummary:
    run_id: str
    as_of_date: date
    target_skills: int
    successful_skills: int
    failed_skills: int
    status: str

