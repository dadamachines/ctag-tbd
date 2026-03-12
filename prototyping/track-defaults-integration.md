# Track Default Presets — Integration Guide

## Overview

This document describes the new **Track Default Presets** feature that lets the ESP32-P4 control which machine/preset each track loads on boot, replacing the previous random selection.

The configuration lives entirely on the **P4's SD card** (`/data/trackdefaults.json`), making it editable via WebUI or direct SD card access — no Pico reflashing needed.

---

## Architecture

```
┌──────────────────┐         SPI (0xA5)          ┌──────────────────────────┐
│   Pico RP2350    │ ──── GetTrackDefaultPresets ──▶  ESP32-P4             │
│   (Sequencer)    │ ◀──── JSON response ──────── │  (Audio DSP)           │
│                  │                              │                        │
│  initializeMacro │                              │  Reads:                │
│  Presets()       │                              │  /sdcard/data/         │
│                  │         SPI (0xA4)           │   trackdefaults.json   │
│  For each track: │ ──── LoadTrackSoundPreset ──▶│                        │
│  apply preset    │                              │  Activates machines    │
└──────────────────┘                              └──────────────────────────┘
```

### Boot sequence

1. Pico boots and calls `initializeMacroPresets()`
2. Pico sends SPI command `0xA5` (`GetTrackDefaultPresets`) to the P4
3. P4 reads `/sdcard/data/trackdefaults.json` from its own SD card
4. P4 returns the JSON contents to the Pico via SPI
5. Pico parses the response and, for each track:
   - If a preset is specified → applies it via `LoadTrackSoundPreset` (SPI `0xA4`)
   - If not specified → queries `GetMacroSoundPresetList` (SPI `0xA0`) and picks the first available preset
6. After boot, the user can override any track's preset at runtime via the OLED UI (or future WebUI)

### Runtime override priority

```
Boot defaults (from P4 trackdefaults.json)
    ↓  overridden by
OLED UI → Sound Preset screen (user picks a preset)
    ↓  overridden by
Future: WebUI live preset change (same SPI path)
```

All paths converge on the same `BACKGROUNDUPDATE_TYPE_APPLYSOUNDPRESET` handler, so they are fully interchangeable.

---

## What's Already Implemented

### Pico side (this repo: `tbd-pico-seq3`)

**Branch:** `feature/deterministic-track-machines`

| File | Change |
|------|--------|
| `src/SpiAPI.h` | Added `GetTrackDefaultPresets = 0xA5` to the `RequestType_t` enum and method declaration |
| `src/SpiAPI.cpp` | Added `GetTrackDefaultPresets()` method — sends SPI `0xA5`, receives JSON response |
| `examples/main.cpp` | Rewrote `initializeMacroPresets()` — queries P4 for defaults, falls back to first preset |
| `lib/sequencerui/host.hpp` | Added `BACKGROUNDUPDATE_TYPE_SETSAMPLEROMBANK = 7` to enum; previously fixed `shortstring[16]` → `shortstring[32]` |
| `examples/main.cpp` | Added `sampleKit` parsing from trackdefaults JSON; queues `SETSAMPLEROMBANK` event before track presets |
| `examples/main.cpp` | Added `SETSAMPLEROMBANK` handler in `loop_tickandupdateleds()` — calls `SetActiveSampleRomBank()` |

### P4 side (repo: `ctag-tbd_hacking`)

**Branch:** `feature/webui-merge-planning`

| File | Change |
|------|--------|
| `main/SpiAPI.hpp` | Added `GetTrackDefaultPresets = 0xA5` to the `RequestType` enum |
| `main/SpiAPI.cpp` | Added handler: reads `/sdcard/data/trackdefaults.json`, returns contents via `transmitCString()` |
| `main/MacroAPI.cpp` | REST endpoints `get_trackdefaults` and `save_trackdefaults` for WebUI read/write |
| `sdcard_image/data/trackdefaults.json` | Default config file with all 19 tracks mapped, incl. `sampleKit`, per-track `romBank` and `sampleSlice` |
| `sdcard_image/www/js/track-defaults.js` | WebUI: global kit dropdown, per-track Bank and Slice selectors for rompler tracks |
| `sdcard_image/www/css/app.css` | CSS for sample bank section, Slice column, dark theme overrides |

---

## P4 / WebUI Developer Tasks

### 1. Verify the SPI handler (already committed)

The handler in `main/SpiAPI.cpp` simply reads the file and returns it:

```cpp
case RequestType::GetTrackDefaultPresets:
{
    std::string json = "{}";
    FILE *f = fopen("/sdcard/data/trackdefaults.json", "r");
    if (f) {
        fseek(f, 0, SEEK_END);
        long sz = ftell(f);
        fseek(f, 0, SEEK_SET);
        if (sz > 0 && sz < 8192) {
            char *buf = (char*)malloc(sz + 1);
            if (buf) {
                fread(buf, 1, sz, f);
                buf[sz] = '\0';
                json = buf;
                free(buf);
            }
        }
        fclose(f);
    }
    result = transmitCString(requestType, json.c_str());
}
break;
```

If the file doesn't exist, it returns `"{}"` and the Pico falls back gracefully.

### 2. Create a WebUI page to edit `trackdefaults.json`

Build a simple UI page that:

1. **Reads** `/sdcard/data/trackdefaults.json` (or creates it if missing)
2. **Displays** a table of all 19 tracks with:
   - Track index and name (from `synthdefinitions.json`)
   - Current preset ID
   - A dropdown/selector populated from `data/macrosoundpresets/` (filtered to presets valid for that track)
   - For rompler tracks (those with `ro` in their machines list): show a **kit** dropdown (populated from `sample_rom.jsn` kit names), a **bank group** dropdown (KICK, SNARE, etc.) and a **slice** selector (0–31)
3. **Global kit selector** — a top-level dropdown that sets the `sampleKit` value (which PSRAM kit to load at boot). Changing this shows a warning that it affects all rompler tracks.
4. **Saves** the updated JSON back to `/sdcard/data/trackdefaults.json`

**Rompler WebUI notes:**
- Read available kits via `GET /api/v1/sampleRom/descriptor` (or parse `/tbdsamples/sample_rom.jsn` directly) to populate the kit dropdown
- The kit names (e.g. "Default", "A4 Dub") should be displayed instead of raw indices
- Per-track `romBank` lets the user pick which bank group (KICK, SNARE, etc.) the rompler uses
- Per-track `sampleSlice` lets the user pick which slice a rompler starts on after boot
- Warn users that switching the global kit at boot reloads PSRAM and takes a few seconds

#### `trackdefaults.json` format

```json
{
  "sampleKit": 0,
  "tracks": [
    { "index": 0,  "preset": "db-all-def" },
    { "index": 1,  "preset": "fmb-all-def" },
    { "index": 6,  "preset": "ro-all-def", "sampleKit": 0, "romBank": 0, "sampleSlice": 0 },
    { "index": 7,  "preset": "ro-all-def", "sampleKit": 0, "romBank": 2, "sampleSlice": 5 },
    ...
  ]
}
```

**Top-level fields:**

- `sampleKit` — the active kit index (0-based) to load into PSRAM at boot. All rompler tracks share this kit. Corresponds to the `smp_banks` array in `/tbdsamples/sample_rom.jsn`. Kit = the PSRAM-loaded sample collection (e.g. "Default", "A4 Dub").

**Per-track fields:**

- `index` — track number (0–18)
- `preset` — preset ID (filename without `.json` from `data/macrosoundpresets/`)
- `sampleKit` — *(rompler tracks only)* echoes the top-level kit index (informational). The top-level `sampleKit` determines what's actually loaded.
- `romBank` — *(rompler tracks only)* bank group index within the kit (0–31). Each bank group (e.g. KICK, SNARE, STAB) contains up to 32 slices. Maps to the rompler's param index 0.
- `sampleSlice` — *(rompler tracks only)* preferred starting slice index within the bank (0–31). Maps to the rompler's "Slice" parameter.
- Optional `_name` and `_comment` fields are ignored by the firmware (for human readability)
- Omit a track entry to let the Pico auto-select the first available preset

#### Rompler sample architecture

All rompler instances share a single sample buffer in PSRAM (~28 MiB). Only **one kit** can be active at a time — switching kits via `SetActiveSampleRomBank` (SPI `0x18`) reloads the entire PSRAM content from SD card.

The rompler plugin selects sounds via two parameters:
- **Bank group** (0–31): selects a group of 32 slices within the loaded PSRAM kit data (e.g. KICK, SNARE, STAB). In the JSON this is `romBank`. Maps to rompler param index 0.
- **Slice** (0–31): selects an individual sample within that bank group. In the JSON this is `sampleSlice`. Maps to rompler param index 1.

Banks on SD card are defined in `/tbdsamples/sample_rom.jsn`:
```json
{
  "smp_banks": ["def_smp.jsn", "a4_dub.jsn"],
  "smp_bank_names": ["Default", "A4 Dub"],
  "active_smp_bank": 0
}
```

Each `.jsn` bank file lists the individual sample slices (WAV files) that get loaded into PSRAM.

The `synthdefinitions.json` has a `defaultbank` field per track (e.g. `"percussion"`, `"chords"`, `"stabs"`) that is reserved for future per-track bank hinting but is not yet wired into the firmware.

### 3. Track definition reference

The 19 tracks are defined in `sdcard_image/data/synthdefinitions.json`:

| Index | Name     | Type  | MIDI Ch | Available Machines |
|-------|----------|-------|---------|-------------------|
|  0    | Kick     | drum  | 9       | nodrum, db, ab, ro, extdrum |
|  1    | Kick2    | drum  | 9       | nodrum, fmb, ro, extdrum |
|  2    | Snare    | drum  | 9       | nodrum, ds, as, ro, extdrum |
|  3    | Hat      | drum  | 10      | nodrum, hh1, hh2, ro, extdrum |
|  4    | Rimshot  | drum  | 10      | nodrum, rs, ro, extdrum |
|  5    | Clap     | drum  | 10      | nodrum, cl, ro, extdrum |
|  6    | Rompler  | drum  | 11      | nodrum, ro, extdrum |
|  7    | Rompler  | drum  | 11      | nodrum, ro, extdrum |
|  8    | Bass     | synth | 0       | nosynth, td3, ro, extsynth |
|  9    | Bass2    | synth | 1       | nosynth, td3, ro, extsynth |
| 10    | Lead     | synth | 2       | nosynth, mo, ro, extsynth |
| 11    | Lead2    | synth | 3       | nosynth, wtosc, mo, ro, extsynth |
| 12    | Rompler  | synth | 4       | nosynth, ro, extsynth |
| 13    | Rompler  | synth | 5       | nosynth, ro, extsynth |
| 14    | Chordo   | synth | 6       | nosynth, pp, ro, extsynth |
| 15    | Input    | synth | 7       | nosynth, inp |
| 16    | FX1      | fx    | 12      | nofx, fxdelay |
| 17    | FX2      | fx    | 12      | nofx, fxreverb |
| 18    | Master   | fx    | 12      | nofx, fxmaster |

### 4. Available preset IDs (current)

These are the filenames in `data/macrosoundpresets/` (without `.json`):

```
ab-all-def          fmb-all-def         msp-acidbass2       msp-morphpad1
as-all-def          fxdelay-all-def     msp-darkchord1      msp-morphpad2
cl-all-def          fxmaster-all-def    msp-darkchord2      msp-phatpunch1
db-all-def          fxreverb-all-def    msp-deepfm1         msp-phatpunch2
ds-all-def          golem               msp-deepfm2         msp-submorph1
ds-snap1            hh1-all-def         msp-kick1           new-kick
extdrum-all-def     hh2-all-def         msp-lushpad1        nodrum-all-def
extsynth-all-def    inp-all-def         msp-lushpad2        nofx-all-def
                    mo-all-def          msp-metallic1       nosynth-all-def
                    msp-acidbass1                           pp-all-def
                                                            punch-testing
                                                            ro-all-def
                                                            rs-all-def
                                                            td3-all-def
                                                            wo-all-def
                                                            wtosc-all-def
```

**Important:** Not every preset is valid for every track. The P4 cross-references each preset's `macroDeviceId` against the track's `machines[]` list in `synthdefinitions.json`. The WebUI should use `GetMacroSoundPresetList` (SPI `0xA0`) per track to get the filtered list, or replicate the same filtering logic.

### 5. Optional: Live reload without reboot

Currently `trackdefaults.json` is only read at boot. If you want a "apply now" button in the WebUI that also pushes the preset change to the Pico immediately (without rebooting), there are two options:

**Option A — WebUI calls existing SPI commands directly:**
The P4 can call `LoadTrackMacroAndPreset(trackIndex, presetId)` internally for each track when the user clicks "Apply" in the WebUI. This changes the running preset on the DSP side. The Pico will pick it up on next preset list query.

**Option B — New SPI command to trigger re-init:**
Add a new SPI command (e.g. `0xA6 ReloadTrackDefaults`) that causes the Pico to re-run `initializeMacroPresets()`. The P4 would need to forward this via SPI, or the Pico could poll periodically.

Option A is simpler and doesn't require Pico firmware changes.

---

## Future: Pico Hardware UI Extensions

### Current state of the SequencerUI

The OLED/button UI already has:

- **SoundPresetScreen** (`lib/sequencerui/screens/soundpreset.cpp`) — browse and apply sound presets per track via the `host->requestApplySoundPreset()` interface
- **TrackPresetScreen** (`lib/sequencerui/screens/trackpreset.cpp`) — browse and apply track presets (pattern + sound combined)
- **IHostInterface** (`lib/sequencerui/host.hpp`) — abstraction layer with `requestApplySoundPreset(trackIndex, presetId)`

### How runtime override works

When a user selects a preset on the OLED:

```cpp
// In SoundPresetScreen::input(), on selection confirm:
this->sequi->host->requestApplySoundPreset(activeTrackIndex, presetId);
```

This posts a `BACKGROUNDUPDATE_TYPE_APPLYSOUNDPRESET` event to the same queue that the boot-time init uses. The handler in `main.cpp` then calls:
1. `spi_api.LoadTrackSoundPreset(trackIndex, presetId)` — tells P4 to switch
2. `spi_api.GetMacroSoundPreset(presetId, resp)` — gets preset metadata
3. `spi_api.GetMacroDefinition(macroId, resp)` — gets parameter definitions
4. Updates the UI state (param pages, preset name display, etc.)

**This means the boot defaults from `trackdefaults.json` are always overridable at runtime.** The boot config is just the power-on state.

### Planned UI extensions

#### Machine Selector Screen (new)

A future screen to change the active **machine** (not just preset) per track:

```
┌─────────────────────────────────┐
│  SELECT MACHINE — Track 0 Kick  │
│ ────────────────────────────────│
│  > Synth Kick (db)          [*] │
│    Analog Kick (ab)             │
│    Rompler (ro)                 │
│    External MIDI (extdrum)      │
│    None (nodrum)                │
└─────────────────────────────────┘
```

Implementation steps:
1. Create `screens/machinesel.cpp` / `.hpp`
2. On enter: call `host->requestMachineList(trackIndex)` (new method, uses existing `GetMacroSoundPresetList` or a new SPI command to get available machines)
3. On select: call `host->requestActivateTrackMachine(trackIndex, machineId)` (maps to existing SPI `0xA3 ActivateTrackMachine`)
4. After machine change: refresh the sound preset list for that track (the available presets depend on the active machine)

#### Save Current Setup as New Default

Allow the user to save the current track setup back to `trackdefaults.json`:

1. Add a "Save as Boot Default" option in the system menu
2. Gather current preset IDs from all tracks
3. Send to P4 via a new SPI command (e.g. `0xA6 SaveTrackDefaultPresets`) that writes `trackdefaults.json`

This keeps the single-source-of-truth on the P4 SD card while letting the Pico UI modify it.

### Existing SPI commands available for UI features

| ID | Command | Direction | Use case |
|----|---------|-----------|----------|
| `0xA0` | `GetMacroSoundPresetList` | P4→Pico | List presets valid for a track |
| `0xA1` | `GetMacroSoundPreset` | P4→Pico | Get full preset details (for param display) |
| `0xA2` | `GetMacroDefinition` | P4→Pico | Get macro device param definitions |
| `0xA3` | `ActivateTrackMachine` | Pico→P4 | Switch a track's active machine |
| `0xA4` | `LoadTrackSoundPreset` | Pico→P4 | Load a specific preset on a track |
| `0xA5` | `GetTrackDefaultPresets` | P4→Pico | Read boot defaults (new) |

All infrastructure for runtime machine/preset switching is already in place. Future OLED UI screens just need to call into `IHostInterface` methods that map to these SPI commands.

---

## Testing Checklist

- [ ] Flash P4 with updated firmware (branch `feature/webui-merge-planning`)
- [ ] Ensure `trackdefaults.json` is on the P4 SD card at `/data/trackdefaults.json`
- [ ] Flash Pico with updated firmware (branch `feature/deterministic-track-machines`)
- [ ] Boot: verify serial debug output shows presets loaded from `trackdefaults.json`
- [ ] Modify `trackdefaults.json` on the SD card, reboot, verify different presets load
- [ ] Delete `trackdefaults.json`, reboot, verify fallback to first available preset per track
- [ ] Use OLED UI Sound Preset screen to change a preset at runtime — verify it overrides the boot default
- [ ] Set `sampleKit` to a non-zero value, reboot, verify correct kit loads in PSRAM
- [ ] Set per-track `sampleSlice` for rompler tracks, reboot, verify correct slice is selected
- [ ] WebUI: build editor page, save changes, reboot, verify new defaults take effect
- [ ] WebUI: verify bank dropdown shows names from `sample_rom.jsn`

---

## Change History

### 2025-01-xx — Buffer Overflow Fix (Pico)

**Problem:** Device entered infinite boot loop. Serial debug showed rapid spamming of preset-load messages.

**Root Cause:** `backgroundupdateevent_t.shortstring[16]` was too small for preset IDs like `"fxreverb-all-def"` (16 chars + null terminator = 17 bytes). `strcpy()` overwrote adjacent memory, corrupting the event struct and causing repeated event re-processing.

**Fix (4 files in `tbd-pico-seq3`):**
- `lib/sequencerui/host.hpp` — Expanded `shortstring[16]` → `shortstring[32]`
- `examples/main.cpp` — Replaced all `strcpy` → `strncpy` with explicit bounds (`sizeof(evt.shortstring) - 1`) + null terminator
- `src/PicoHost.cpp` — Same `strcpy` → `strncpy` replacement (2 call sites)
- `src/SpiAPI.cpp` — Added `WaitSpiAPIReadyForCmd()` after `LoadTrackSoundPreset` to prevent SPI command overlap

### 2025-01-xx — Rompler Sample Bank/Slice Support

**Goal:** Allow trackdefaults to specify which sample ROM bank loads at boot and which slice each rompler track uses.

**Architecture Note:** Kits are *global* — one 28 MiB PSRAM kit is loaded at a time, shared by all rompler instances. Per-track kit selection is not possible; the top-level `sampleKit` field controls which kit is active. Within a kit, each rompler track can select a different *bank group* (KICK, SNARE, etc.) and *slice*.

**Pico Firmware Changes (`tbd-pico-seq3`):**
- `lib/sequencerui/host.hpp` — Added `BACKGROUNDUPDATE_TYPE_SETSAMPLEROMBANK = 7` enum value
- `examples/main.cpp` — `initializeMacroPresets()`: Parse `sampleKit` from JSON, queue `SETSAMPLEROMBANK` event (zero-initialized struct, uses `param1` only — no string buffer risk) *before* any track preset events; parse per-track `romBank` and `sampleSlice` overrides, pack into event `param2`
- `examples/main.cpp` — `loop_tickandupdateleds()`: New handler for `SETSAMPLEROMBANK` — calls `spi_api.SetActiveSampleRomBank(bankIndex)` then `sleep_ms(500)` to allow PSRAM reload

**P4 / WebUI Changes (`ctag-tbd_hacking`):**
- `sdcard_image/data/trackdefaults.json` — Added top-level `"sampleKit": 0` and per-rompler-track `"sampleKit"` + `"romBank"` + `"sampleSlice"` fields (tracks 6, 7, 12, 13)
- `sdcard_image/www/js/track-defaults.js` — Added global kit dropdown (fetches kit names + bank metadata from `/api/v2/samples`), per-track Bank + Slice columns for rompler tracks, updated `collectFromUI()` to persist kit/bank/slice
- `sdcard_image/www/css/app.css` — Added `.td-row` 7-column grid for Bank + Slice columns, `.td-sample-bank-section`, `.td-col-bank`, `.td-col-slice`, `.td-na`, `.td-hint` styles with dark theme overrides

**Safety Verification:**
- New `SETSAMPLEROMBANK` event only uses integer `param1` — never touches `shortstring` → no buffer overflow possible
- `bankEvt` struct is zero-initialized (`= {}`) to prevent stale data
- All string copies in `main.cpp` (8 sites) and `PicoHost.cpp` (2 sites) confirmed as bounded `strncpy`
