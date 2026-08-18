from urllib.parse import urlparse

from .base import BaseCollector, CollectorError
from ..models import NormalizedJob, parse_datetime
from ..text import html_to_text


class AshbyCollector(BaseCollector):
    BASE_URL = "https://api.ashbyhq.com/posting-api/job-board/{}"

    def _collect(self, board_slug):
        response = self.http_client.get(
            self.BASE_URL.format(board_slug), params={"includeCompensation": "false"}
        )
        raw_jobs = response.data.get("jobs") if isinstance(response.data, dict) else None
        if not isinstance(raw_jobs, list):
            raise CollectorError("Ashby response does not contain a jobs list")
        return [self._normalize(job) for job in raw_jobs if job.get("isListed", True)], response.status

    @staticmethod
    def _source_job_id(job):
        if job.get("id"):
            return str(job["id"])
        job_url = job.get("jobUrl")
        if job_url:
            path_parts = [part for part in urlparse(job_url).path.split("/") if part]
            if path_parts:
                return path_parts[-1]
        raise ValueError("Ashby job has neither id nor a usable jobUrl")

    @classmethod
    def _normalize(cls, job):
        return NormalizedJob(
            source_job_id=cls._source_job_id(job),
            title=job["title"],
            description=job.get("descriptionPlain") or html_to_text(job.get("descriptionHtml")),
            location=job.get("location"),
            department=job.get("department"),
            team=job.get("team"),
            employment_type=job.get("employmentType"),
            published_at=parse_datetime(job.get("publishedAt")),
            source_updated_at=None,
            source_url=job.get("jobUrl"),
            apply_url=job.get("applyUrl"),
        )

