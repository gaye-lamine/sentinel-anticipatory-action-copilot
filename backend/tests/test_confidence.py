import unittest

from backend.confidence import calculate_trigger_confidence


class TriggerConfidenceTests(unittest.TestCase):
    def test_karenga_has_moderate_activation_confidence(self) -> None:
        self.assertAlmostEqual(calculate_trigger_confidence(18.1, 15.2), 0.58, places=2)
        self.assertNotAlmostEqual(calculate_trigger_confidence(18.1, 15.2), 0.95, places=2)

    def test_large_margin_is_high_confidence(self) -> None:
        self.assertAlmostEqual(calculate_trigger_confidence(35.0, 15.2), 0.9, places=2)

    def test_near_threshold_watch_is_moderate_confidence(self) -> None:
        # The supplied symmetric formula yields 0.58: 12.0% is 21.1% below the
        # threshold, slightly farther from it than Karenga is above it.
        self.assertAlmostEqual(calculate_trigger_confidence(12.0, 15.2), 0.58, places=2)
