"""
serial_bridge.py — parse MCU serial stream, drive Detector + Alert.

Line formats from MCU (see arduino/seismoguard_uno_q.ino header):
    S,<ms>,<ax>,<ay>,<az>,<ratio>,<state>
    E,trigger,<peak_ratio>
    E,detrigger
    E,boot,<fw>
    E,calib,...
    E,reset
    E,alarm_timeout
    E,pong

Outgoing commands to MCU:
    A,1        — fire T1
    A,2,<mw>   — fire T2 with Mw value
    R          — reset alarm
    P          — ping
"""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass
from queue import Queue
from typing import Callable, Optional

import serial

from detector import Detector, Decision

log = logging.getLogger("bridge")


@dataclass
class SampleEvent:
    ms: int
    ax: float
    ay: float
    az: float
    ratio: float
    state: int


@dataclass
class BridgeEvent:
    kind: str                          # 'sample' | 'trigger' | 'detrigger' | 'boot' | 'decision' | 'other'
    sample: Optional[SampleEvent] = None
    payload: str = ""
    decision: Optional[Decision] = None


class SerialBridge:
    def __init__(self, port: str, baud: int = 115200,
                 detector: Optional[Detector] = None) -> None:
        self.port = port
        self.baud = baud
        self.det = detector or Detector()
        self.ser: Optional[serial.Serial] = None
        self.events: "Queue[BridgeEvent]" = Queue(maxsize=2048)
        self._stop = threading.Event()
        self._reader: Optional[threading.Thread] = None
        # baseline Z tracker on Linux side (mirrors MCU DC tracker, slower)
        self._z_baseline: Optional[float] = None
        self._z_alpha = 0.001

    def open(self) -> None:
        self.ser = serial.Serial(self.port, self.baud, timeout=0.5)
        time.sleep(2.0)                    # arduino reset on open
        self.ser.reset_input_buffer()

    def start(self) -> None:
        self._reader = threading.Thread(target=self._read_loop, daemon=True)
        self._reader.start()

    def stop(self) -> None:
        self._stop.set()
        if self.ser:
            try:
                self.ser.close()
            except Exception:
                pass

    def send(self, cmd: str) -> None:
        if not self.ser:
            return
        if not cmd.endswith("\n"):
            cmd += "\n"
        try:
            self.ser.write(cmd.encode("ascii"))
        except Exception as e:
            log.warning("serial write failed: %s", e)

    def fire_t1(self) -> None:
        self.send("A,1")

    def fire_t2(self, mw: float) -> None:
        self.send(f"A,2,{mw:.2f}")

    def reset_alarm(self) -> None:
        self.send("R")

    def _read_loop(self) -> None:
        while not self._stop.is_set():
            try:
                raw = self.ser.readline()
            except Exception as e:
                log.warning("read error: %s", e)
                time.sleep(0.2)
                continue
            if not raw:
                continue
            try:
                line = raw.decode("ascii", errors="ignore").strip()
            except Exception:
                continue
            if not line:
                continue
            self._handle_line(line)

    def _handle_line(self, line: str) -> None:
        kind = line[0] if line else ""
        if kind == "S":
            self._handle_sample(line)
        elif kind == "E":
            self._handle_event(line)

    def _handle_sample(self, line: str) -> None:
        parts = line.split(",")
        if len(parts) != 7:
            return
        try:
            ev = SampleEvent(
                ms=int(parts[1]),
                ax=float(parts[2]),
                ay=float(parts[3]),
                az=float(parts[4]),
                ratio=float(parts[5]),
                state=int(parts[6]),
            )
        except ValueError:
            return
        # baseline tracker (slow Z DC)
        if self._z_baseline is None:
            self._z_baseline = ev.az
        else:
            self._z_baseline = (self._z_alpha * ev.az
                                + (1 - self._z_alpha) * self._z_baseline)

        decision = self.det.on_sample(ev.ax, ev.ay, ev.az, self._z_baseline)
        self._push(BridgeEvent(kind="sample", sample=ev))
        if decision is not None:
            if decision.fire_t2:
                self.fire_t2(decision.mw_est)
            elif decision.fire_t1:
                self.fire_t1()
            else:
                self.reset_alarm()
            self._push(BridgeEvent(kind="decision", decision=decision))

    def _handle_event(self, line: str) -> None:
        parts = line.split(",", 2)
        tag = parts[1] if len(parts) > 1 else ""
        payload = parts[2] if len(parts) > 2 else ""
        if tag == "trigger":
            self.det.on_trigger()
            self._push(BridgeEvent(kind="trigger", payload=payload))
        elif tag == "detrigger":
            self._push(BridgeEvent(kind="detrigger"))
        elif tag == "boot":
            self._push(BridgeEvent(kind="boot", payload=payload))
        else:
            self._push(BridgeEvent(kind="other", payload=line))

    def _push(self, ev: BridgeEvent) -> None:
        try:
            self.events.put_nowait(ev)
        except Exception:
            pass                            # drop on overflow
