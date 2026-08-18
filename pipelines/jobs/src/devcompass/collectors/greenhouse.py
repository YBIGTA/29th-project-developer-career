from .base import BaseCollector, CollectorError
from ..models import NormalizedJob, join_names, parse_datetime
from ..text import html_to_text


class GreenhouseCollector(BaseCollector):
    BASE_URL = "https://boards-api.greenhouse.io/v1/boards/{}/jobs"

    def _collect(self, board_slug):
        response = self.http_client.get(
            self.BASE_URL.format(board_slug), params={"content": "true"}
        )
        raw_jobs = response.data.get("jobs") if isinstance(response.data, dict) else None
        if not isinstance(raw_jobs, list):
            raise CollectorError("Greenhouse response does not contain a jobs list")
        return [self._normalize(job) for job in raw_jobs], response.status

    @staticmethod
    def _normalize(job):
        source_url = job.get("absolute_url")
        return NormalizedJob(
            source_job_id=job["id"],
            title=job["title"],
            description=html_to_text(job.get("content")),
            location=(job.get("location") or {}).get("name"),
            department=join_names(job.get("departments")),
            team=None,
            employment_type=None,
            published_at=parse_datetime(job.get("first_published")),
            source_updated_at=parse_datetime(job.get("updated_at")),
            source_url=source_url,
            apply_url=source_url,
        )

