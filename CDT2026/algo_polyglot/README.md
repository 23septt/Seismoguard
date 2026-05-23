# SeismoGuard algorithm — polyglot ports

The SeismoGuard EEW detection algorithm in four languages: **Python, Rust,
Java, C**. All four implement the same state machine and emit the same
`SampleRecord` JSON schema, so a downstream consumer can speak to any port
the same way.

Target host: **Arduino UNO Q** (Linux side, 2 GB RAM). Picks any port that
suits the task — Python for prototyping, Rust/C for low-latency production,
Java for JVM interop.

## Communication schema (locked)

```json
{
  "timestamp_ms":   "uint32",
  "sta_lta_ratio":  "float",
  "cf_z":           "float",
  "mpd_raw":        "float",
  "sample_count":   "uint16"
}
```

Full field semantics + constants in [spec/SAMPLE_RECORD.md](spec/SAMPLE_RECORD.md).

## Layout

```
algo_polyglot/
├─ spec/SAMPLE_RECORD.md       canonical schema + locked constants
├─ python/                     reference impl + 5 tests + CLI
├─ rust/                       Cargo crate, lib + bin + 5 tests
├─ java/                       single-file Java 17+, embedded tests
└─ c/                          C99 lib + CLI + Makefile + 5 tests
```

## One-line build/test per port

| Port | Command |
|---|---|
| Python | `python3 python/test_algo.py -v` |
| Rust   | `cd rust && cargo test --release` |
| Java   | `cd java && javac SeismoGuardAlgo.java && java SeismoGuardAlgo --test` |
| C      | `cd c && make test` |

## Cross-port CLI smoke test

Each port has a CLI mode: pipe `ax,ay,az` triples on stdin, get one
`SampleRecord` JSON line per sample on stdout.

```bash
printf "0,0,9.81\n0,0,9.82\n0,0,9.80\n" | python3 python/seismoguard_algo.py
printf "0,0,9.81\n0,0,9.82\n0,0,9.80\n" | ./rust/target/release/seismoguard_algo
printf "0,0,9.81\n0,0,9.82\n0,0,9.80\n" | java -cp java SeismoGuardAlgo
printf "0,0,9.81\n0,0,9.82\n0,0,9.80\n" | ./c/seismoguard_algo
```

**Float text formatting (locked):** all four ports now use the same
precision contract — `sta_lta_ratio` at 6 decimals (`%.6f`), and `cf_z`
+ `mpd_raw` at full f64 precision (round-trip-exact). Text differs in
form (scientific vs decimal notation, `0.0` vs `0.00000000000000000`)
but parses to the same `f64`. `tools/parity_check.py` passes at the
strict **`1e-9` default tolerance** across all ports.

## State machine

```
   STANDBY ──ratio≥6.0 & cf_raw≥2e-4 (×3 samples)──▶ DETECTING
       ▲                                                │
       │ LTA reseed                                     │ 300-sample
       │ (5 s)                                          │ Pd window
   LOCKOUT ◀── alarm timeout (15 s) ── ALARMING ◀── Mw ≥ T2
```

Identical in all four ports — line-by-line port of the Python reference.

## Deliberate divergences from S3 firmware

The polyglot ports tighten one issue in the original S3 firmware:

- **Anti-tap gate uses raw cf, not spike-clamped cf.** In quiet
  environments where `LTA = LTA_FLOOR`, the clamp would force `cf_z` below
  `MIN_TRIG_CF_ABS` and block all triggers. Raw `dz²` is checked against
  `MIN_TRIG_CF_ABS` for the anti-tap decision; the clamped value is still
  used in the STA/LTA filter input (and emitted as `cf_z`).
- **No on-boot calibration.** Caller is responsible for seeding the noise
  floor via `seed_lta(noise_floor_cf)` if a known value is available.
  Without seeding, the detector self-bootstraps as samples arrive (LTA
  starts at `LTA_FLOOR`, grows from samples in `STANDBY`).

Both behaviours documented in [spec/SAMPLE_RECORD.md](spec/SAMPLE_RECORD.md).

## When to use which port

| Port | Strengths | Weaknesses |
|---|---|---|
| Python | fastest to iterate; reference truth; great for grid search | GIL, slowest per-sample |
| Rust   | best perf + safety; smallest binary; LTO | longest build, needs toolchain |
| C      | smallest dep footprint; runs everywhere; portable to ESP/MCU | no built-in JSON parser |
| Java   | JVM interop; rich stdlib; easy distribution | startup latency; bigger memory |

For UNO Q live deployment: C or Rust. For tuning + analysis: Python.

## Cross-port parity test (manual)

To verify a port matches the reference, feed both the same CSV and compare
JSON line-by-line **after numeric parsing**:

```bash
# Generate input
python3 -c "import math
for i in range(500):
    t = i*0.01
    a = 2*math.sin(2*math.pi*3*t)*math.exp(-1.5*t) if t>0 else 0
    print(f'0,0,{9.81+a}')" > input.csv

# Run all ports
python3 python/seismoguard_algo.py < input.csv > out_py.jsonl
./c/seismoguard_algo                 < input.csv > out_c.jsonl
# (etc for Rust, Java)

# Compare with a numeric-aware diff (parse JSON, compare floats with tolerance)
```
