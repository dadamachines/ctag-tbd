# Proposal: Configurable ctag-tbd — All Hardware Combinations

## Goal

Make the ctag-tbd master branch support **every combination** of two independent hardware features through build-time Kconfig flags:

1. **SD Card** — present or absent
2. **RP2350** — connected or not

Both flags are fully independent. Any combination is valid. One codebase, one build system, same DSP engine.

---

## The Four Configurations

| | **No RP2350** | **With RP2350** |
|---|---|---|
| **No SD Card** | **Config A — Minimal TBD** | **Config B — Sequencer TBD** |
| **With SD Card** | **Config C — SD TBD** | **Config D — Full TBD-16** (current) |

### Config A — Minimal TBD (P4 only, no SD, no RP2350)
- Lowest BOM cost, smallest PCB, fastest boot
- Sample ROM: original `.tbd` binary in flash partition → loaded into 28 MB PSRAM at boot
- Presets + WebUI: LittleFS flash partition
- MIDI: ESP32-P4 native USB MIDI (TinyUSB)
- 10 GPIO pins freed (SPI2+SPI3+handshake)
- PSRAM runtime buffer: 28 MB (same as all configs)
- Flash source storage: ~5 MB stock (~59s @ 44.1kHz mono), configurable up to ~10 MB

### Config B — Sequencer TBD (P4 + RP2350, no SD)
- Hardware sequencer + OLED UI via RP2350
- Sample ROM: original `.tbd` binary in flash partition → loaded into 28 MB PSRAM at boot
- Presets + WebUI: LittleFS flash partition
- MIDI: via RP2350 SPI bridge
- No SD card socket needed on PCB
- PSRAM runtime buffer: 28 MB (same as all configs)

### Config C — SD TBD (P4 + SD card, no RP2350)
- Samples stored on SD card as WAV files → loaded into 28 MB PSRAM at boot
- Runtime kit/bank switching (reload different bank from SD → PSRAM)
- Presets + WebUI: SD card
- MIDI: ESP32-P4 native USB MIDI (TinyUSB)
- 10 GPIO pins freed
- Good for: studio modules, DAW-controlled setups

### Config D — Full TBD-16 (P4 + RP2350 + SD) — current default
- Everything: sequencer, large samples, kit switching, OLED display
- This is today's dadamachines TBD-16 setup
- Zero changes needed — this is the default build

---

## Feature Matrix

| Feature | A (Minimal) | B (Seq) | C (SD) | D (Full) |
|---------|:-----------:|:-------:|:------:|:--------:|
| ESP32-P4 | ✅ | ✅ | ✅ | ✅ |
| RP2350 Sequencer | — | ✅ | — | ✅ |
| SD Card | — | — | ✅ | ✅ |
| Sample Source | Flash `.tbd` | Flash `.tbd` | SD card WAVs | SD card WAVs |
| PSRAM Buffer (runtime) | 28 MB | 28 MB | 28 MB | 28 MB |
| Source Storage | ~5-10 MB (flash) | ~5-10 MB (flash) | unlimited (SD) | unlimited (SD) |
| Runtime Kit Switch | — | — | ✅ | ✅ |
| Preset/WebUI Storage | Flash (LittleFS) | Flash (LittleFS) | SD card | SD card |
| MIDI Input | USB (native) | SPI (RP2350) | USB (native) | SPI (RP2350) |
| OLED Waveform Display | — | ✅ | — | ✅ |
| Ableton Link | optional | optional | optional | optional |
| GPIO freed | 10 pins | 0 | 10 pins | 0 |
| Boot time | fastest | fast | slower (SD mount) | slowest (SD+SPI) |

---

## Kconfig Flags

Two fully independent boolean flags. No "choice" grouping — every combination is valid.

Add to `main/Kconfig.projbuild`:

```kconfig
menu "TBD Hardware Configuration"

    config TBD_USE_SD_CARD
        bool "Enable SD card storage"
        default y
        help
            When enabled, presets, WebUI, and samples are stored on SD card.
            When disabled, presets and WebUI are served from a LittleFS
            flash partition, and sample ROM uses the original .tbd binary
            format in a dedicated flash partition (loaded into PSRAM at boot).
            
            Independent of RP2350 setting — all combinations are valid.

    config TBD_USE_RP2350
        bool "Enable RP2350 SPI communication"
        default y
        help
            When enabled, RP2350 sequencer/UI is connected via SPI2+SPI3.
            Provides: hardware sequencer, OLED display, knobs, buttons.
            When disabled, SPI GPIOs 20-23, 28-31, 50-51 are freed.
            USB MIDI is handled natively by ESP32-P4 TinyUSB.
            
            Independent of SD card setting — all combinations are valid.

endmenu
```

Build for any config:
```bash
# Config A — Minimal
idf.py menuconfig   # disable both flags
idf.py build

# Config D — Full TBD-16 (default, no changes needed)
idf.py build
```

---

## Architecture: How Each Flag Works

### `CONFIG_TBD_USE_SD_CARD` — Storage Backend

This flag controls **where data lives**. The data format (JSON presets, gzipped WebUI, audio samples) is identical in both paths — only the storage medium changes.

#### Storage Path Abstraction

```cpp
// components/drivers/storage_config.hpp
#pragma once
#include "sdkconfig.h"

#ifdef CONFIG_TBD_USE_SD_CARD
  #define STORAGE_ROOT "/sdcard"
#else
  #define STORAGE_ROOT "/littlefs"
#endif
```

Every file that currently uses `/sdcard/...` changes to `STORAGE_ROOT "/"`. This is purely mechanical — find-and-replace across ~12 files. The JSON format, directory structure, and file naming all stay identical.

#### When SD Card Enabled (current behavior)
```
Boot → mount FAT32 SD card at /sdcard
     → check hash, extract ZIP if needed
     → /sdcard/data/         → presets, macros, synth defs
     → /sdcard/www/          → WebUI (gzipped)
     → /sdcard/tbdsamples/   → sample_rom.jsn + WAV files → PSRAM
```

#### When SD Card Disabled (restored original behavior)
```
Boot → mount LittleFS partition at /littlefs  
     → /littlefs/data/      → presets, macros, synth defs
     → /littlefs/www/       → WebUI (gzipped)
     → flash partition      → sample-rom.tbd binary → PSRAM
```

#### Sample ROM: Restoring the Original `.tbd` Flash Architecture

Before commit [2a4d5a7](https://github.com/ctag-fh-kiel/ctag-tbd/commit/2a4d5a7c0fb0a2368256d944f6b4dadaa6a6086a), samples were stored as a `.tbd` binary blob in a flash partition at `0xB00000`. This was the proven, working architecture:

**The `.tbd` binary format** (from `sample_rom/readme.md`):
```
uint32  magic_number = 0xdeadface
uint32  overall_sample_data_size (bytes)
uint32  total_number_of_slices
uint32  slice_0_end_offset
uint32  slice_1_end_offset
...
uint32  slice_N-1_end_offset
int16[] raw_audio_data (interleaved, little-endian, 44.1kHz)
```

**The original load path** (still works in simulator via `spi_flash_read()` emulation):
```
esptool.py write_flash 0xB00000 sample-rom.tbd   ← flash once
boot: spi_flash_read(0xB00000, ...) → PSRAM      ← load at startup
audio: ReadSlice() → direct PSRAM access          ← zero-copy playback
```

**Capacity**: Stock config = 5 MB flash partition = ~59 seconds of 44.1kHz 16-bit mono audio as source data. This includes up to 32 wavetable banks (1 MB) + remaining sample slices (~4 MB). The 28 MB PSRAM runtime buffer is the same as with SD card — only the source storage is smaller.

**What to restore in `ctagSampleRom.cpp`**:
```cpp
void ctagSampleRom::RefreshDataStructure() {
#ifdef CONFIG_TBD_USE_SD_CARD
    if (ctagSampleRomModel::IsSampleRomSDValid()) {
        RefreshDataStructureFromSDCard();
        return;
    }
#endif
    // Original flash partition path — always available as fallback
    RefreshDataStructureFromFlash();
}
```

The `RefreshDataStructureFromFlash()` method reads the `.tbd` binary from flash using `esp_partition_read()` → parses the header (magic, slice count, offsets) → copies audio data into the existing PSRAM buffer. This code existed before the SD migration and is still present in the simulator's `spi_flash_read()` emulation — it just needs to be re-enabled on the device.

**The `sample_bank_manager.html` web UI** (in `sample_rom/`) already allows users to build custom `.tbd` files from WAV files in the browser. This tool produces the binary that gets flashed to the sample ROM partition.

#### Files Requiring `STORAGE_ROOT` Substitution

| File | What it accesses |
|------|------------------|
| `main/RestServer.cpp` | Serves WebUI files |
| `main/DeviceAPI.cpp` | Reads/writes device config |
| `main/PluginAPI.cpp` | Plugin configuration |
| `main/SampleAPI.cpp` | Sample management |
| `main/MacroAPI.cpp` | Macro definitions |
| `main/MacroTranslator.cpp` | Loads macro JSON |
| `main/MacroSoundPreset.cpp` | Preset values |
| `main/MacroSoundPresetDataModel.cpp` | Preset data model |
| `main/MacroDeviceDefinition.cpp` | Device definitions |
| `main/MacroDeviceDefinitionDataModel.cpp` | Definition data model |
| `main/Favorites.cpp` | Favorites storage |
| `main/FavoritesModel.cpp` | Favorites data model |
| `components/.../ctagSampleRomModel.cpp` | Sample ROM index (`SD_CARD_SAMPLE_FOLDER`) |

#### Files Requiring `#ifdef CONFIG_TBD_USE_SD_CARD`

| File | What changes |
|------|-------------|
| `components/drivers/fs.cpp` | `mount_sdcard()` vs `mount_littlefs()` |
| `components/.../ctagSampleRom.cpp` | SD WAV loading vs flash `.tbd` loading |
| `CMakeLists.txt` | SD archive build step vs LittleFS image generation |
| `main/main.cpp` | Boot path selection |

---

### `CONFIG_TBD_USE_RP2350` — SPI Communication

This flag controls whether the RP2350 sequencer hardware is connected.

#### When RP2350 Enabled (current behavior)
```
┌─────────┐   SPI2 (real-time)   ┌─────────┐
│ RP2350  │◄─────────────────────►│ ESP32-P4│
│ Pico    │   SPI3 (file xfer)   │         │
│         │◄─────────────────────►│         │
└─────────┘                       └─────────┘
   │ MIDI from knobs/buttons/seq
   │ OLED display
   │ Waveform preview
```

**SPI2** (audio-rate, every frame):
- RP2350 → P4: MIDI note/CC data, sequencer tempo (512 bytes)
- P4 → RP2350: USB MIDI forward, waveform data, Ableton Link tempo, LED color (464 bytes)

**SPI3** (on-demand):
- File transfer, sample bank switching, OTA commands

#### When RP2350 Disabled
```
USB MIDI ──► ESP32-P4 TinyUSB ──► Audio Task
```

- No SPI buses initialized
- MIDI comes directly from ESP32-P4's native TinyUSB USB-MIDI device
- `handleMidiControlChange()` and `handleNoteOn()` are already source-agnostic
- Waveform data, LED control, and sequencer tempo packing are skipped

#### GPIO Pins Freed (10 total)

| GPIO | Current Use | Available When RP2350 Disabled |
|------|-------------|-------------------------------|
| 20 | SPI3 CS | ✅ |
| 21 | SPI3 SCLK | ✅ |
| 22 | SPI3 MISO | ✅ |
| 23 | SPI3 MOSI | ✅ |
| 28 | SPI2 CS | ✅ |
| 29 | SPI2 MISO | ✅ |
| 30 | SPI2 SCLK | ✅ |
| 31 | SPI2 MOSI | ✅ |
| 50 | Handshake 1 | ✅ |
| 51 | Handshake 2 | ✅ |

These 10 pins could be used for: additional CV inputs (ADC), gate outputs, rotary encoders, I2C displays, extra I2S audio channels, or other peripherals.

#### Files Requiring `#ifdef CONFIG_TBD_USE_RP2350`

| File | What changes |
|------|-------------|
| `components/drivers/rp2350_spi_stream.cpp/.hpp` | Entire SPI2 slave driver — no-op stubs when disabled |
| `main/SpiAPI.cpp/.hpp` | Entire SPI3 master task — excluded when disabled |
| `main/SPManager.cpp` | Audio task: guard SPI buffer exchange, route MIDI from TinyUSB directly |
| `main/main.cpp` | Skip `SpiAPI::StartSpiAPI()` |
| `CMakeLists.txt` (drivers) | Conditionally exclude `rp2350_spi_stream.cpp` |

---

## Partition Tables

Each SD card flag setting needs a different partition layout.

### With SD Card (`CONFIG_TBD_USE_SD_CARD=y`) — current
```csv
# Name,    Type, SubType, Offset,   Size,   Flags
nvs,       data, nvs,     0x9000,   0x4000
otadata,   data, ota,     0xd000,   0x2000
phy_init,  data, phy,     0xf000,   0x1000
ota_0,     app,  ota_0,   0x10000,  5M
ota_1,     app,  ota_1,   ,         1M
```
Presets, WebUI, and samples all live on SD card. Flash is firmware only.
Works for both Config C and Config D.

### Without SD Card (`CONFIG_TBD_USE_SD_CARD=n`)
```csv
# Name,    Type, SubType,  Offset,    Size,   Flags
nvs,       data, nvs,      0x9000,    0x4000
otadata,   data, ota,      0xd000,    0x2000
phy_init,  data, phy,      0xf000,    0x1000
ota_0,     app,  ota_0,    0x10000,   0x320000         # 3.1 MB firmware
storage,   data, spiffs,   0x330000,  0x200000         # 2 MB presets + WebUI (LittleFS)
sample_rom,data, 0x40,     0x530000,  0x500000         # 5 MB sample ROM (.tbd binary)
```
With 16 MB flash: 3.1 MB firmware + 2 MB storage + 5 MB sample ROM + overhead.
Works for both Config A and Config B.

The 5 MB sample ROM matches the original stock configuration (~59 seconds of 44.1kHz 16-bit mono). Users who need more can increase `sample_rom` size up to ~10 MB by reducing firmware partition size (single OTA slot).

---

## Sample ROM: Detailed Comparison

**Important**: In ALL configurations, samples are played from the **same 28 MB PSRAM buffer** at runtime. The SD card and flash partition are never read during audio playback — they are only the source from which data is loaded into PSRAM at boot (or on kit switch). `ReadSlice()` always reads from PSRAM. Audio performance is identical regardless of storage backend.

### With SD Card (current)
```
/sdcard/tbdsamples/sample_rom.jsn    ← JSON index (bank names, slice metadata)
/sdcard/tbdsamples/bank_0/*.wav      ← WAV files per bank
/sdcard/tbdsamples/bank_1/*.wav      ← multiple banks supported
Boot: parse JSON → open WAVs → read into 28 MB PSRAM buffer
Runtime: bank switch = re-read different bank from SD → PSRAM (brief silence)
```
- **Pro**: can fill the full 28 MB PSRAM buffer, runtime bank switching, easy editing (drop WAVs on SD), unlimited storage for multiple banks
- **Con**: requires SD card hardware, slower boot, complex index format

### Without SD Card (original architecture, to be restored)
```
Flash partition @ 0x530000           ← .tbd binary blob (header + raw audio)
Boot: esp_partition_read() → parse header → copy to 28 MB PSRAM buffer
Runtime: fixed sample set (no switching)
```
- **Pro**: no SD hardware, fast boot, proven format, browser-based tool to build `.tbd` files
- **Con**: flash partition limits how much source data can be stored (~5 MB stock, up to ~10 MB with single OTA slot), no runtime switching
- **Existing tooling**: `sample_rom/sample_bank_manager.html` builds `.tbd` files from WAVs in-browser
- **Note**: The 28 MB PSRAM buffer is the same — only the source storage is smaller. The 5 MB flash partition can hold ~59s of 44.1kHz mono audio, which was sufficient for the original ctag-tbd

### The `.tbd` Format in Detail
```
Offset  Size     Content
0x00    4 bytes  Magic: 0xdeadface
0x04    4 bytes  Total audio data size (bytes)
0x08    4 bytes  Number of slices (N)
0x0C    4*N      End offset of each slice (cumulative)
0x0C+   varies   Raw int16 audio data, 44.1kHz, mono
+4*N
```

Wavetable slices come first (index 0 to `firstNonWtSlice-1`):
- 32 banks × 64 wavetables × 256 samples = 1 MB
- Each wavetable: 256 int16 samples (512 bytes)

Sample slices follow (index `firstNonWtSlice` to N-1):
- Variable length, mono 44.1kHz int16
- Stereo: left channel slice immediately followed by right channel slice

---

## Implementation Plan

### Phase 1 — Storage Path Abstraction (Low Risk, No Behavior Change)
**Goal**: Prepare codebase for SD card optionality without changing any defaults.

1. Create `components/drivers/storage_config.hpp` with `STORAGE_ROOT` macro
2. Replace all hardcoded `/sdcard` path literals with `STORAGE_ROOT` across ~13 files
3. Add `CONFIG_TBD_USE_SD_CARD` and `CONFIG_TBD_USE_RP2350` to Kconfig (both default `y`)
4. No functional change — existing TBD-16 builds identically

**Validation**: build with defaults, flash, verify all tests pass.

### Phase 2 — RP2350 Conditional Compilation (Medium Risk)
**Goal**: Build and run without RP2350 connected.

1. Add `#ifdef CONFIG_TBD_USE_RP2350` guards around:
   - `rp2350_spi_stream.cpp/.hpp` — provide empty stubs
   - `SpiAPI.cpp/.hpp` — skip SPI3 task
   - `SPManager.cpp` audio loop — skip SPI buffer exchange
2. When RP2350 disabled, read MIDI directly from TinyUSB in the audio task
3. Guard GPIO initialization for SPI2/SPI3 pins

**Validation**: build with `CONFIG_TBD_USE_RP2350=n`, flash, verify audio + USB MIDI works without RP2350.

### Phase 3 — LittleFS Flash Storage (Medium Risk)
**Goal**: Serve presets and WebUI from flash when SD card is absent.

1. Add `storage` partition (2 MB, LittleFS) to the no-SD partition table
2. Build step: generate LittleFS image from `sdcard_image/data/` + `sdcard_image/www/`
3. In `fs.cpp`: `#ifdef CONFIG_TBD_USE_SD_CARD` → `mount_sdcard()`, else → `mount_littlefs()`
4. Guard SD-specific boot logic (ZIP extraction, hash check) with the flag
5. Add `esptool.py write_flash` step for the storage partition

**Validation**: build with `CONFIG_TBD_USE_SD_CARD=n`, flash firmware + storage partition, verify WebUI loads, presets work.

### Phase 4 — Restore `.tbd` Flash Sample ROM (Medium Risk)
**Goal**: Load samples from flash partition when SD card is absent.

1. Add `sample_rom` partition (5 MB) to the no-SD partition table
2. Re-enable `RefreshDataStructureFromFlash()` in `ctagSampleRom.cpp`:
   - Find `sample_rom` partition via `esp_partition_find()`
   - Read `.tbd` header: validate magic `0xdeadface`, parse slice count + offsets
   - Copy audio data into existing PSRAM buffer
3. Fall-through logic: SD samples take priority → flash `.tbd` as fallback
4. Flash sample ROM: `esptool.py write_flash 0x530000 sample-rom.tbd`

**Validation**: build with `CONFIG_TBD_USE_SD_CARD=n`, flash firmware + storage + sample ROM, verify rompler plays samples.

### Phase 5 — Testing All Four Configurations
**Goal**: Verify every combination builds and runs correctly.

| Test | Config A | Config B | Config C | Config D |
|------|:--------:|:--------:|:--------:|:--------:|
| Build succeeds | ☐ | ☐ | ☐ | ☐ |
| Boot without crash | ☐ | ☐ | ☐ | ☐ |
| WebUI loads (HTTP 200) | ☐ | ☐ | ☐ | ☐ |
| Presets load | ☐ | ☐ | ☐ | ☐ |
| Sample ROM loads | ☐ | ☐ | ☐ | ☐ |
| Audio plays | ☐ | ☐ | ☐ | ☐ |
| MIDI input works | ☐ | ☐ | ☐ | ☐ |
| RP2350 sequencer (if applicable) | — | ☐ | — | ☐ |
| Kit switching (if applicable) | — | — | ☐ | ☐ |

---

## Code Change Summary

### Files Changed by Storage Path Abstraction (~13 files, Phase 1)

All changes are mechanical `/sdcard` → `STORAGE_ROOT` replacements:

```
main/RestServer.cpp
main/DeviceAPI.cpp
main/PluginAPI.cpp
main/SampleAPI.cpp
main/MacroAPI.cpp
main/MacroTranslator.cpp
main/MacroSoundPreset.cpp
main/MacroSoundPresetDataModel.cpp
main/MacroDeviceDefinition.cpp
main/MacroDeviceDefinitionDataModel.cpp
main/Favorites.cpp
main/FavoritesModel.cpp
components/ctagSoundProcessor/helpers/ctagSampleRomModel.cpp
```

### Files Changed by `#ifdef` Guards (~6 files, Phase 2-4)

```
components/drivers/fs.cpp                    — SD mount vs LittleFS mount
components/drivers/rp2350_spi_stream.cpp     — SPI2 driver (no-op when disabled)
components/ctagSoundProcessor/helpers/ctagSampleRom.cpp  — SD vs flash loading
main/SpiAPI.cpp                              — SPI3 task (skip when disabled)
main/SPManager.cpp                           — Audio task MIDI source routing
main/main.cpp                                — Boot sequence branching
```

### New Files (~2 files)

```
components/drivers/storage_config.hpp        — STORAGE_ROOT macro
partitions_no_sd.csv                         — Partition table for no-SD configs
```

### Files Unchanged

All sound processor plugins, audio codec driver, Ableton Link, WebUI JavaScript/HTML, network stack — **zero changes**. The DSP engine is completely isolated from storage and I/O backend choices.

---

## Benefits Per Configuration

| Benefit | A (Minimal) | B (Seq) | C (SD) | D (Full) |
|---------|:-----------:|:-------:|:------:|:--------:|
| Lowest BOM cost | ✅ | | | |
| Smallest PCB possible | ✅ | | ✅ | |
| Fastest boot | ✅ | ✅ | | |
| Large sample storage | | | ✅ | ✅ |
| Runtime kit switching | | | ✅ | ✅ |
| Hardware sequencer + UI | | ✅ | | ✅ |
| 10 free GPIO pins | ✅ | | ✅ | |
| Single flash = done | ✅ | | | |
| No dual-MCU debugging | ✅ | | ✅ | |
| Same DSP quality | ✅ | ✅ | ✅ | ✅ |

---

## P4-Only UI & Sequencer (Config A Enhancement)

Config A (Minimal TBD) as described above has no display, no knobs, no step buttons — it's a headless WebUI-only module. But the **same 10 freed GPIOs** and the **idle HP core** can run the sequencer and drive the OLED display directly on the ESP32-P4, eliminating the RP2350 entirely while keeping the full hardware UI experience.

This section explores how to port the RP2350 sequencer codebase to run natively on ESP32-P4.

### Why This Works

The RP2350 sequencer codebase (`tbd-pico-seq3`) was designed with clean hardware abstraction:

| Layer | Platform-dependent? | Lines of code |
|-------|:-------------------:|:-------------:|
| Sequencer engine (`lib/sequencer/`) | No — pure C++ | ~2000 |
| UI screens (`lib/sequencerui/screens/`) | No — render to abstract `Bitmap*` framebuffer | ~4000 (30+ files) |
| UI state machine (`lib/sequencerui/sequi.*`) | No — event-driven state machine | ~800 |
| Graphics helpers (`lib/sequencerui/graphics/`) | No — generic pixel operations | ~500 |
| MIDI parsing | No — standard UART/USB protocol | ~300 |
| **Display driver** (`src/UiDisplay.*`) | **Yes** — RP2350 PIO SPI | ~150 |
| **GPIO/I2C init** (`src/Ui.cpp`) | **Yes** — RP2350 pin assignments | ~100 |
| **Main loop** (`examples/main.cpp`) | **Yes** — RP2350 task scheduling | ~300 |

**~7600 lines reusable, ~550 lines to rewrite.** Over 90% of the code ports unchanged.

### ESP32-P4 Resources Available

| Resource | Capacity | Sequencer needs |
|----------|----------|-----------------|
| HP Core 0 | 360 MHz, currently runs LED + debug + SPI tasks | Sequencer UI task fits easily |
| HP Core 1 | 360 MHz, runs audio DSP | No change — audio stays here |
| Internal RAM | 768 KB total | Sequencer uses ~50 KB |
| I2C controllers | 3 total (1 used for codec) | 1 for STM32 UI board |
| SPI controllers | Multiple hardware SPI | 1 for OLED display |
| USB OTG | Already configured (`CONFIG_USB_OTG_SUPPORTED=y`) | MIDI host for controllers |
| UART | Multiple channels | 2 for DIN MIDI in/out |

The ESP32-P4 is 2.4× faster per core and has 3× the RAM of the RP2350. Running the sequencer alongside audio DSP is well within budget.

### Hardware Connections

The 10 GPIOs freed by removing the RP2350 SPI buses, plus additional unused GPIOs, connect the same peripherals that the RP2350 drove:

#### OLED Display (SSD1309, 128×64, SPI)

| Signal | GPIO | Notes |
|--------|------|-------|
| MOSI | 25 | Data to display |
| SCLK | 26 | SPI clock |
| DC | 27 | Data/command select |
| CS | 32 | Chip select |
| RST | 33 | Hardware reset |

Uses one ESP32-P4 hardware SPI controller. The RP2350 used PIO state machines for SPI — ESP32-P4 hardware SPI is actually faster and simpler.

#### STM32 UI Input Board (I2C)

| Signal | GPIO | Notes |
|--------|------|-------|
| SDA | 36 | I2C data |
| SCL | 37 | I2C clock, 400 kHz |

Address `0x42`. Reads the same `ui_data_t` struct:
- 4 potentiometers (0–1023)
- 16 step sequencer buttons
- 6 function buttons
- 12 transport buttons (play/stop/rec/cursor)
- 3-axis accelerometer

The I2C protocol is identical — the STM32 board doesn't know or care whether it's talking to an RP2350 or ESP32-P4.

#### MIDI I/O (UART)

| Port | RX GPIO | TX GPIO |
|------|---------|---------|
| MIDI 1 | 43 | 44 |
| MIDI 2 | 45 | 46 |

Standard UART at 31250 baud. Fully portable.

#### USB MIDI Host

Uses the existing ESP32-P4 USB OTG port. Can simultaneously act as USB MIDI device (for DAW connection) and USB MIDI host (for external controllers) using TinyUSB dual-role.

### Software Architecture on ESP32-P4

#### FreeRTOS Task Layout

```
Core 1 (HP):  Audio DSP task          — priority 23 (highest, unchanged)
Core 0 (HP):  Sequencer UI task       — priority 10 (new, replaces SpiAPI task)
              LED control task         — priority 5 (existing)
              Network/WiFi task        — priority 3 (existing)
Core LP:      Watchdog, power mgmt    — (existing)
```

The sequencer UI task replaces the `SpiAPI` task that currently bridges SPI3 to the RP2350. Same core, similar priority, but now running the sequencer logic directly instead of marshaling data over SPI.

#### Sequencer ↔ Audio Communication

On the current dual-MCU setup, the RP2350 sends MIDI events to the ESP32-P4 via SPI2 every audio frame. With both running on the same chip, this simplifies to a **shared-memory ring buffer**:

```
Current (dual-MCU):
  RP2350 sequencer → SPI2 512-byte packet → ESP32-P4 audio task
  
P4-only:
  Sequencer task (Core 0) → FreeRTOS queue/ring buffer → Audio task (Core 1)
```

The audio task already calls `handleMidiControlChange()` and `handleNoteOn()` — these functions are source-agnostic. They don't care whether MIDI came from SPI, USB, or a local queue. The sequencer just needs to post events to the same handlers.

#### Display Rendering Pipeline

```
Screen classes (unchanged)
    │
    ▼
Bitmap* framebuffer (128×64, grayscale)
    │
    ▼
ESP32-P4 SPI hardware controller → SSD1309 OLED
```

The only change is the bottom layer: replace RP2350 PIO SPI with ESP32-P4 hardware SPI. This is ~50 lines of ESP-IDF `spi_master` API calls replacing ~150 lines of PIO state machine code.

#### Waveform Display

Currently the P4 sends waveform data to the RP2350 in the SPI2 return packet. With both on one chip, the sequencer UI task can read waveform data directly from the audio engine's PSRAM buffer — zero-copy, lower latency than the SPI transfer.

### Code Changes Required

#### Must Rewrite (~550 lines total)

| File | Change | Effort |
|------|--------|--------|
| `src/UiDisplay.h/.cpp` | Replace `DaDa_SPI` (RP2350 PIO) with ESP-IDF `spi_master` driver | ~150 lines |
| `src/Ui.cpp` | ESP32-P4 GPIO/I2C pin assignments, `esp_i2c_master` API | ~100 lines |
| `examples/main.cpp` | FreeRTOS task creation on Core 0, queue setup between sequencer and audio task | ~300 lines |

#### Must Add (~200 lines)

| File | Purpose |
|------|---------|
| `main/SequencerTask.cpp` | FreeRTOS wrapper: init display/I2C, run sequencer loop, post MIDI to audio queue |
| `main/SequencerTask.hpp` | Task API: `StartSequencerTask()`, MIDI event queue handle |

#### Must Modify (~50 lines)

| File | Change |
|------|--------|
| `main/SPManager.cpp` | Read MIDI from local queue (sequencer) + USB (TinyUSB) instead of SPI buffer |
| `main/main.cpp` | Start `SequencerTask` when `CONFIG_TBD_USE_P4_SEQUENCER=y` |

#### Zero Changes

All of these port unchanged (compiled into the P4 firmware instead of the RP2350 firmware):
- `lib/sequencer/*` — sequencer engine
- `lib/sequencerui/screens/*` — all 30+ screen renderers
- `lib/sequencerui/sequi.*` — UI state machine
- `lib/sequencerui/graphics/*` — bitmap/graphics helpers
- `lib/sequencerui/storage.*` — abstract storage interface
- `lib/sequencerui/host.*` — abstract host interface

### New Kconfig Flag

```kconfig
config TBD_USE_P4_SEQUENCER
    bool "Run sequencer and UI directly on ESP32-P4"
    default n
    depends on !TBD_USE_RP2350
    help
        When enabled, the sequencer engine and OLED display are driven
        directly by the ESP32-P4 on Core 0. Requires SSD1309 OLED and
        STM32 UI board connected to P4 GPIOs (not via RP2350).
        
        Mutually exclusive with TBD_USE_RP2350 — the sequencer runs
        on either the RP2350 or the P4, never both.
```

This creates a **fifth configuration**:

| | **No RP2350** | **With RP2350** |
|---|---|---|
| **No SD, no P4 sequencer** | Config A — Headless Minimal | Config B — Sequencer TBD |
| **No SD, with P4 sequencer** | **Config A+ — P4 Sequencer** | — |
| **With SD, no P4 sequencer** | Config C — SD TBD | Config D — Full TBD-16 |
| **With SD, with P4 sequencer** | **Config C+ — P4 Seq + SD** | — |

### Advantages Over Dual-MCU

| Aspect | Dual-MCU (RP2350) | P4-Only |
|--------|:------------------:|:-------:|
| BOM cost | RP2350 + crystal + flash + passives | Zero additional ICs |
| PCB area | Second MCU footprint + SPI routing | Display/I2C headers only |
| Latency (MIDI → audio) | SPI packet delay (~1ms) | Shared-memory queue (~µs) |
| Waveform display | Copied over SPI every frame | Direct PSRAM read (zero-copy) |
| Debug complexity | Two firmware images, SPI protocol debugging | Single firmware, single debugger |
| Flash/update | Two separate flash targets | One unified firmware |
| Power consumption | Two MCUs active | One MCU (LP core for idle tasks) |

### Implementation Phase

This would be **Phase 6** in the implementation plan, after all four base configurations are working:

**Phase 6 — P4-Native Sequencer (Medium Risk)**

1. Add `tbd-pico-seq3/lib/sequencer/` and `lib/sequencerui/` as ESP-IDF components (source symlinks or git submodule)
2. Write ESP32-P4 display driver (~150 lines of `spi_master` API)
3. Write ESP32-P4 I2C input driver (~100 lines of `i2c_master` API)
4. Create `SequencerTask.cpp` — FreeRTOS task on Core 0 that runs `SeqUI::process()` in a loop
5. Add MIDI event queue between sequencer task and audio task
6. Modify `SPManager.cpp` to read from local queue when P4 sequencer is active
7. Test: OLED display renders, buttons respond, sequencer plays, audio output works

**Validation**: build with `CONFIG_TBD_USE_P4_SEQUENCER=y`, `CONFIG_TBD_USE_RP2350=n`, flash, verify sequencer UI + audio works identically to RP2350 version.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Flash source storage limited to ~5-10 MB | Matches original proven capacity (~59s); PSRAM runtime buffer is the same 28 MB; users who need more source storage use SD configs |
| LittleFS preset storage limited to ~2 MB | More than enough for hundreds of presets; size is configurable |
| No runtime kit switching without SD | Expected — this is the original behavior; use `sample_bank_manager.html` to curate the right sample set; reflash partition to change |
| WebUI updates require reflashing without SD | OTA can target the `storage` partition separately |
| Breaking existing TBD-16 setups | Both flags default to `y` — zero change for existing users |
| Conditional compilation complexity | Only ~6 files need `#ifdef` guards; rest are mechanical path substitution |
| Two partition table files | Build system selects correct one based on `CONFIG_TBD_USE_SD_CARD` |
| P4 sequencer audio jitter (Core 0 contention) | Sequencer UI runs at ~30 Hz refresh; audio task on Core 1 at highest priority is unaffected. LED and network tasks are low-priority and preemptible |
| Display SPI driver rewrite | ~150 lines using ESP-IDF `spi_master` API — well-documented, standard pattern |
| Sequencer code compiled into larger firmware | Sequencer + UI libraries add ~100 KB to firmware image; 3.1 MB partition has ample margin |
| STM32 UI board hardware compatibility | I2C protocol is standard; same address (0x42), same data struct, same clock speed (400 kHz) — board is MCU-agnostic |

---

## Summary

**Two independent flags, one optional enhancement. Four base configurations, two sequencer variants. One DSP engine.**

```
CONFIG_TBD_USE_SD_CARD       — controls where data lives (SD card vs flash partitions)
CONFIG_TBD_USE_RP2350        — controls whether RP2350 sequencer hardware is connected
CONFIG_TBD_USE_P4_SEQUENCER  — runs sequencer natively on ESP32-P4 (requires !RP2350)
```

The base flags are orthogonal by design. SD card controls storage. RP2350 controls I/O. Neither depends on the other. The P4 sequencer flag is an enhancement for configs without RP2350 — it ports the sequencer engine and OLED display to run directly on the ESP32-P4's second core, eliminating the RP2350 while keeping the full hardware UI experience.

The sequencer codebase is over 90% platform-independent: pure C++ engine, abstract framebuffer rendering, standard I2C/UART protocols. Only ~550 lines of display driver and task scheduling need rewriting for ESP32-P4. The ESP32-P4 is 2.4× faster and has 3× the RAM of the RP2350 — running both audio DSP and sequencer on one chip is well within budget.

The sample ROM architecture already supports both storage paths — the SD migration (commit 2a4d5a7) added a new path but the original flash-based path (`spi_flash_read()` → PSRAM) still exists in the simulator and just needs to be re-enabled on the device behind the config flag.

Phase 1 (storage path abstraction) is safe to merge immediately — it's a mechanical refactor with no behavior change when both flags are enabled (the default). Phase 6 (P4-native sequencer) can proceed independently after Phase 2.
