import time
import urllib.parse
from datetime import date, datetime, time as datetime_time, timezone

from ..http import get_json
from ..mappings import STACKOVERFLOW_TAGS
from ..models import Skill, StackOverflowCounts


STACKEXCHANGE_API = "https://api.stackexchange.com/2.3/questions"


class StackOverflowCollector:
    def __init__(
        self,
        *,
        api_key=None,
        timeout=45,
        request_delay=0.25,
        sleep=time.sleep,
    ):
        self.api_key = api_key
        self.timeout = timeout
        self.request_delay = request_delay
        self.sleep = sleep

    @staticmethod
    def tag_for(skill_name):
        mapped = STACKOVERFLOW_TAGS.get(skill_name)
        if mapped:
            return mapped, "manual"
        return skill_name.lower().replace(" ", "-").replace("_", "-"), "inferred"

    @staticmethod
    def _timestamp(value: date):
        return int(
            datetime.combine(value, datetime_time.min, tzinfo=timezone.utc).timestamp()
        )

    def collect(self, skill: Skill, from_date: date, to_date: date):
        tag, tag_source = self.tag_for(skill.skill_name)
        params = {
            "site": "stackoverflow",
            "tagged": tag,
            "fromdate": str(self._timestamp(from_date)),
            "todate": str(self._timestamp(to_date)),
            "order": "desc",
            "sort": "creation",
            "filter": "total",
        }
        if self.api_key:
            params["key"] = self.api_key
        url = "{}?{}".format(STACKEXCHANGE_API, urllib.parse.urlencode(params))
        data = get_json(
            url,
            timeout=self.timeout,
            error_url=STACKEXCHANGE_API,
        )
        try:
            count = int(data["total"])
        except (KeyError, TypeError, ValueError) as exc:
            raise RuntimeError("Stack Exchange response has no valid total") from exc

        delay = max(float(data.get("backoff", 0)), self.request_delay)
        if delay:
            self.sleep(delay)
        return StackOverflowCounts(
            question_count=count,
            tag=tag,
            tag_source=tag_source,
        )
