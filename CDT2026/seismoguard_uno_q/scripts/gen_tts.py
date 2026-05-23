"""
gen_tts.py — render Thai alert phrases to .wav for offline playback.

Uses espeak-ng (apt) — install via scripts/install.sh.
Falls back to silent stub wavs if espeak-ng is missing (so demo still runs).

Output:
    assets/alert_t1_th.wav   — heads-up
    assets/alert_t2_th.wav   — confirmed
"""
from __future__ import annotations

import shutil
import subprocess
import sys
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
ASSETS.mkdir(exist_ok=True)

PHRASES = {
    "alert_t1_th.wav": "เตือนภัย ตรวจพบความสั่นสะเทือน เตรียมพร้อม",
    "alert_t2_th.wav": "แผ่นดินไหว เตือนภัย รีบหลบ ใต้โต๊ะหรือมุมห้อง",
}


def stub_silence(path: Path, secs: float = 1.0) -> None:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(22050)
        w.writeframes(b"\x00\x00" * int(22050 * secs))


def render(phrase: str, out: Path) -> None:
    if shutil.which("espeak-ng"):
        subprocess.run(["espeak-ng", "-v", "th", "-s", "150", "-w", str(out), phrase],
                       check=True)
        return
    print(f"  espeak-ng missing → writing silent stub {out.name}")
    stub_silence(out)


def main() -> int:
    for fname, phrase in PHRASES.items():
        out = ASSETS / fname
        print(f"[tts] {fname}: {phrase}")
        render(phrase, out)
    print("[tts] done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
