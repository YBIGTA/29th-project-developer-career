import re
from pathlib import Path

import joblib
import numpy as np


_WORD = r"A-Za-z0-9_"
_WORD_EXT = r"A-Za-z0-9_&/.'’‐‑‒–—―+#\-"
_AMBIGUOUS_CONTEXT_WINDOW = 50
_HEADER_STRIP_CHARS = ":?!. "

# Company-name skills that should be reported under their product/model name once
# self-mention filtering has already run. Keeping OpenAI/Anthropic as distinct
# skill_id values (rather than merging them in skill_alias) preserves per-company
# self-mention filtering; only the final reported tag is merged.
_SKILL_NAME_MERGE = {"OpenAI": "GPT", "Anthropic": "Claude"}

_INCLUDE_HEADERS = {
    "about the role",
    "about this role",
    "the role",
    "about the team",
    "responsibilities",
    "key responsibilities",
    "core responsibilities",
    "what you'll do",
    "what you will do",
    "in this role, you will",
    "you will",
    "a typical day",
    "the difference you will make",
    "requirements",
    "minimum requirements",
    "minimum qualifications",
    "preferred qualifications",
    "qualifications",
    "your expertise",
    "experience",
    "bonus points",
    "nice to have",
    "nice to haves",
    "who you are",
    "you have",
    "you are",
    "skills",
    "you might thrive in this role if you",
    "you may be a good fit if you",
    "you may be a good fit if you have",
    "what we're looking for",
    "what you'll bring",
    "what you will bring",
}

_EXCLUDE_HEADERS = {
    "a world-changing company",
    "about us",
    "benefits",
    "who we are",
    "how we're different",
    "come work with us",
    "life at palantir",
    "what makes cloudflare special",
    "why binance",
    "equal opportunity at datadog",
    "privacy and ai guidelines",
    "compensation",
    "salary",
    "salary range",
    "pay range",
    "base salary",
    "what we offer",
    "benefits and growth",
    "who are we",
    "how and where we work",
    "mental health benefits",
    "family building benefits",
    "child care and pet benefits",
    "equity",
    "dental insurance",
    "who may apply",
    "equal employment opportunity",
    "diversity",
    "perks",
    "visa sponsorship",
    "work authorization",
    "how to apply",
    "application process",
}


def normalize_title(title):
    """Match the title normalization used by the training notebook."""
    value = "" if title is None else str(title).lower()
    value = re.sub(r"[_/|]+", " ", value)
    value = re.sub(r"[-–—]+", " ", value)
    value = re.sub(r"\([^)]*\)", " ", value)
    value = re.sub(r"\[[^\]]*\]", " ", value)
    return re.sub(r"\s+", " ", value).strip()


class JobRoleClassifier:
    def __init__(self, model_path, expected_version=None):
        self.model_path = Path(model_path)
        if not self.model_path.is_file():
            raise FileNotFoundError(
                "Job-role model does not exist: {}".format(self.model_path)
            )
        self.pipeline = joblib.load(self.model_path)
        metadata = getattr(self.pipeline, "devcompass_metadata_", {})
        self.model_version = metadata.get("artifact_version")
        if expected_version and self.model_version != expected_version:
            raise ValueError(
                "Model version mismatch: expected {!r}, loaded {!r}".format(
                    expected_version, self.model_version
                )
            )

    def predict(self, titles):
        normalized = [normalize_title(title) for title in titles]
        labels = self.pipeline.predict(normalized)
        decision = self.pipeline.decision_function(normalized)
        if np.ndim(decision) == 1:
            scores = np.abs(decision)
        else:
            scores = np.max(decision, axis=1)
        return [
            {
                "normalized_title": title,
                "role_name": str(label),
                "role_score": float(score),
            }
            for title, label, score in zip(normalized, labels, scores)
        ]


def section_filtered_text(text):
    if not isinstance(text, str) or not text:
        return text

    state = "exclude"
    seen_header = False
    kept = []
    for line in text.split("\n"):
        key = line.strip().strip(_HEADER_STRIP_CHARS).lower()
        if key in _INCLUDE_HEADERS:
            state, seen_header = "include", True
            continue
        if key in _EXCLUDE_HEADERS:
            state, seen_header = "exclude", True
            continue
        if key.startswith("about ") and key not in {
            "about the role",
            "about this role",
            "about the team",
        }:
            state, seen_header = "exclude", True
            continue
        if state == "include":
            kept.append(line)

    filtered = "\n".join(kept).strip()
    if not seen_header or not filtered:
        return text
    return filtered


def _build_alias_pattern(aliases, boundary_class, flags=0):
    escaped = [
        re.escape(alias)
        for alias in sorted(set(aliases), key=len, reverse=True)
    ]
    if not escaped:
        return None
    return re.compile(
        r"(?<![{}])(?:{})(?![{}])".format(
            boundary_class,
            "|".join(escaped),
            boundary_class,
        ),
        flags,
    )


class SkillExtractor:
    """Notebook extraction rules backed by the seeded skill dictionary."""

    def __init__(self, aliases):
        normal = [row for row in aliases if row["match_policy"] == "normal"]
        ambiguous = [
            row
            for row in aliases
            if row["match_policy"] == "ambiguous_contextual"
        ]
        self.normal_lookup = {
            row["alias_text"].lower(): row for row in normal
        }
        self.ambiguous_lookup = {
            row["alias_text"]: row for row in ambiguous
        }
        self.normal_pattern = _build_alias_pattern(
            [row["alias_text"] for row in normal],
            _WORD,
            flags=re.IGNORECASE,
        )
        self.ambiguous_pattern = _build_alias_pattern(
            [row["alias_text"] for row in ambiguous],
            _WORD_EXT,
        )
        self.skill_id_by_name = {
            row["skill_name"]: row["skill_id"] for row in aliases
        }

    def extract(self, description, company_name=None):
        text = section_filtered_text(description)
        if not isinstance(text, str) or not text:
            return []

        company = (
            str(company_name).strip().lower()
            if company_name and str(company_name).strip()
            else None
        )

        matches = {}
        normal_spans = (
            list(self.normal_pattern.finditer(text))
            if self.normal_pattern
            else []
        )
        self_mention_spans = []
        other_spans = []
        for match in normal_spans:
            alias = self.normal_lookup[match.group().lower()]
            item = {
                "skill_id": alias["skill_id"],
                "skill_name": alias["skill_name"],
                "matched_text": match.group(),
                "match_type": alias["match_policy"],
            }
            if company and alias["skill_name"].lower() == company:
                self_mention_spans.append((match, item))
            else:
                matches.setdefault(alias["skill_id"], item)
                other_spans.append(match)

        # A skill whose name exactly matches the posting company (e.g. "Cloudflare"
        # in a Cloudflare posting) is only kept if another, unrelated skill is
        # mentioned nearby -- otherwise it's almost always a self-introduction
        # ("We are Cloudflare...") rather than a real tech-stack mention.
        for match, item in self_mention_spans:
            start, end = match.span()
            window_start = start - _AMBIGUOUS_CONTEXT_WINDOW
            window_end = end + _AMBIGUOUS_CONTEXT_WINDOW
            has_nearby_tech = any(
                span.start() < window_end and span.end() > window_start
                for span in other_spans
            )
            if has_nearby_tech:
                matches.setdefault(item["skill_id"], item)

        if self.ambiguous_pattern:
            for match in self.ambiguous_pattern.finditer(text):
                start, end = match.span()
                window_start = start - _AMBIGUOUS_CONTEXT_WINDOW
                window_end = end + _AMBIGUOUS_CONTEXT_WINDOW
                if not any(
                    item.start() < window_end and item.end() > window_start
                    for item in normal_spans
                ):
                    continue
                alias = self.ambiguous_lookup[match.group()]
                matches.setdefault(
                    alias["skill_id"],
                    {
                        "skill_id": alias["skill_id"],
                        "skill_name": alias["skill_name"],
                        "matched_text": match.group(),
                        "match_type": alias["match_policy"],
                    },
                )

        for source_name, target_name in _SKILL_NAME_MERGE.items():
            source_items = [
                item
                for item in matches.values()
                if item["skill_name"] == source_name
            ]
            if not source_items:
                continue
            target_id = self.skill_id_by_name.get(target_name)
            if target_id is None:
                continue
            for item in source_items:
                del matches[item["skill_id"]]
            if target_id not in matches:
                merged = dict(source_items[0])
                merged["skill_id"] = target_id
                merged["skill_name"] = target_name
                matches[target_id] = merged

        return sorted(matches.values(), key=lambda item: item["skill_name"])
