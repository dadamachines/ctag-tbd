# Boot Stability Fixes (March 2026)

## Problem

The ESP32-P4 was rebooting 3–4 times during boot, and the USB NCM network connection would not start. This made the device unreachable via the WebUI.

## Root Cause

Two bugs were found through serial debug capture:

### 1. SD Card Mount Failure — `components/drivers/fs.cpp`

The SDMMC controller's DDR50 tuning block read can fail intermittently (`sdmmc_card_init failed (0x106)`). When this happened, `MountSDCard()` returned `false` and `InitFS()` called `assert(sd_mounted)`, which aborted the firmware and triggered a `SW_CPU_RESET`.

### 2. Unknown Network Mode Assert — `main/SPManager.cpp`

After the SD mount failure reboot, the SD card sometimes still wasn't ready, causing config files to be unreadable. `GetNetworkConfigurationData("mode")` returned an empty string, which didn't match any known mode (`wifi_ap`, `wifi_sta`, `usbncm`). The code hit `assert(0)`, triggering another reboot. This created a reboot loop.

## Fixes

### fs.cpp — SD Mount Retry Loop

`InitFS()` now retries the SD card mount up to 5 times with 500 ms backoff between attempts:

```cpp
const int maxRetries = 5;
for (int attempt = 1; attempt <= maxRetries; attempt++) {
    sd_mounted = MountSDCard();
    if (sd_mounted) break;
    ESP_LOGW("FS", "SD card mount attempt %d/%d failed, retrying in 500ms...", attempt, maxRetries);
    vTaskDelay(500 / portTICK_PERIOD_MS);
}
assert(sd_mounted); // only asserts after all retries are exhausted
```

### SPManager.cpp — Graceful Fallback for Unknown Network Mode

Instead of `assert(0)` on an unknown network mode string, the code now defaults to USB NCM with a warning:

```cpp
else {
    ESP_LOGW("SPM", "Unknown network mode '%s', defaulting to usbncm", mode.c_str());
    CTAG::DRIVERS::tusb::WaitForNCMReady(5000);
    NET::Network::SetIfType(NET::Network::IF_TYPE::IF_TYPE_USBNCM);
}
```

## Serial Boot Capture Tool

A test script was added at `tests/serial_boot_capture.py` for automated boot log capture and analysis.

### Features

- Auto-detects ESP32-P4 JTAG serial port (`/dev/cu.usbmodem*`)
- Reconnects automatically when the device reboots (port disappears/reappears)
- Pattern matching for crashes, asserts, panics, watchdog triggers, and reboot events
- Tracks boot milestones: SD mount, USB enumeration, NCM ready, DHCP, audio start
- Multi-cycle support with per-cycle and overall summary

### Usage

```bash
# Single boot capture (120s default):
python3 tests/serial_boot_capture.py

# 3 boot cycles, 90 seconds each:
python3 tests/serial_boot_capture.py --cycles 3 --duration 90

# Specific port and output directory:
python3 tests/serial_boot_capture.py --port /dev/cu.usbmodem1201 --output-dir /tmp/boot_logs
```

### Requirements

```bash
pip3 install pyserial
```

## Verification

After the fixes, 3 boot cycles were captured with clean results:
- SD card mounts on first attempt
- USB NCM interface ready
- Audio task running at ~360 uS
- Zero tx/queue/parse errors
- No reboot loops
