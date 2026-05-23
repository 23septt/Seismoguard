# UNO Q MCU ↔ Linux comms — wiring options

The UNO Q is two computers in one package: a **Qualcomm QRB2210 MPU**
running Debian and a separate **STM32U585 MCU** for hardware sketches.

This MCU sketch streams sample data and accepts alert commands over a
serial port. Two ways to wire that to the Python detector:

## Option A — Standalone (recommended for first demo)

The Python detector runs **on a laptop** plugged into the UNO Q's USB-C
port. The laptop sees the UNO Q as a regular Arduino: `/dev/ttyACM0`
(Linux/macOS) or `COMx` (Windows). The sketch uses `Serial` (USB-CDC).

```
[ Laptop ──USB-C──> UNO Q ]
   detector.py            sketch (Serial)
   dashboard
   ntfy + TTS
```

**Pros:** simplest. Laptop has speaker, display, network. Works even if
the UNO Q's Linux side is broken or unconfigured.
**Cons:** demo depends on the laptop staying connected.

Use this by leaving `#define COMM Serial` at the top of the sketch.

## Option B — On-board (UNO Q Linux runs everything)

The detector runs on the **UNO Q's own Linux side**. The internal channel
between MPU and STM32 is:

- **MPU (Linux):** `/dev/ttyHS1` (UART2)
- **MCU (STM32):** `Serial2` (LPUART1)
- **Baud:** 115200, 8N1

**Caveat:** this UART is reserved by the **Arduino-Router** service that
bridges RPC calls between MPU and MCU. To talk plain serial, stop it:

```bash
sudo systemctl stop arduino-router
sudo systemctl disable arduino-router    # persist across reboots
```

Then on the Linux side run `python3 -m linux.main --port /dev/ttyHS1`.

In the sketch, set:

```cpp
#define COMM Serial2
```

**Pros:** self-contained device, no laptop needed.
**Cons:** loses the Arduino-Router RPC features. SPI Bus-5 is the
"future-proof" alternative if RPC is needed; not implemented here.

## What we ship

Default = Option A (`Serial`, USB-CDC). The `BUILD_DAY.md` checklist
assumes Option A. Switch to Option B if you need to demo without a
laptop on stage — but test it the night before, the bridge interaction
has surprised people on the forum.

## References

- [UNO Q Arduino Forum — Linux↔STM32 serial](https://forum.arduino.cc/t/uno-q-serial-communication-between-linux-and-stm32-beside-arduino-router-bridge/1444094)
- [UNO Q product docs](https://docs.arduino.cc/hardware/uno-q)
- [Arduino_Modulino library examples](https://github.com/arduino-libraries/Modulino/tree/main/examples)
