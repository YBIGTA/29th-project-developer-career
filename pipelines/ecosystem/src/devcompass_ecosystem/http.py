import json
import urllib.error
import urllib.request


class ApiRequestError(RuntimeError):
    pass


def get_json(url, *, headers=None, timeout=45, error_url=None):
    display_url = error_url or url
    request = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise ApiRequestError(
            "HTTP {} for {}: {}".format(exc.code, display_url, body[:1000])
        ) from exc
    except urllib.error.URLError as exc:
        raise ApiRequestError(
            "Request failed for {}: {}".format(display_url, exc)
        ) from exc

    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:
        raise ApiRequestError("Invalid JSON from {}".format(display_url)) from exc
