# Java port

Single-file, no Maven, no external deps. Java 17+.

## Build + test

```bash
javac SeismoGuardAlgo.java
java SeismoGuardAlgo --test
# CLI
echo "0,0,9.81" | java SeismoGuardAlgo
```

Tests embedded in `main()`; passes when `--test` exits with code 0.
