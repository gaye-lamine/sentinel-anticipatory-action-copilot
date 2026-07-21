import unittest

from backend.priority import constrain_priority


class PriorityConstraintTests(unittest.TestCase):
    def test_watch_never_keeps_high_or_critical(self) -> None:
        self.assertEqual(constrain_priority("HIGH", "WATCH"), "MEDIUM")
        self.assertEqual(constrain_priority("CRITICAL", "WATCH"), "MEDIUM")

    def test_watch_keeps_medium_and_low(self) -> None:
        self.assertEqual(constrain_priority("MEDIUM", "WATCH"), "MEDIUM")
        self.assertEqual(constrain_priority("LOW", "WATCH"), "LOW")

    def test_activated_never_keeps_medium_or_low(self) -> None:
        self.assertEqual(constrain_priority("MEDIUM", "ACTIVATED"), "HIGH")
        self.assertEqual(constrain_priority("LOW", "ACTIVATED"), "HIGH")

    def test_activated_keeps_high_and_critical(self) -> None:
        self.assertEqual(constrain_priority("HIGH", "ACTIVATED"), "HIGH")
        self.assertEqual(constrain_priority("CRITICAL", "ACTIVATED"), "CRITICAL")
