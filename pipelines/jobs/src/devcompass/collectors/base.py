from abc import ABC, abstractmethod
from dataclasses import dataclass
import json
import time
from typing import Any, Dict, Mapping, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from ..models import CollectionPayload


class CollectorError(RuntimeError):
    def __init__(self, message, http_status=None, elapsed_sec=None):
        super().__init__(message)
        self.http_status = http_status
        self.elapsed_sec = elapsed_sec


@dataclass(frozen=True)
class HttpResponse:
    data: Any
    status: int


class JsonHttpClient:
    def __init__(self, timeout=30.0):
        self.timeout = timeout

    def get(self, url, params=None):
        query = urlencode(params or {})
        request_url = "{}?{}".format(url, query) if query else url
        request = Request(
            request_url,
            headers={"Accept": "application/json", "User-Agent": "DevCompass/0.1"},
        )
        try:
            with urlopen(request, timeout=self.timeout) as response:
                charset = response.headers.get_content_charset() or "utf-8"
                return HttpResponse(json.loads(response.read().decode(charset)), response.status)
        except HTTPError as exc:
            raise CollectorError(
                "HTTP {} while collecting {}".format(exc.code, url),
                http_status=exc.code,
            ) from exc
        except (URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise CollectorError("Failed to collect {}: {}".format(url, exc)) from exc


class BaseCollector(ABC):
    def __init__(self, http_client=None):
        self.http_client = http_client or JsonHttpClient()

    def collect(self, board_slug):
        started = time.monotonic()
        try:
            jobs, status = self._collect(board_slug)
        except CollectorError as exc:
            if exc.elapsed_sec is None:
                exc.elapsed_sec = time.monotonic() - started
            raise
        return CollectionPayload(
            jobs=jobs,
            http_status=status,
            elapsed_sec=time.monotonic() - started,
        )

    @abstractmethod
    def _collect(self, board_slug):
        raise NotImplementedError

