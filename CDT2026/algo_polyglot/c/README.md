# C port

C99, no external deps beyond `libm`.

## Build + test

```bash
make
make test
# CLI
echo "0,0,9.81" | ./seismoguard_algo
```

## Layout

| File | Role |
|---|---|
| `include/seismoguard_algo.h` | public API + constants |
| `src/seismoguard_algo.c` | algorithm impl |
| `src/main.c` | CLI |
| `tests/test_algo.c` | in-process tests (5) |
| `Makefile` | POSIX make |
