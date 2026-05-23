"""Tests for linux/event_log.py — append-only JSONL with rotation."""
from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "linux"))

from event_log import EventLog


class EventLogTests(unittest.TestCase):

    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="sg_log_"))
        self.log_path = self.tmp / "events.jsonl"

    def tearDown(self) -> None:
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_append_writes_one_line_per_record(self) -> None:
        el = EventLog(self.log_path)
        el.append("trigger", {"peak_ratio": 6.7})
        el.append("decision", {"mw": 4.5, "fire_t2": True})
        lines = self.log_path.read_text(encoding="utf-8").splitlines()
        self.assertEqual(len(lines), 2)
        for line in lines:
            obj = json.loads(line)
            self.assertIn("ts", obj)
            self.assertIn("kind", obj)

    def test_payload_keys_promoted_to_top_level(self) -> None:
        el = EventLog(self.log_path)
        el.append("decision", {"mw": 5.0, "pd_m": 0.001})
        obj = json.loads(self.log_path.read_text(encoding="utf-8").splitlines()[-1])
        self.assertEqual(obj["mw"], 5.0)
        self.assertEqual(obj["pd_m"], 0.001)
        self.assertEqual(obj["kind"], "decision")

    def test_rotation_at_size_threshold(self) -> None:
        small = 200                            # bytes
        el = EventLog(self.log_path, max_bytes=small)
        # write enough records to exceed threshold
        for i in range(40):
            el.append("sample", {"i": i, "filler": "x" * 8})
        rotated = self.log_path.with_suffix(self.log_path.suffix + ".1")
        self.assertTrue(rotated.exists(), "rotation file events.jsonl.1 missing")
        # main log file restarted with newer entries
        self.assertLess(self.log_path.stat().st_size, rotated.stat().st_size + small)

    def test_creates_parent_dir(self) -> None:
        nested = self.tmp / "a" / "b" / "events.jsonl"
        EventLog(nested).append("boot", {"fw": "x"})
        self.assertTrue(nested.is_file())


if __name__ == "__main__":
    unittest.main()
