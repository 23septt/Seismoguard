"""
event_log.py — append-only JSONL event log with size-based rotation.

Used by main.py to persist trigger/decision/alert events across restarts.
Judge-friendly: post-demo, `cat ~/.seismoguard/events.jsonl | jq` shows what
happened.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from threading import Lock
from typing import Any, Dict

DEFAULT_PATH = Path.home() / ".seismoguard" / "events.jsonl"
DEFAULT_MAX_BYTES = 10 * 1024 * 1024          # 10 MiB rotate threshold


class EventLog:
    def __init__(self, path: Path | str = DEFAULT_PATH,
                 max_bytes: int = DEFAULT_MAX_BYTES) -> None:
        self.path = Path(path)
        self.max_bytes = max_bytes
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = Lock()

    def append(self, kind: str, payload: Dict[str, Any]) -> None:
        record = {
            "ts": time.time(),
            "kind": kind,
            **payload,
        }
        line = json.dumps(record, separators=(",", ":")) + "\n"
        with self._lock:
            self._maybe_rotate()
            with self.path.open("a", encoding="utf-8") as f:
                f.write(line)

    def _maybe_rotate(self) -> None:
        try:
            if self.path.is_file() and self.path.stat().st_size >= self.max_bytes:
                old = self.path.with_suffix(self.path.suffix + ".1")
                if old.exists():
                    old.unlink()
                os.replace(self.path, old)
        except OSError:
            pass
