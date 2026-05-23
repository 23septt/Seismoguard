"""
alert.py — Thai TTS playback + ntfy.sh push + cooldown.

Cooldown semantics:
    fire_t2 within COOLDOWN_S of last_t2 → suppressed (returns False)
    Same for T1 with its own clock.
"""
from __future__ import annotations

import logging
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

try:
    import requests
except ImportError:
    requests = None                        # ntfy degrades to no-op

log = logging.getLogger("alert")

DEFAULT_COOLDOWN_S = 30.0
NTFY_HOST = "https://ntfy.sh"


@dataclass
class AlertConfig:
    ntfy_topic: str = ""
    tts_wav_t1: str = "assets/alert_t1_th.wav"
    tts_wav_t2: str = "assets/alert_t2_th.wav"
    cooldown_s: float = DEFAULT_COOLDOWN_S
    aplay_device: str = ""                # e.g. "plughw:1,0" — empty = default
    venue_name: str = "venue"


class Alerter:
    def __init__(self, cfg: AlertConfig) -> None:
        self.cfg = cfg
        self._last_t1 = 0.0
        self._last_t2 = 0.0
        self._lock = threading.Lock()
        for path in (cfg.tts_wav_t1, cfg.tts_wav_t2):
            if not Path(path).is_file():
                log.warning("missing TTS wav: %s — run scripts/gen_tts.py", path)

    def fire_t1(self) -> bool:
        with self._lock:
            now = time.time()
            if now - self._last_t1 < self.cfg.cooldown_s:
                log.info("T1 suppressed (cooldown)")
                return False
            self._last_t1 = now
        threading.Thread(target=self._play, args=(self.cfg.tts_wav_t1,), daemon=True).start()
        return True

    def fire_t2(self, mw: float, pd_m: float = 0.0) -> bool:
        with self._lock:
            now = time.time()
            if now - self._last_t2 < self.cfg.cooldown_s:
                log.info("T2 suppressed (cooldown)")
                return False
            self._last_t2 = now
        threading.Thread(target=self._play, args=(self.cfg.tts_wav_t2,), daemon=True).start()
        threading.Thread(target=self._push_ntfy, args=(mw, pd_m), daemon=True).start()
        return True

    def _play(self, wav: str) -> None:
        if not Path(wav).is_file():
            return
        cmd = ["aplay"]
        if self.cfg.aplay_device:
            cmd += ["-D", self.cfg.aplay_device]
        cmd.append(wav)
        try:
            subprocess.run(cmd, check=False, timeout=10,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception as e:
            log.warning("aplay failed: %s", e)

    def _push_ntfy(self, mw: float, pd_m: float) -> None:
        if not self.cfg.ntfy_topic or requests is None:
            return
        url = f"{NTFY_HOST}/{self.cfg.ntfy_topic}"
        body = (f"แผ่นดินไหว! เตือนภัย\n"
                f"Estimated Mw {mw:.1f}\n"
                f"Pd={pd_m*1000:.2f} mm  venue={self.cfg.venue_name}")
        headers = {
            "Title": "SeismoGuard EEW Alert",
            "Priority": "urgent",
            "Tags": "warning,earthquake",
        }
        try:
            requests.post(url, data=body.encode("utf-8"),
                          headers=headers, timeout=5)
        except Exception as e:
            log.warning("ntfy push failed: %s", e)
