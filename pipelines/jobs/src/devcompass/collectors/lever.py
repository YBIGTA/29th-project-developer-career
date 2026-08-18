from .base import BaseCollector, CollectorError
from ..models import NormalizedJob, join_names, parse_datetime
from ..text import html_to_text


class LeverCollector(BaseCollector):
    BASE_URL = "https://api.lever.co/v0/postings/{}"
    PAGE_SIZE = 100

    def _collect(self, board_slug):
        jobs = []
        skip = 0
        status = 200
        while True:
            response = self.http_client.get(
                self.BASE_URL.format(board_slug),
                params={"mode": "json", "skip": skip, "limit": self.PAGE_SIZE},
            )
            if not isinstance(response.data, list):
                raise CollectorError("Lever response is not a jobs list")
            jobs.extend(self._normalize(job) for job in response.data)
            status = response.status
            if len(response.data) < self.PAGE_SIZE:
                break
            skip += self.PAGE_SIZE
        return jobs, status

    @staticmethod
    def _normalize(job):
        categories = job.get("categories") or {}
        all_locations = categories.get("allLocations")
        location = join_names(all_locations) if all_locations else categories.get("location")
        return NormalizedJob(
            source_job_id=job["id"],
            title=job["text"],
            description=job.get("descriptionPlain") or html_to_text(job.get("description")),
            location=location,
            department=categories.get("department"),
            team=categories.get("team"),
            employment_type=categories.get("commitment"),
            published_at=parse_datetime(job.get("createdAt")),
            source_updated_at=None,
            source_url=job.get("hostedUrl"),
            apply_url=job.get("applyUrl"),
        )

