from datetime import UTC, datetime, timedelta

import pytest

from robopartpicker_collector.core.policy import (
    PolicyDenied,
    RobotsCache,
    RobotsRules,
    SourcePolicy,
    SourcePolicyEngine,
    interpret_robots_response,
)


def approved_policy(**overrides: object) -> SourcePolicy:
    values = {
        "source_id": "manufacturer-pilot",
        "revision_id": "policy-rev-1",
        "policy_state": "approved_live",
        "enabled": True,
        "base_url": "https://manufacturer.example",
        "allowed_hosts": ("manufacturer.example",),
        "robots_status": "allowed",
        "terms_status": "approved",
        "reuse_status": "retention_approved",
        "user_agent": "RoboPartPickerBot/0.1 (+mailto:data@example.com)",
    }
    values.update(overrides)
    return SourcePolicy(**values)


@pytest.mark.parametrize(
    ("override", "message"),
    [
        ({"enabled": False}, "disabled"),
        ({"policy_state": "unreviewed"}, "approved_live"),
        ({"robots_status": "disallowed"}, "robots"),
        ({"terms_status": "denied"}, "terms"),
        ({"reuse_status": "unknown"}, "reuse"),
    ],
)
def test_live_acquisition_fails_closed(override: dict[str, object], message: str) -> None:
    with pytest.raises(PolicyDenied, match=message):
        SourcePolicyEngine().authorize(approved_policy(**override), fixture_mode=False)


def test_fixture_only_policy_cannot_authorize_network() -> None:
    policy = approved_policy(policy_state="approved_fixture_only")
    SourcePolicyEngine().authorize(policy, fixture_mode=True)
    with pytest.raises(PolicyDenied, match="approved_live"):
        SourcePolicyEngine().authorize(policy, fixture_mode=False)


def test_rfc9309_longest_rule_and_allow_tie_win() -> None:
    rules = RobotsRules.parse(
        """
        User-agent: RoboPartPickerBot
        Disallow: /private/
        Allow: /private/public$
        Disallow: /*.zip$
        """,
    )
    assert rules.allowed("RoboPartPickerBot", "/private/public")
    assert not rules.allowed("RoboPartPickerBot", "/private/secret")
    assert not rules.allowed("RoboPartPickerBot", "/files/archive.zip")
    assert rules.allowed("OtherBot", "/private/secret")


def test_rfc9309_unreserved_percent_encoding_matches() -> None:
    rules = RobotsRules.parse("User-agent: *\nDisallow: /caf%C3%A9/%7Eprivate")
    assert not rules.allowed("RoboPartPickerBot", "/caf%C3%A9/~private")


def test_robots_parser_rejects_over_500_kib() -> None:
    with pytest.raises(ValueError, match="500 KiB"):
        RobotsRules.parse("User-agent: *\n" + ("Allow: /x\n" * 60_000))


def test_robots_cache_expires_at_24_hours() -> None:
    now = datetime(2026, 7, 29, 12, tzinfo=UTC)
    cache = RobotsCache(now=lambda: now)
    cache.put("https://manufacturer.example", RobotsRules.parse("User-agent: *\nAllow: /"))
    assert cache.get("https://manufacturer.example") is not None
    cache._now = lambda: now + timedelta(hours=24, seconds=1)
    assert cache.get("https://manufacturer.example") is None


def test_rfc9309_unavailable_and_unreachable_statuses_fail_safely() -> None:
    assert interpret_robots_response(404).access_allowed is True
    assert interpret_robots_response(404).status == "unavailable"
    assert interpret_robots_response(503).access_allowed is False
    assert interpret_robots_response(503).status == "unreachable"
