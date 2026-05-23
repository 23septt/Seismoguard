# SeismoGuard C port — POSIX make, C99.
# Usage:
#   make            -> build CLI + tests
#   make test       -> run tests
#   make clean
#
CC      ?= cc
CFLAGS  ?= -std=c99 -O2 -Wall -Wextra -Wpedantic -Iinclude
LDFLAGS ?=
LDLIBS  ?= -lm

BIN_CLI   := seismoguard_algo
BIN_TEST  := test_algo
SRC_LIB   := src/seismoguard_algo.c
SRC_CLI   := src/main.c
SRC_TEST  := tests/test_algo.c

all: $(BIN_CLI) $(BIN_TEST)

$(BIN_CLI): $(SRC_LIB) $(SRC_CLI)
	$(CC) $(CFLAGS) $^ -o $@ $(LDFLAGS) $(LDLIBS)

$(BIN_TEST): $(SRC_LIB) $(SRC_TEST)
	$(CC) $(CFLAGS) $^ -o $@ $(LDFLAGS) $(LDLIBS)

test: $(BIN_TEST)
	./$(BIN_TEST)

clean:
	rm -f $(BIN_CLI) $(BIN_TEST) *.o

.PHONY: all test clean
