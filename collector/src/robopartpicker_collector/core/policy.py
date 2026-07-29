from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Callable, Literal
from urllib.parse import quote


PolicyState = Literal["unreviewed", "approved_fixture_only", "approved_live", "denied", "withdrawn"]


class PolicyDenied(RuntimeError):
    pass


@dataclass(frozen=True)
class SourcePolicy:
    source_id: str
    revision_id: str
    policy_state: PolicyState
    enabled: bool
    base_url: str
    allowed_hosts: tuple[str, ...]
    robots_status: Literal["unknown", "allowed", "disallowed", "not_applicable"]
    terms_status: Literal["unknown", "approved", "denied", "requires_review", "not_applicable"]
    reuse_status: Literal["unknown", "metadata_only", "metadata_and_facts", "retention_approved", "denied"]
    user_agent: str


class SourcePolicyEngine:
    def authorize(self, policy: SourcePolicy, *, fixture_mode: bool) -> None:
        if not policy.enabled:
            raise PolicyDenied("source is disabled")
        allowed_states = {"approved_fixture_only", "approved_live"} if fixture_mode else {"approved_live"}
        if policy.policy_state not in allowed_states:
            required = "approved_fixture_only or approved_live" if fixture_mode else "approved_live"
            raise PolicyDenied(f"source policy must be {required}")
        if policy.robots_status not in {"allowed", "not_applicable"}:
            raise PolicyDenied(f"robots policy is {policy.robots_status}")
        if policy.terms_status not in {"approved", "not_applicable"}:
            raise PolicyDenied(f"terms policy is {policy.terms_status}")
        if policy.reuse_status in {"unknown", "denied"}:
            raise PolicyDenied(f"reuse policy is {policy.reuse_status}")
        if not policy.allowed_hosts:
            raise PolicyDenied("source has no allowed hosts")
        if (
            not policy.user_agent.strip()
            or "mailto:" not in policy.user_agent.lower()
            or "\r" in policy.user_agent
            or "\n" in policy.user_agent
        ):
            raise PolicyDenied("source user agent must include an operator contact")


@dataclass(frozen=True)
class _Rule:
    pattern: str
    allow: bool

    @property
    def specificity(self) -> int:
        return len(self.pattern.replace("*", "").removesuffix("$").encode("utf8"))

    def matches(self, path: str) -> bool:
        end_anchored = self.pattern.endswith("$")
        source = _normalize_robot_path(self.pattern[:-1] if end_anchored else self.pattern)
        path = _normalize_robot_path(path)
        regex = re.escape(source).replace(r"\*", ".*")
        expression = f"^{regex}{'$' if end_anchored else ''}"
        return re.search(expression, path) is not None


@dataclass(frozen=True)
class _Group:
    user_agents: tuple[str, ...]
    rules: tuple[_Rule, ...]


class RobotsRules:
    def __init__(self, groups: tuple[_Group, ...]) -> None:
        self._groups = groups

    @classmethod
    def parse(cls, text: str) -> "RobotsRules":
        if len(text.encode("utf8")) > 512_000:
            raise ValueError("robots.txt exceeds the 500 KiB parser limit")
        groups: list[_Group] = []
        agents: list[str] = []
        rules: list[_Rule] = []
        has_rules = False

        def finish() -> None:
            nonlocal agents, rules, has_rules
            if agents:
                groups.append(_Group(tuple(agents), tuple(rules)))
            agents, rules, has_rules = [], [], False

        for raw_line in text.splitlines():
            line = raw_line.split("#", 1)[0].strip()
            if not line or ":" not in line:
                continue
            key, value = (part.strip() for part in line.split(":", 1))
            key = key.lower()
            if key == "user-agent":
                if has_rules:
                    finish()
                if value:
                    agents.append(value.lower())
            elif key in {"allow", "disallow"} and agents:
                has_rules = True
                if value:
                    rules.append(_Rule(value, key == "allow"))
        finish()
        return cls(tuple(groups))

    def allowed(self, user_agent: str, path: str) -> bool:
        product = user_agent.split("/", 1)[0].strip().lower()
        exact = [group for group in self._groups if product in group.user_agents]
        selected = exact or [group for group in self._groups if "*" in group.user_agents]
        matches = [rule for group in selected for rule in group.rules if rule.matches(path)]
        if not matches:
            return True
        longest = max(rule.specificity for rule in matches)
        return any(rule.allow for rule in matches if rule.specificity == longest)


@dataclass(frozen=True)
class RobotsAccessResult:
    access_allowed: bool
    status: Literal["rules", "unavailable", "unreachable"]
    rules: RobotsRules | None


def interpret_robots_response(status_code: int, text: str = "") -> RobotsAccessResult:
    if 200 <= status_code <= 299:
        return RobotsAccessResult(True, "rules", RobotsRules.parse(text))
    if 400 <= status_code <= 499:
        return RobotsAccessResult(True, "unavailable", None)
    return RobotsAccessResult(False, "unreachable", None)


class RobotsCache:
    def __init__(
        self,
        *,
        now: Callable[[], datetime] | None = None,
        ttl: timedelta = timedelta(hours=24),
    ) -> None:
        self._now = now or (lambda: datetime.now(UTC))
        self._ttl = min(ttl, timedelta(hours=24))
        self._entries: dict[str, tuple[datetime, RobotsRules]] = {}

    def put(self, origin: str, rules: RobotsRules) -> None:
        self._entries[origin] = (self._now(), rules)

    def get(self, origin: str) -> RobotsRules | None:
        entry = self._entries.get(origin)
        if entry is None:
            return None
        stored_at, rules = entry
        if self._now() - stored_at > self._ttl:
            self._entries.pop(origin, None)
            return None
        return rules


_UNRESERVED = frozenset("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")


def _normalize_robot_path(value: str) -> str:
    output: list[str] = []
    index = 0
    while index < len(value):
        character = value[index]
        if character == "%" and index + 2 < len(value):
            token = value[index + 1:index + 3]
            if re.fullmatch(r"[0-9A-Fa-f]{2}", token):
                decoded = chr(int(token, 16))
                output.append(decoded if decoded in _UNRESERVED else f"%{token.upper()}")
                index += 3
                continue
        if ord(character) > 127:
            output.append(quote(character, safe=""))
        else:
            output.append(character)
        index += 1
    return "".join(output)
