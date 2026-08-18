from .ashby import AshbyCollector
from .base import BaseCollector, CollectorError, JsonHttpClient
from .greenhouse import GreenhouseCollector
from .lever import LeverCollector


def create_collector(ats_source, http_client=None):
    collectors = {
        "greenhouse": GreenhouseCollector,
        "lever": LeverCollector,
        "ashby": AshbyCollector,
    }
    try:
        collector_class = collectors[ats_source]
    except KeyError as exc:
        raise ValueError("Unsupported ATS source: {}".format(ats_source)) from exc
    return collector_class(http_client=http_client)


__all__ = [
    "AshbyCollector",
    "BaseCollector",
    "CollectorError",
    "GreenhouseCollector",
    "JsonHttpClient",
    "LeverCollector",
    "create_collector",
]

