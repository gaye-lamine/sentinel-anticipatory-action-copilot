"""Deterministic confidence scoring for drought trigger decisions."""


def calculate_trigger_confidence(drought_prob: float, trigger_threshold: float) -> float:
    """Calculate confidence from the relative margin to the trigger threshold."""
    if trigger_threshold <= 0:
        raise ValueError("trigger_threshold must be greater than zero")

    margin = (drought_prob - trigger_threshold) / trigger_threshold
    capped_margin = max(-1.0, min(1.0, margin))
    confidence = 0.5 + 0.4 * abs(capped_margin)
    return round(min(1.0, max(0.0, confidence)), 2)
