"""Priority constraints for district decision briefs."""

from __future__ import annotations


ALLOWED_PRIORITIES = {
    "ACTIVATED": {"CRITICAL", "HIGH"},
    "WATCH": {"MEDIUM", "LOW"},
}

FALLBACK_PRIORITIES = {
    "ACTIVATED": "HIGH",
    "WATCH": "MEDIUM",
}


def allowed_priorities_for_status(trigger_status: str) -> set[str]:
    """Return the priority levels permitted for a trigger status."""
    return ALLOWED_PRIORITIES.get(trigger_status.upper(), ALLOWED_PRIORITIES["WATCH"])


def constrain_priority(priority: str, trigger_status: str) -> str:
    """Keep a model-provided priority within the status-specific policy."""
    normalized_status = trigger_status.upper()
    normalized_priority = priority.upper()
    if normalized_priority in allowed_priorities_for_status(normalized_status):
        return normalized_priority
    return FALLBACK_PRIORITIES.get(normalized_status, FALLBACK_PRIORITIES["WATCH"])
