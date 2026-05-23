"""
main.py — orchestrator. Connects SerialBridge → Detector → Alerter + Dashboard.

Run on UNO Q Linux:
    python3 -m linux.main --port /dev/ttyACM0 --config seismoguard.conf

Config file (key=value, # for comment):
    ntfy_topic    = seismoguard_<long_random>
    venue_name    = depa_demo_room
    mw_t1         = 3.5
    mw_t2         = 4.5
    r_km          = 10.0
    cooldown_s    = 30
    aplay_device  =                       # blank = default
    dashboard_port= 8080
"""
from __future__ import annotations

import argparse
import logging
import signal
import sys
import threading
import time
from pathlib import Path
from typing import Dict

from alert import Alerter, AlertConfig
from dashboard import Dashboard
from detector import Detector
from serial_bridge import SerialBridge

log = logging.getLogger("main")


def load_conf(path: str) -> Dict[str, str]:
    cfg: Dict[str, str] = {}
    p = Path(path)
    if not p.is_file():
        log.warning("config %s not found — using defaults", path)
        return cfg
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        cfg[k.strip()] = v.strip()
    return cfg


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", required=True, help="serial port (e.g. /dev/ttyACM0)")
    ap.add_argument("--baud", type=int, default=115200)
    ap.add_argument("--config", default="seismoguard.conf")
    ap.add_argument("--log-level", default="INFO")
    args = ap.parse_args()

    logging.basicConfig(level=args.log_level,
                        format="%(asctime)s %(name)s %(levelname)s %(message)s")
    cfg = load_conf(args.config)

    det = Detector(
        mw_t1=float(cfg.get("mw_t1", 3.5)),
        mw_t2=float(cfg.get("mw_t2", 4.5)),
        r_km=float(cfg.get("r_km", 10.0)),
    )
    alerter = Alerter(AlertConfig(
        ntfy_topic=cfg.get("ntfy_topic", ""),
        cooldown_s=float(cfg.get("cooldown_s", 30)),
        aplay_device=cfg.get("aplay_device", ""),
        venue_name=cfg.get("venue_name", "venue"),
    ))
    dash = Dashboard()
    bridge = SerialBridge(args.port, args.baud, detector=det)

    try:
        bridge.open()
    except Exception as e:
        log.error("serial open failed: %s", e)
        return 2

    bridge.start()

    dash_port = int(cfg.get("dashboard_port", 8080))
    threading.Thread(target=dash.run, kwargs={"port": dash_port}, daemon=True).start()
    log.info("dashboard on http://0.0.0.0:%d", dash_port)

    stop = threading.Event()

    def handle_sigint(_sig, _frm):
        log.info("shutdown requested")
        stop.set()

    signal.signal(signal.SIGINT, handle_sigint)
    signal.signal(signal.SIGTERM, handle_sigint)

    while not stop.is_set():
        try:
            ev = bridge.events.get(timeout=0.2)
        except Exception:
            continue
        if ev.kind == "sample" and ev.sample:
            s = ev.sample
            dash.push_sample(s.ratio, s.state, s.az)
        elif ev.kind == "trigger":
            dash.push_event(f"TRIGGER ratio={ev.payload}")
            log.info("trigger: %s", ev.payload)
        elif ev.kind == "detrigger":
            dash.push_event("detrigger")
        elif ev.kind == "boot":
            dash.push_event(f"MCU boot fw={ev.payload}")
            log.info("MCU booted: %s", ev.payload)
        elif ev.kind == "decision" and ev.decision:
            d = ev.decision
            msg = f"DECISION {d.reason} Mw={d.mw_est:.2f} Pd={d.pd_m*1000:.2f}mm τc={d.tau_c:.2f}s"
            dash.push_event(msg)
            log.info(msg)
            if d.fire_t2:
                alerter.fire_t2(d.mw_est, d.pd_m)
            elif d.fire_t1:
                alerter.fire_t1()
        elif ev.kind == "other":
            log.debug("mcu: %s", ev.payload)

    bridge.stop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
