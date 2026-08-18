import time
import urllib.parse
from datetime import date

from ..http import get_json
from ..mappings import GITHUB_QUERIES
from ..models import GitHubCounts, Skill


GITHUB_API = "https://api.github.com"


class GitHubCollector:
    def __init__(self, token, *, timeout=45, request_delay=2.1, sleep=time.sleep):
        if not token:
            raise ValueError("GITHUB_TOKEN is required")
        self.timeout = timeout
        self.request_delay = request_delay
        self.sleep = sleep
        self.headers = {
            "Accept": "application/vnd.github+json",
            "Authorization": "Bearer {}".format(token),
            "User-Agent": "devcompass-ecosystem-metrics",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    @staticmethod
    def queries_for(skill_name):
        return GITHUB_QUERIES.get(
            skill_name,
            ('"{}"'.format(skill_name), '"{}"'.format(skill_name)),
        )

    def _search_count(self, endpoint, query):
        url = "{}{}?{}".format(
            GITHUB_API,
            endpoint,
            urllib.parse.urlencode({"q": query, "per_page": "1"}),
        )
        data = get_json(url, headers=self.headers, timeout=self.timeout)
        if data.get("incomplete_results"):
            raise RuntimeError("GitHub returned incomplete search results")
        try:
            return int(data["total_count"])
        except (KeyError, TypeError, ValueError) as exc:
            raise RuntimeError("GitHub response has no valid total_count") from exc
        finally:
            if self.request_delay:
                self.sleep(self.request_delay)

    def collect(self, skill: Skill, from_date: date, to_date: date):
        repository_query, activity_query = self.queries_for(skill.skill_name)
        updated_query = "{} updated:{}..{}".format(
            activity_query,
            from_date.isoformat(),
            to_date.isoformat(),
        )
        return GitHubCounts(
            repository_count=self._search_count(
                "/search/repositories", repository_query
            ),
            issue_count=self._search_count(
                "/search/issues", "{} is:issue".format(updated_query)
            ),
            pull_request_count=self._search_count(
                "/search/issues", "{} is:pr".format(updated_query)
            ),
            repository_query=repository_query,
            activity_query=updated_query,
        )

