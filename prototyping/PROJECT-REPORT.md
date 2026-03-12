# TBD-16 WebUI & Macro System Integration — Project Report

**Date:** March 5, 2026  
**Branch:** `feature/webui-merge-planning`  
**Repository:** [nevvkid/ctag-tbd_hacking](https://github.com/nevvkid/ctag-tbd_hacking)  
**Upstream:** [dadamachines/ctag-tbd](https://github.com/dadamachines/ctag-tbd)  
**Collaborator:** [possan/ctag-tbd](https://github.com/possan/ctag-tbd) (`macropresets` branch)

---

## 1. Project Overview

The CTAG TBD-16 is an ESP32-P4-based drum machine and synthesizer workstation designed by dadamachines. This project integrates two major development streams into a single working system:

1. **possan's `macropresets` branch** — A 16-track sequencer/drum rack firmware (`PicoSeqRack`) with SPI-based RP2350 co-processor communication, MIDI CC parameter control, macro definitions, sound presets, and a `MacroTranslator` engine that maps MIDI data to DSP parameters in real time.

2. **nevvkid's `feature/webui-general-ui-rework`** — A modern Shoelace-based single-page WebUI for plugin management, sample management, device configuration, and favorites, replacing the legacy jQuery/OnsenUI multi-page interface.

The goal was to bring both systems together: possan's macro/sequencer firmware running the audio engine, combined with a new WebUI that can manage presets, macros, and the full plugin system through the browser over USB-NCM networking.

---

## 2. What Was Merged

### 2.1 Branch Topology

```
dadamachines/ctag-tbd (upstream)
    └── nevvkid/ctag-tbd_hacking
            ├── feature/webui-general-ui-rework   (Shoelace UI, plugin manager)
            ├── feature/webui-persona-prototype    (merged possan + persona UI work)
            │       └── possan/macropresets         (PicoSeqRack firmware, merged in)
            └── feature/webui-merge-planning       (final integrated branch) ← WE ARE HERE
```

The merge combined **520 files changed** across firmware, WebUI, DSP components, SD card data, documentation, tests, and build system. The merge planning document (`MERGE-PLANNING.md`) tracked every decision across 11 categories.

### 2.2 Key Integration Decisions

| Area | Decision | Rationale |
|------|----------|-----------|
| `sdcard_image/www/` | Take Shoelace SPA from `webui-general-ui-rework` | Modern UI, proper architecture |
| `sdcard_image/www-prototype/` | Keep persona prototype alongside | Active development of Performer/Designer UX |
| Macro data (33 defs + 58 presets) | Keep from `macropresets` | Core of possan's system, not in target branch |
| `main/Macro*.cpp/.hpp` (12 files) | Keep all new firmware files | Macro system not in target |
| `main/RestServer.cpp` | Manual merge | B's base (socket exhaustion fix) + A's MacroAPI routes |
| `components/.../rack/` (20 DSP machines) | Keep all | New in possan's branch |
| `docs/` (159 files) | Restore from target | Full documentation site |
| `simulator/` | Take target's version | More complete WebServer/ui.html |
| `sdkconfig.defaults` | Use target's stable config | ESP-IDF 5.5.2, dual core, 300KB SP memory |

---

## 3. Critical Fixes Applied Post-Merge

The merge produced a crash loop on the device. Root cause analysis and fixes are documented in `CRASH-ANALYSIS.md`. Summary:

### 3.1 NULL cv/trig Pointers in audio_task (Critical)

**Problem:** possan's SPI protocol carries MIDI data only — no CV/trig. The `ProcessData` struct left `cv` and `trig` as `nullptr`. Any plugin that accesses `data.cv[]` or `data.trig[]` (e.g., TBD03) dereferences null and crashes.

**Fix:** Added dummy zero-filled buffers in `SPManager.cpp`:
```cpp
static float   dummy_cv[N_CVS]     = {};
static uint8_t dummy_trig[N_TRIGS] = {};
pd.cv   = dummy_cv;
pd.trig = dummy_trig;
```

PicoSeqRack itself uses `NOCV` macros (all cv/trig access commented out), so it wouldn't crash — but loading any other plugin would.

### 3.2 No Null Check on Plugin Factory Create (Critical)

**Problem:** If `spm-config.jsn` referenced a plugin ID not in the factory registry, `Create()` returned `nullptr` and the next line (`sp[chan]->LoadPreset()`) crashed.

**Fix:** Null check with early return and error logging in `SetSoundProcessorChannel()`.

### 3.3 Uninitialized MacroTranslator Pointer (Medium)

**Problem:** `soundProcessor` member not initialized in constructor. If `TranslateInput()` ran before setup, garbage pointer dereference.

**Fix:** Initialize to `nullptr` in constructor + null guard in `TranslateInput()`.

### 3.4 PicoSeqRack CC Map Memory (High)

**Problem:** PicoSeqRack's 378-entry CC→parameter hashmap consumed significant internal SRAM. With the stable branch's `sdkconfig.defaults`, internal free memory dropped to ~8.9KB — dangerously low.

**Fix:** Targeted PSRAM allocator for PicoSeqRack's CC map only (instead of global `SPIRAM_USE_MALLOC`), recovering internal SRAM to ~24.5KB with 3x more headroom.

---

## 4. The sdkconfig.defaults Story

This was a critical lesson. possan developed and tested with his own `sdkconfig.defaults.bba-possan` (now in the repo as `sdkconfig.defaults.bba-possan`). The differences were substantial:

| Setting | Stable Branch | possan's Config |
|---------|--------------|-----------------|
| ESP-IDF version | 5.5.2 | 5.4.2 |
| Core count | **Dual core** | **Unicore** |
| FreeRTOS tick rate | 100 Hz | 1000 Hz |
| ISR stack size | 1536 bytes | 4096 bytes |
| SP memory alloc | 300,000 bytes | 120,000 bytes |
| Assertions | Enabled | **Disabled** |
| Task WDT | Enabled | **Disabled** |

**Why possan's config was critical to have:**
- It was the *known working* configuration for PicoSeqRack
- Disabled assertions and task WDT prevented false-positive crashes during development
- The CAPS_ALLOC SPIRAM mode he used worked correctly where the stable branch's mode didn't
- Without this reference file, we wouldn't have known what settings PicoSeqRack required

**Final decision:** We use the stable branch's `sdkconfig.defaults` as base (ESP-IDF 5.5.2, dual core, more memory), but adopted possan's disabled assertions and task WDT settings, plus the targeted PSRAM allocator fix. The `sdkconfig.defaults.bba-possan` file is preserved in the repo as a reference.

---

## 5. API v1 → v2 Migration

The original v1 API had architectural problems — 17 of 20 available ESP-IDF HTTP handler slots used, all mutations via GET, channel numbers embedded in URL paths. The full migration is documented in `API-V1-TO-V2-MIGRATION.md`.

### v2 Architecture: 9 Handlers

```
/api/v2/plugins    GET/POST  → PluginAPI    (11 actions)
/api/v2/device     GET/POST  → DeviceAPI    (8 actions)
/api/v2/samples*   GET/POST  → SampleAPI    (file ops + queries)
/api/v2/macros     GET/POST  → MacroAPI     (5 actions)
/*                 GET       → Static files
```

Key improvements:
- Proper HTTP semantics (GET for reads, POST for mutations)
- Channel as query parameter (`?ch=0`) instead of URL suffix
- Unified `setParam` with `key`/`val` instead of three URL patterns
- Bulk `getAll` endpoints eliminate waterfall API calls on page load
- Macro API as a new domain (track state, def/preset CRUD, reload)

### New Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `main/PluginAPI.cpp/.hpp` | 343 | Plugin management (11 actions) |
| `main/DeviceAPI.cpp/.hpp` | 221 | Device config, reboot, favorites (8 actions) |
| `main/MacroAPI.cpp/.hpp` | 213 | Macro definitions, presets, tracks (5 actions) |

`RestServer.cpp` was rewritten to contain only server config, static file serving, and 9 URI handler registrations — all domain logic moved to dedicated API files.

---

## 6. WebUI: Preset & Macro Manager

A new page was built at `preset-macro-manager.html` — the Performer/Designer interface for the macro system:

### Architecture

- Single HTML page loading `macro-bundle.js` (concatenated from 6 source files)
- Shoelace web components for UI elements (knobs, tabs, dialogs)
- Three-panel layout: sidebar (preset/macro browser), center (knob controls), footer (track tabs)
- Real-time communication with firmware via `/api/v2/macros` endpoints

### Source Files → Bundle

```
js/Sortable.min.js     → macro-bundle.js (line 1-3)
js/shared.js           → macro-bundle.js (line 4-1025)
js/display-hints.js    → macro-bundle.js (line 1026-1497)
js/performer.js        → macro-bundle.js (line 1498-2498)
js/designer.js         → macro-bundle.js (line 2499-4158)
js/preset-macro-app.js → macro-bundle.js (line 4159-4405)
```

### Data Flow

```
synthdefinitions.json → tracks[]/machines[]
    ↓
/api/v2/macros?action=getall → macroDefs[] + soundPresets[]
    ↓
performer.js filters by machine → renders knobs + preset browser
    ↓
designer.js → macro definition editor (parameter mapping, groups)
```

### Fixes Applied

1. **Header navigation CSS** — `.header-nav` and `.nav-tab` classes were used in HTML but had no style definitions in `css/app.css`. Added complete rule set matching `index.html`'s inline nav styles.
2. **Cache busting** — Bumped version query strings (`app.css?v=9`, `macro-bundle.js?v=2`) to force browser refresh after SD card updates.

### Dev Server

A Node.js dev server (`tools/dev-server.js`) provides mock API responses for local development without the device. Serves on `localhost:3001` with the same API contract as the firmware.

---

## 7. Firmware Architecture (Post-Merge)

### Audio Pipeline

```
RP2350 (co-processor)
    ↓ SPI (MIDI bytes + tempo)
audio_task (core 1, highest priority)
    ↓
MacroTranslator.TranslateInput()
    ├── Parse MIDI bytes → note/CC events
    ├── Map CCs to track parameters
    ├── Call soundProcessor->setTrackMachine()
    ├── Call soundProcessor->handleMidiControlChange()
    └── Call soundProcessor->handleMidiNoteOn/Off()
    ↓
PicoSeqRack.Process()
    ├── 16 sub-engines (rack machines)
    ├── Channel mixer
    └── Output stereo audio
    ↓
Codec output
```

### PicoSeqRack (1,509 lines)

16-track sequencer/drum rack with dynamically swappable DSP sub-engines:
- **20 rack machines:** ABD, ASD, Clap, DBD, DSD, FMB, FxDelay, FxMaster, FxReverb, HH1, HH2, Input, MO, PolyPad, Rimshot, Rompler, Synth, TBD03, WTOsc, ChannelMixer
- **MIDI-only control** — no CV/trig, uses `NOCV` macros throughout
- **CC→parameter hashmap** (378 entries) — routes MIDI CCs to DSP parameters
- **Tempo sync** from SPI protocol

### Macro System Data

| Type | Count | Location |
|------|-------|----------|
| Machine definitions | 24 machines | `synthdefinitions.json` |
| Macro definitions | 33 files | `data/macrodefinitions/*.json` |
| Sound presets | 58 files | `data/macrosoundpresets/*.json` |
| Tracks | 16 (19 w/ FX) | Runtime state via MacroTranslator |

---

## 8. SD Card Deployment

Deployment follows the procedure in `SD-Card-Deploy.md`:

1. `build-webui.sh` — Concatenates JS sources → bundles, gzips all www/ assets
2. `create_sd_archive.sh` — Builds `tbd-sd-card.zip` (26.5 MB) + xxh128 hash
3. `otatool.py switch_ota_partition --name ota_1` — Switch to MSC mode (USB mass storage)
4. Erase SD card, extract archive
5. Copy hash files, eject, switch back to `ota_0`
6. Verify at `http://192.168.4.1/`

The ESP32-P4 httpd serves **only `.gz` files** from `/sdcard/www/`. The build script handles compression. All API endpoints serve JSON responses directly from firmware.

---

## 9. HTTP Stability & Thread Safety Fixes

After deployment, the device exhibited intermittent crashes when navigating the WebUI — particularly when opening the Sample Manager or switching between pages. Investigation revealed three root causes:

### 9.1 Thread-Unsafe JSON Serialization (Critical — Device Crash)

**Problem:** HTTP handlers on core 0 called `GetCStrJSONParamSpecs()` / `GetCStrJSONPresets()` etc., which internally write to a shared `StringBuffer json` member in `ctagDataModelBase`. Meanwhile, the audio task on core 1 can call methods on the same sound processor object. The 58KB PicoSeqRack params response takes ~500ms to serialize + transmit, creating a large race window where the audio task could overwrite the buffer mid-transmission → memory corruption → hard crash.

**Fix:** Added `GetSafeJSON*()` methods in `SPManager.cpp` that:
1. Take `processMutex` (same mutex the audio task uses with non-blocking `xSemaphoreTake(processMutex, 0)`)
2. Call the underlying `GetCStr*()` to serialize into the shared buffer
3. Copy the result to a SPIRAM-allocated buffer via `copyToSpiram()`
4. Release the mutex
5. Return the copy (caller frees after sending)

Six safe methods added: `GetSafeJSONActivePluginParams()`, `GetSafeJSONGetPresets()`, `GetSafeJSONAllPresetData()`, `GetSafeJSONConfiguration()`, `GetSafeJSONSoundProcessors()`, `GetSafeJSONSoundProcessorPresets()`.

All HTTP handlers in `PluginAPI.cpp` and `DeviceAPI.cpp` updated to use the safe variants + a `send_safe_json()` helper that sends and frees.

**Audio task impact:** The audio task uses a non-blocking mutex attempt (`xSemaphoreTake(processMutex, 0)`) — if the HTTP handler holds the mutex, the audio task mutes that buffer cycle and continues. Measured impact: ~668 lock errors (~485ms of silence) per single `getParams` request for PicoSeqRack. This only occurs during UI page loads, not during normal audio playback. The same mutex/mute pattern is already used by plugin switching, preset save/load, and config changes.

**Note:** `SpiAPI.cpp` also calls `GetCStrJSON*()` but runs within the audio task context on core 1, so the race condition doesn't apply — left unchanged.

### 9.2 HTTP Socket Exhaustion (High — Server Unresponsive)

**Problem:** API responses lacked `Connection: close` headers. Browsers kept 6+ idle sockets open out of the 7 max ESP-IDF httpd sockets. When all sockets were held, no new connections could be accepted.

**Fix:** Added `Connection: close` to the `set_api_headers()` function in all four API modules (`PluginAPI.cpp`, `DeviceAPI.cpp`, `SampleAPI.cpp`, `MacroAPI.cpp`). Static files already had this header in upstream.

### 9.3 HTTP 431 "Header fields too long" (Medium — Page Load Failure)

**Problem:** Default `max_req_hdr_len` of 512 bytes in `HTTPD_DEFAULT_CONFIG()` was too small for modern browser request headers (Chrome sends 600+ bytes with cookies/accept headers), causing HTTP 431 errors on `index.html`.

**Fix:** Increased `config.max_req_hdr_len` to 1024 in `RestServer.cpp`. This is the only config change from upstream `p4_main`.

### 9.4 RestServer.cpp Config — Upstream Alignment

All httpd config values match the upstream `p4_main` branch except `max_req_hdr_len`:

| Setting | Upstream `p4_main` | Ours | Notes |
|---|---|---|---|
| `recv_wait_timeout` | 10 | 10 | Matches |
| `send_wait_timeout` | 10 | 10 | Matches |
| `lru_purge_enable` | true | true | Matches |
| `max_uri_handlers` | 20 | 20 | Matches |
| `stack_size` | 8192 | 8192 | Matches |
| `task_priority` | IDLE+4 | IDLE+4 | Matches |
| `max_req_hdr_len` | 512 (default) | **1024** | Fix for HTTP 431 |

### 9.5 Audio Health Monitoring API

Added a new endpoint to measure the audio impact of HTTP operations:

```bash
# Check current counters + memory
curl http://192.168.4.1/api/v2/device?action=getAudioHealth

# Reset counters to zero
curl -X POST http://192.168.4.1/api/v2/device?action=resetAudioHealth
```

Response:
```json
{
  "audioLockErrors": 668,
  "slowProcessCount": 0,
  "freeInternal": 43132,
  "largestInternal": 31744,
  "freeSPIRAM": 2508896,
  "largestSPIRAM": 4194304
}
```

- `audioLockErrors` — number of audio buffer cycles where the mutex was held by HTTP, causing a muted buffer
- `slowProcessCount` — number of audio frames exceeding the CPU cycle budget (300,000 cycles)
- Memory stats from `heap_caps` for diagnosing resource pressure

During idle operation (no active HTTP requests), both counters remain at **0**.

### 9.6 Verification Results

**Before fix:** Single `getParams&ch=0` returned 58KB/200 OK, but all subsequent requests failed (HTTP 000, timeout). `ping` showed 100% packet loss — device crashed completely.

**After fix:** 10 consecutive rounds of `getParams ch0` (58KB) + `getParams ch1` + `samples manage` (53KB) — all returned HTTP 200, device stable, 0% packet loss.

---

## 10. Current System Status

Verified on device at `192.168.4.1` (USB-NCM):

| Component | Status |
|-----------|--------|
| Firmware (PicoSeqRack) | Running stable, no crashes |
| Internal SRAM | ~43KB free (healthy) |
| SPIRAM | 2.51MB free |
| Audio pipeline | Stable, 0 lock errors at idle |
| HTTP server | Stable — thread-safe JSON, Connection:close |
| Plugin manager (`index.html`) | Serving correctly (200 OK) |
| Macro manager (`preset-macro-manager.html`) | Serving correctly (200 OK) |
| Sample manager | Working reliably (was crashing before fix) |
| Macro API (`/api/v2/macros?action=getall`) | 16 tracks, 33 defs, 44 presets |
| Audio health API | Endpoint active at `/api/v2/device?action=getAudioHealth` |
| CSS/JS assets | All serving with correct cache busters |
| Header navigation | Fixed — nav tabs styled and functional |

---

## 11. Repository Structure (Key Paths)

```
main/
├── RestServer.cpp/.hpp          # HTTP server + 9 handler registrations
├── PluginAPI.cpp/.hpp           # Plugin CRUD (v2 API)
├── DeviceAPI.cpp/.hpp           # Device config/reboot/favorites (v2 API)
├── SampleAPI.cpp/.hpp           # Sample upload/manage (v2 API)
├── MacroAPI.cpp/.hpp            # Macro definitions/presets/tracks (v2 API)
├── MacroTranslator.cpp/.hpp     # MIDI CC → DSP parameter mapping
├── MacroDeviceDefinition*       # Macro definition data model
├── MacroSoundPreset*            # Sound preset data model
├── SynthDefinition*             # Machine parameter definitions
├── TrackDefinition*             # Track-level machine assignment
├── SPManager.cpp/.hpp           # Sound processor lifecycle + audio_task
├── SpiAPI.cpp/.hpp              # SPI protocol with RP2350
└── Control.cpp/.hpp             # Main control loop

components/ctagSoundProcessor/
├── ctagSoundProcessorPicoSeqRack.cpp/.hpp   # 16-track sequencer/drum rack
└── rack/                                     # 20 DSP sub-engines

sdcard_image/
├── data/
│   ├── synthdefinitions.json     # 24 machine definitions
│   ├── macrodefinitions/         # 33 macro definition files
│   ├── macrosoundpresets/        # 58 sound preset files
│   └── sp/                       # Plugin parameter files (.jsn)
└── www/
    ├── index.html                # Main plugin manager (Shoelace SPA)
    ├── preset-macro-manager.html # Macro/preset manager
    ├── css/app.css               # Shared styles
    ├── js/
    │   ├── app-bundle.js         # Plugin manager bundle
    │   ├── macro-bundle.js       # Macro manager bundle
    │   ├── shared.js             # Shared API helpers + data loading
    │   ├── plugin-manager.js     # Plugin CRUD UI
    │   ├── performer.js          # Performer view (knobs + presets)
    │   ├── designer.js           # Designer view (macro editor)
    │   └── ...
    └── tools/dev-server.js       # Local development mock server

prototyping/
├── MERGE-PLANNING.md            # Merge decisions + execution log
├── CRASH-ANALYSIS.md            # Post-merge crash investigation
├── API-V1-TO-V2-MIGRATION.md    # Full v1→v2 API migration guide
├── SD-Card-Deploy.md            # Deployment procedures
└── ...                          # Additional planning docs
```

---

## 12. Contributors

- **possan** — PicoSeqRack firmware, MacroTranslator, rack DSP machines, SPI protocol, macro system architecture, `sdkconfig.defaults.bba-possan`
- **nevvkid** — Shoelace WebUI rework, merge integration, persona prototype, API v2 migration, crash fixes, deployment tooling

---

## 13. What's Next

1. **Preset & Macro Manager testing** — Verify full round-trip: browse presets → load → tweak knobs → save, all through the WebUI on the device
2. **Reduce JSON serialization hold time** — The ~485ms mutex hold for PicoSeqRack's 58KB params is acceptable but could be improved by pre-caching serialized JSON or breaking it into smaller chunks
3. **Designer view** — Continue developing the macro definition editor for creating custom parameter mappings
4. **Sound preset creation** — Build workflow for creating and saving new sound presets from the WebUI
5. **Plugin switching** — Test loading plugins other than PicoSeqRack (TBD03, GDVerb, etc.) now that the cv/trig fix is in place
6. **Merge to target** — When stable, merge `feature/webui-merge-planning` → `feature/webui-general-ui-rework`

---

*Generated from branch `feature/webui-merge-planning` on `nevvkid/ctag-tbd_hacking`*
