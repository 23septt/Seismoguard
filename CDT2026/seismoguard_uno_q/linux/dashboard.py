"""
dashboard.py — minimal Flask live view for judges + debugging.

Routes:
    GET /            HTML page (auto-refresh via SSE)
    GET /stream      Server-sent events: ratio, state, recent events
    GET /api/state   JSON snapshot

Run on UNO Q Linux side:
    python3 -m linux.dashboard --port 8080
"""
from __future__ import annotations

import json
import threading
import time
from collections import deque
from dataclasses import dataclass, asdict
from typing import Deque, Dict, List

from flask import Flask, Response, render_template_string

INDEX_HTML = """<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0e1116">
<title>SeismoGuard CDT2026 — Live</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
         background:#0e1116; color:#e6edf3; margin:0; padding:1rem;
         -webkit-text-size-adjust:100%; }
  h1 { font-size:1.2rem; margin:0 0 1rem 0; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:1rem; }
  .card { background:#161b22; border:1px solid #30363d; border-radius:8px;
          padding:1rem; min-width:0; }
  .big  { font-size:clamp(2rem, 12vw, 3rem); font-weight:700;
          font-variant-numeric:tabular-nums; word-break:break-word; }
  .state-STANDBY    { color:#3fb950; }
  .state-DETECTING  { color:#d29922; }
  .state-ALARMING   { color:#f85149; }
  .state-LOCKOUT    { color:#58a6ff; }
  ul#events { list-style:none; padding:0; margin:0; max-height:300px;
              overflow:auto; font-size:.9rem;
              -webkit-overflow-scrolling:touch; }
  ul#events li { padding:.5rem 0; border-bottom:1px solid #21262d;
                 word-break:break-word; }
  canvas { width:100%; height:120px; background:#0d1117;
           border:1px solid #30363d; border-radius:4px; touch-action:none; }
  /* phone / portrait — collapse to single column, taller wave */
  @media (max-width: 640px) {
    .grid { grid-template-columns: 1fr; }
    .card[style*="grid-column"] { grid-column: auto !important; }
    canvas { height: 160px; }
    .big  { font-size: clamp(2.5rem, 18vw, 4rem); }
    h1 { font-size: 1rem; }
  }
</style>
</head>
<body>
  <h1>⚡ SeismoGuard CDT2026 — Live</h1>
  <div class="grid">
    <div class="card">
      <div>State</div>
      <div id="state" class="big state-STANDBY">STANDBY</div>
    </div>
    <div class="card">
      <div>STA/LTA ratio (trigger ≥ 6.0)</div>
      <div id="ratio" class="big">0.00</div>
    </div>
    <div class="card" style="grid-column:span 2">
      <div>Z-axis acceleration (last ~5 s)</div>
      <canvas id="wave"></canvas>
    </div>
    <div class="card" style="grid-column:span 2">
      <div>Recent events</div>
      <ul id="events"></ul>
    </div>
  </div>

<script>
const wave = document.getElementById('wave');
const ctx  = wave.getContext('2d');
const buf  = [];
const BUFLEN = 500;

function drawWave() {
  wave.width = wave.clientWidth;
  wave.height = wave.clientHeight;
  ctx.clearRect(0,0,wave.width,wave.height);
  ctx.strokeStyle = '#58a6ff';
  ctx.beginPath();
  for (let i=0;i<buf.length;i++){
    const x = (i / BUFLEN) * wave.width;
    const y = wave.height/2 - buf[i]*30;
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.stroke();
  ctx.strokeStyle = '#30363d';
  ctx.beginPath(); ctx.moveTo(0,wave.height/2); ctx.lineTo(wave.width,wave.height/2); ctx.stroke();
}

const ev = new EventSource('/stream');
ev.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.type === 'sample') {
    document.getElementById('ratio').textContent = m.ratio.toFixed(2);
    const stateEl = document.getElementById('state');
    stateEl.textContent = m.state_name;
    stateEl.className = 'big state-' + m.state_name;
    buf.push(m.dz);
    if (buf.length > BUFLEN) buf.shift();
    drawWave();
  } else if (m.type === 'event') {
    const li = document.createElement('li');
    li.textContent = `[${new Date().toLocaleTimeString()}] ${m.msg}`;
    const list = document.getElementById('events');
    list.insertBefore(li, list.firstChild);
    while (list.children.length > 30) list.removeChild(list.lastChild);
  }
};
</script>
</body>
</html>
"""

STATE_NAMES = {0: "STANDBY", 1: "DETECTING", 2: "ALARMING", 3: "LOCKOUT"}


class Dashboard:
    def __init__(self) -> None:
        self.app = Flask(__name__)
        self._subscribers: List[Deque[str]] = []
        self._lock = threading.Lock()
        self._latest: Dict = {"type": "sample", "ratio": 0.0,
                              "state_name": "STANDBY", "dz": 0.0}
        self._start_ts = time.time()
        self._last_sample_ts: float = 0.0
        self._setup_routes()

    def _setup_routes(self) -> None:
        @self.app.route("/")
        def index() -> str:
            return render_template_string(INDEX_HTML)

        @self.app.route("/api/state")
        def state() -> Response:
            return Response(json.dumps(self._latest), mimetype="application/json")

        @self.app.route("/healthz")
        def healthz() -> Response:
            now = time.time()
            age = now - self._last_sample_ts if self._last_sample_ts else None
            healthy = bool(self._last_sample_ts) and (age is not None and age < 5.0)
            body = {
                "status": "ok" if healthy else "stale",
                "uptime_s": round(now - self._start_ts, 1),
                "last_sample_age_s": (round(age, 3) if age is not None else None),
                "state": self._latest.get("state_name"),
            }
            return Response(json.dumps(body), mimetype="application/json",
                            status=200 if healthy else 503)

        @self.app.route("/stream")
        def stream() -> Response:
            q: Deque[str] = deque(maxlen=200)
            with self._lock:
                self._subscribers.append(q)
            def gen():
                try:
                    while True:
                        if q:
                            yield f"data: {q.popleft()}\n\n"
                        else:
                            time.sleep(0.05)
                finally:
                    with self._lock:
                        if q in self._subscribers:
                            self._subscribers.remove(q)
            return Response(gen(), mimetype="text/event-stream")

    def _broadcast(self, payload: Dict) -> None:
        data = json.dumps(payload)
        with self._lock:
            for q in self._subscribers:
                q.append(data)

    def push_sample(self, ratio: float, state: int, dz: float) -> None:
        self._latest = {"type": "sample", "ratio": ratio,
                        "state_name": STATE_NAMES.get(state, "?"), "dz": dz}
        self._last_sample_ts = time.time()
        self._broadcast(self._latest)

    def push_event(self, msg: str) -> None:
        self._broadcast({"type": "event", "msg": msg})

    def run(self, host: str = "0.0.0.0", port: int = 8080) -> None:
        self.app.run(host=host, port=port, threaded=True, use_reloader=False)
