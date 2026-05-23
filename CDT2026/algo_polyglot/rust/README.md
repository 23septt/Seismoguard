# Rust port

## Build + test

```bash
cargo test --release
cargo build --release
# CLI
echo "0,0,9.81" | ./target/release/seismoguard_algo
```

## Layout

| File | Role |
|---|---|
| `src/lib.rs` | `SeismoGuardAlgo` + `SampleRecord` + canonical constants + tests |
| `src/bin/seismoguard_algo.rs` | stdin CSV → stdout JSONL |
| `Cargo.toml` | manifest, LTO release profile |

No external crates. `forbid(unsafe_code)`.
