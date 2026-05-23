# Python reference port

Canonical implementation. Other ports validate by matching this one's JSONL output for a given input stream.

## Run

```bash
# unit tests
python3 test_algo.py -v

# CLI: feed ax,ay,az CSV on stdin, get SampleRecord JSON on stdout
echo "0,0,9.81" | python3 seismoguard_algo.py
```

## Files

| File | Role |
|---|---|
| `seismoguard_algo.py` | `SeismoGuardAlgo` class + `SampleRecord` dataclass + CLI entrypoint |
| `test_algo.py` | unittest suite — JSON schema, DC quiet, wrap-around, Mw formula, synthetic trigger |

No external deps. Pure stdlib.
