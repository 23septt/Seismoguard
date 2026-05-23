#!/usr/bin/env bash
# install.sh — UNO Q Linux side bootstrap.
# Run once on fresh UNO Q image:
#   bash scripts/install.sh
set -euo pipefail

sudo apt-get update
sudo apt-get install -y python3 python3-pip python3-venv alsa-utils \
    i2c-tools espeak-ng

python3 -m venv .venv
. .venv/bin/activate
pip install --upgrade pip
pip install -r linux/requirements.txt

echo
echo "[install] done. Next:"
echo "  1. cp linux/seismoguard.conf.example linux/seismoguard.conf"
echo "  2. edit linux/seismoguard.conf (ntfy_topic, venue_name, …)"
echo "  3. python3 scripts/gen_tts.py     # render Thai alert wavs"
echo "  4. ls /dev/ttyACM*                # find MCU serial port"
echo "  5. . .venv/bin/activate && python3 -m linux.main --port /dev/ttyACM0"
