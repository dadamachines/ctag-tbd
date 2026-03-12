# Firmware Crash Analysis: Post-Merge Stability Report

## Executive Summary

After merging `feature/webui-general-ui-rework` (nevvkid) and `macropresets` (possan), the device enters a crash loop when switching plugins. This document covers root causes, applied fixes, remaining risks, and recommendations for getting PicoSeqRack stable again.

**Bottom line:** The primary crash was caused by null `cv`/`trig` pointers in the audio task. PicoSeqRack itself is *not* affected (it doesn't use CV/trig at all), but any other plugin loaded on the device (e.g. TBD03) will crash without the fix. Secondary issues include config-based vs hardcoded plugin loading at startup and disabled mutex protection during macro operations.

---

## 1. Root Causes Identified

### 1.1 NULL cv/trig Pointers in audio_task (FIXED)

**Severity:** Critical — causes immediate crash  
**File:** `main/SPManager.cpp`, `audio_task()`

The macropresets SPI protocol carries MIDI data only — no CV/trig data. The original macro code set:
```cpp
SP::ProcessData pd;
pd.cv = nullptr;   // was not set — null by default
pd.trig = nullptr; // was not set — null by default
```

Any plugin that accesses `data.cv[cv_xxx]` or `data.trig[trig_xxx]` (e.g. TBD03, many standard synth plugins) will dereference a null pointer and crash.

**Fix applied:** Added dummy zero-filled cv/trig buffers:
```cpp
static float   dummy_cv[N_CVS]     = {};
static uint8_t dummy_trig[N_TRIGS] = {};
pd.cv   = dummy_cv;
pd.trig = dummy_trig;
```

**Note on PicoSeqRack:** PicoSeqRack uses `NOCV` macros — all cv/trig access lines are commented out (lines 97/99 of `ctagSoundProcessorPicoSeqRack.cpp`). It controls everything via MIDI CC (`handleMidiControlChange`). So PicoSeqRack itself would NOT crash from this bug, but loading any other plugin would.

### 1.2 No Null Check on Factory Create (FIXED)

**Severity:** Critical — crash on invalid plugin name  
**File:** `main/SPManager.cpp`, `SetSoundProcessorChannel()`

```cpp
sp[chan] = ctagSoundProcessorFactory::Create(id, aType);
// was immediately followed by:
sp[chan]->LoadPreset(...); // crashes if Create returned nullptr
```

If the config file references a plugin ID that doesn't exist in the factory registry, `Create()` returns `nullptr`, and the next line crashes.

**Fix applied:** Added null check with early return:
```cpp
sp[chan] = ctagSoundProcessorFactory::Create(id, aType);
if (sp[chan] == nullptr) {
    ESP_LOGE("SPManager", "Failed to create plugin %s — factory returned null!", id.c_str());
    xSemaphoreGive(processMutex);
    return;
}
```

### 1.3 Uninitialized MacroTranslator soundProcessor Pointer (FIXED)

**Severity:** Medium — potential garbage pointer dereference  
**File:** `main/MacroTranslator.cpp`, constructor

The `soundProcessor` member was not explicitly initialized. If `TranslateInput()` was called before `soundProcessor` was set (which happens if `SetSoundProcessorChannel` hasn't run yet), it could dereference a garbage pointer.

**Fix applied:** Initialized to `nullptr` in constructor + added null guard in `TranslateInput()`.

### 1.4 Config-Based vs Hardcoded Plugin Loading at Startup

**Severity:** High — determines initial crash behavior  
**File:** `main/SPManager.cpp`, `StartSoundProcessor()`

**Possan's original code** (from `macropresets` branch):
```cpp
// Do not load last processor at start up
SetSoundProcessorChannel(0, "Void");
SetSoundProcessorChannel(1, "Void");
SetSoundProcessorChannel(0, "PicoSeqRack");
```

**Our merged code:**
```cpp
// Load last active processors from config
SetSoundProcessorChannel(0, model->GetActiveProcessorID(0));
SetSoundProcessorChannel(1, model->GetActiveProcessorID(1));
```

This means:
- If `spm-config.jsn` on SD card has `"activeProcessors": ["TBD03", "Void"]` (from a previous session before the merge), the device boots and loads TBD03, which crashes because of issue 1.1
- Even with the cv/trig fix, loading a plugin by config could fail if the plugin ID in config doesn't exist in the factory

**Current state:** `spm-config.jsn` has been updated to `["PicoSeqRack", "Void"]`. The SD card archive has been rebuilt with this default.

**Recommendation:** Consider adding a fallback — if loading the configured plugin fails, fall back to "Void":
```cpp
string id0 = model->GetActiveProcessorID(0);
SetSoundProcessorChannel(0, id0);
if (sp[0] == nullptr) {
    ESP_LOGW("SPManager", "Fallback: loading Void for ch0");
    SetSoundProcessorChannel(0, "Void");
}
```

---

## 2. PicoSeqRack Compatibility Analysis

### 2.1 Plugin Architecture

PicoSeqRack (`ctagSoundProcessorPicoSeqRack.cpp`, 1509 lines) is a 16-track sequencer/drum rack with:
- **No CV/trig access** — Uses `NOCV` macros throughout. Lines 97/99 (`data.cv[cv_xxx]`, `data.trig[trig_xxx]`) are commented out.
- **MIDI-only control** — All parameter changes via `handleMidiControlChange()` with a CC→parameter hashmap (`pMapParCC`)
- **MIDI note triggers** — `handleMidiNoteOn/Off()` for drum voice triggering
- **Track machine switching** — `setTrackMachine()` dynamically swaps internal DSP sub-engines
- **Tempo sync** — Uses `data.sequencer_tempo` from SPI protocol

### 2.2 Data Flow: SPI → MacroTranslator → PicoSeqRack

The data flow is fully intact:

1. **RP2350 sends SPI request** containing MIDI bytes + tempo
2. **`audio_task()`** copies MIDI data into `pd.midi_bytes` and tempo into `pd.sequencer_tempo`
3. **`macroTranslator->TranslateInput(&pd)`** parses MIDI bytes, maps CCs to track parameters, calls:
   - `soundProcessor->setTrackMachine()` — to switch rack sub-engines
   - `soundProcessor->handleMidiControlChange()` — to set parameters
   - `soundProcessor->handleMidiNoteOn/Off()` — to trigger notes
4. **`sp[0]->Process(pd)`** — PicoSeqRack processes audio using MIDI-derived parameters

This chain is identical to possan's original code. **No compatibility issues found.**

### 2.3 MacroTranslator Operation

MacroTranslator (`main/MacroTranslator.cpp`, 474 lines) manages 16 tracks × 32 parameters:

- `_parseIncomingMidiMessages()` — Parses raw MIDI bytes from SPI into note and CC events
- `TranslateInput()` — Iterates tracks, checks `trackDirty` flags, applies pending machine switches and CC changes
- `SetTrackMacroDefinition()` — Loads macro device definition for a track
- `SetTrackParametersFromJSON()` — Sets track parameters from JSON (used by MacroAPI)

All methods have proper null guards after fixes. The translator's interaction with PicoSeqRack is purely through the virtual `ctagSoundProcessor` MIDI methods, which PicoSeqRack implements correctly.

---

## 3. MacroAPI v2 Compatibility

The MacroAPI was refactored from v1 (path-based REST endpoints) to v2 (action-based dispatch at `/api/v2/macros`). The underlying logic is unchanged:

| MacroAPI Action | SPManager Function Called | Status |
|---|---|---|
| GET (default) | `macroTranslator->GetTrackStateForAPI()` | ✅ Compatible |
| GET `?action=getall` | Reads JSON files from SD card + track state | ✅ Compatible |
| POST `reload` | `DisablePluginProcessing()` + `RefreshMacros()` + `EnablePluginProcessing()` | ⚠️ See §3.1 |
| POST `set_track_parameters` | `SetTrackParametersFromJSON()` | ✅ Compatible |
| POST `update_track` | `SetTrackParametersFromJSON()` | ✅ Compatible |

### 3.1 Mutex Concern: DisablePluginProcessing / EnablePluginProcessing

```cpp
void SoundProcessorManager::DisablePluginProcessing() {
    // xSemaphoreTake(processMutex, portMAX_DELAY);  // COMMENTED OUT
    ledBlink = 42;
}
void SoundProcessorManager::EnablePluginProcessing() {
    ledBlink = 5;
    // xSemaphoreGive(processMutex);  // COMMENTED OUT
}
```

The mutex is **commented out** in both functions. This means the `reload` action has no thread-safety against `audio_task`. However, **this is the same as possan's original code** — he also commented out the mutex. The `RefreshMacros()` function itself does take the mutex:
```cpp
void SoundProcessorManager::RefreshMacros() {
    xSemaphoreTake(processMutex, portMAX_DELAY);
    synthDefinitionModel->ReloadSynthDefinitions();
    macroDeviceDefinitionModel->ReloadMachineDefinitions();
    macroSoundDefinitionModel->ReloadSoundPresets(...);
    xSemaphoreGive(processMutex);
}
```

So macro data refresh is mutex-protected. The commented-out mutex in Disable/Enable was likely possan's workaround for a deadlock or performance issue. **Not a regression from the merge.**

### 3.2 Macro JSON Data Integrity

All macro data files on the SD card image have been validated:
- **33 macro device definitions** in `/sdcard/data/macrodefinitions/` — all valid JSON ✅
- **44 macro sound presets** in `/sdcard/data/macrosoundpresets/` — all valid JSON ✅

No data corruption issues.

---

## 4. sdkconfig Analysis

### 4.1 sdkconfig.defaults vs sdkconfig.defaults.bba-possan

| Setting | sdkconfig.defaults (ours / stable) | sdkconfig.defaults.bba-possan (possan) |
|---|---|---|
| **ESP-IDF version** | 5.5.2 | 5.4.2 |
| **FreeRTOS cores** | **DUAL CORE** (`NUMBER_OF_CORES=2`) | **UNICORE** (`FREERTOS_UNICORE=y`, `NUMBER_OF_CORES=1`) |
| **FreeRTOS tick rate** | 100 Hz | 1000 Hz |
| **ISR stack size** | 1536 bytes | 4096 bytes |
| **SP_FIXED_MEM_ALLOC_SZ** | 300,000 bytes | 120,000 bytes |
| **Platform config** | `ABLETON_LINK=y`, `SAMPLE_ROM=y`, `TASK_REST_SERVER=y` | `TBD_PLATFORM_BBA=y`, `WIFI_UI=y` |
| **LWIP** | IRAM optimization + CPU0 affinity | No IRAM opt, no affinity |
| **SPIRAM speed** | 200 MHz | 200 MHz |
| **Debug features** | Minimal | Trace facility, runtime stats |

### 4.2 Core Count Impact

This is the most significant difference. Possan developed and tested with **unicore** (everything on core 0). Our config uses **dual core**:

- `audio_task` → pinned to **core 1** (`xTaskCreatePinnedToCore(..., 1)`)
- `led_task` → pinned to **core 0**
- `debug_task` → pinned to **core 0**
- SPI ISR → **CPU affinity 1** (`ESP_INTR_CPU_AFFINITY_1`)
- REST server / Network → runs on **core 0** (default)

On **unicore**: All tasks run on core 0. The `xTaskCreatePinnedToCore(..., 1)` call with ESP-IDF unicore config maps core 1 → core 0 transparently. Everything is serialized on one core.

On **dual core**: Tasks are truly distributed. `audio_task` and SPI ISR run on core 1, HTTP/network on core 0. This means:
- audio_task and REST handlers run **truly concurrently** — mutex protection matters more
- SPI ISR is on the same core as audio_task (good — cache-friendly)
- Memory ordering / data races that were invisible on unicore could surface

**Risk assessment:** The processed mutex is used correctly in `SetSoundProcessorChannel`, `RefreshMacros`, etc. The primary concern is `DisablePluginProcessing/EnablePluginProcessing` with commented-out mutex (see §3.1), but this is the same as possan's code and only affects the `reload` macro API call.

**Verdict:** Dual core should work correctly for normal operation. The `processMutex` provides adequate protection for the concurrent paths that matter.

### 4.3 Tick Rate Impact

100 Hz vs 1000 Hz tick rate affects `vTaskDelay()` granularity:
- `vTaskDelay(pdMS_TO_TICKS(4000))` → 400 ticks (100Hz) vs 4000 ticks (1000Hz) — same 4s delay ✅
- `vTaskDelay(50 / portTICK_PERIOD_MS)` → 5 ticks (100Hz) vs 50 ticks (1000Hz) — same 50ms ✅

The SPI timeout uses `esp_timer_get_time()` (microsecond resolution), not ticks. **No impact.**

### 4.4 ISR Stack Size

1536 bytes (ours) vs 4096 bytes (possan). This is worth monitoring:
- The SPI slave ISR in `rp2350_spi_stream.cpp` handles DMA completion callbacks
- If the ISR stack overflows, behavior is undefined (silent corruption or crash)
- Possan's 4096 was likely overly conservative, but 1536 is the ESP-IDF minimum

**Recommendation:** If you see unexplained hangs/crashes during SPI transactions, consider increasing to 2048 or 4096.

### 4.5 sdkconfig.defaults Decision

**Use `sdkconfig.defaults` (ours / stable branch) — NOT `sdkconfig.defaults.bba-possan`.**

Reasoning:
1. `sdkconfig.defaults` is from the stable `feature/webui-general-ui-rework` branch, which is the base platform config for this hardware
2. It has ESP-IDF 5.5.2 (newer, more bug fixes)
3. More SP memory (300KB vs 120KB) — PicoSeqRack with 16 sub-engines needs this
4. Ableton Link and Sample ROM support
5. Dual core provides better responsiveness (audio on core 1, network on core 0)
6. possan's unicore config was likely a development convenience, not a hardware requirement

---

## 5. Audio Task Configuration

| Parameter | Value | Assessment |
|---|---|---|
| Stack size | 20,000 bytes | ✅ Adequate for PicoSeqRack |
| Priority | `configMAX_PRIORITIES - 1` (highest) | ✅ Correct — audio must not be preempted |
| Core affinity | Core 1 | ✅ Isolation from network/REST on core 0 |
| Buffer size | 32 samples (stereo = 64 floats) | ✅ Same as possan |
| CPU cycle limit | 300,000 cycles | ✅ Generous for 32-sample block at 360 MHz |
| SPI timeout | 200 ms | ✅ Same as possan |

The `audio_task` loop:
1. Prepares SPI response (Ableton Link data, USB MIDI, waveform, LED)
2. Receives SPI request (MIDI bytes, tempo)
3. Reads codec input
4. Takes mutex, calls `macroTranslator->TranslateInput()` then `sp[0]->Process()`
5. Writes codec output

This is identical to possan's macropresets audio_task. **No differences that would affect PicoSeqRack stability.**

---

## 6. Differences From Possan's Original SPManager.cpp

A line-by-line comparison of our merged `SPManager.cpp` against possan's `macropresets` branch reveals:

| Aspect | Possan's Original | Our Merged Version |
|---|---|---|
| Plugin loading at startup | **Hardcoded** `PicoSeqRack` | **Config-based** `model->GetActiveProcessorID()` |
| USB NCM wait before network | Not present | `tusb::WaitForNCMReady(5000)` added |
| cv/trig pointers | `nullptr` (no dummy buffers) | Dummy zero-filled buffers (fix applied) |
| Factory null check | Not present | Null check + early return (fix applied) |
| processMutex in audio_task | try-take with timeout | `xSemaphoreTake(processMutex, 0)` (non-blocking) |
| DisablePluginProcessing mutex | Commented out | Commented out (same) |
| Debug/stats logging | More verbose | Reduced |

**All functional differences are either fixes we applied or minor improvements.** The core audio pipeline, SPI protocol, macro system, and plugin management are identical.

---

## 7. Summary of Fixes Applied

| # | Fix | File | Status |
|---|---|---|---|
| 1 | Dummy cv/trig buffers in audio_task | `main/SPManager.cpp` | ✅ Applied |
| 2 | Null check on `ctagSoundProcessorFactory::Create()` | `main/SPManager.cpp` | ✅ Applied |
| 3 | Initialize `soundProcessor = nullptr` in constructor | `main/MacroTranslator.cpp` | ✅ Applied |
| 4 | Null guard in `TranslateInput()` | `main/MacroTranslator.cpp` | ✅ Applied |
| 5 | Default plugin changed to PicoSeqRack | `sdcard_image/data/spm-config.jsn` | ✅ Applied |
| 6 | Firmware rebuilt | Build output | ✅ Done |
| 7 | SD card archive regenerated | `tbd-sd-card.zip` | ✅ Done |

---

## 8. Remaining Risks & Recommendations

### High Priority

1. **Flash and verify** — Device hasn't been reflashed yet. The fixed firmware and updated SD card need to be deployed and tested.

2. **Add startup fallback** — If config-based loading is preferred over hardcoding, add a fallback to "Void" when plugin creation fails. This prevents crash loops from bad config state.

3. **Wipe SD card clean** — Before first boot, fully replace SD card contents with the rebuilt archive. Old `spm-config.jsn` with TBD03 as active plugin would re-trigger the crash.

### Medium Priority

4. **ISR stack size** — Monitor for SPI-related hangs. If seen, increase `CONFIG_FREERTOS_ISR_STACKSIZE` to 4096 in `sdkconfig.defaults`.

5. **Commented-out mutex in DisablePluginProcessing** — While this matches possan's design, it's a race condition under dual-core. The `reload` macro API call should ideally have mutex protection. If macro reload causes glitches or crashes, re-enable the mutex.

6. **Plugin switching via WebUI** — When the user switches from PicoSeqRack to another plugin via the v2 API, the new plugin must still get valid cv/trig pointers (done via dummy buffers) and control data. Test this path specifically.

### Low Priority

7. **Tick rate (100 Hz)** — If timing-sensitive operations (sequencer tempo, MIDI timing) seem slightly off, consider increasing `CONFIG_FREERTOS_HZ` to 1000 to match possan's original config.

8. **ESP-IDF version gap** — We use 5.5.2 while possan used 5.4.2. Watch for behavioral differences in FreeRTOS, SPI driver, or DMA subsystems.

---

## 9. Test Plan

### Phase 1: Boot Stability
1. Flash all 4 firmware images via esptool.py (use BOOT button for download mode)
2. Wipe SD card, extract `tbd-sd-card.zip`
3. Power on device
4. Verify via serial monitor: PicoSeqRack loads without crash
5. Confirm audio output (silence is OK if no MIDI input)

### Phase 2: Macro System
1. Connect to WebUI at `192.168.4.1`
2. Verify macro definitions load (GET `/api/v2/macros?action=getall`)
3. Set track parameters via POST
4. Verify track machine switching works
5. Test macro reload

### Phase 3: Plugin Switching
1. Switch from PicoSeqRack to Void — should not crash
2. Switch from Void to PicoSeqRack — should reload cleanly
3. Switch to a CV/trig-using plugin (e.g. TBD03) — verify dummy buffers prevent crash
4. Switch back to PicoSeqRack — verify macro system re-initializes

### Phase 4: Long-Running Stability
1. Leave PicoSeqRack running for 30+ minutes
2. Monitor `debug_task` output for memory leaks
3. Check `slowProcessCounter` for CPU overload
4. Verify SPI stream counters (tx-err, queue-err, parse-err)

---

## 10. RESOLVED: Internal Memory Exhaustion (std::bad_alloc abort)

### Discovery
After fixing crash causes 1-4, PicoSeqRack loaded but immediately `abort()` during `Init()` at the
`registerParamAndCC()` stage. The backtrace showed:

```
__wrap___cxa_allocate_exception → abort()
operator new() → std::bad_alloc
std::map::emplace() in registerParamAndCC()
RackRompler::Init()
ctagSoundProcessorPicoSeqRack::Init() line 743
```

### Root Cause
PicoSeqRack registers **378 MIDI CC callbacks** via `pMapParCC` (`std::map<uint16_t, vector<function<void(int)>>>`).
Each map node and function object is allocated via `operator new` → `malloc` → **internal SRAM only**.

With `CONFIG_SPIRAM_USE_CAPS_ALLOC=y` (the original config), `malloc()` can ONLY use internal SRAM.
SPIRAM is only accessible via explicit `heap_caps_malloc(..., MALLOC_CAP_SPIRAM)`.

By the time PicoSeqRack::Init runs, only **8,952 bytes** of internal SRAM remain (out of ~184KB total),
consumed by the macro system (33 definitions, 44 presets), REST server, USB NCM stack, FreeRTOS tasks, etc.
The 378 CC map entries need more internal memory than is available → `std::bad_alloc` → `abort()` (C++ exceptions disabled).

### Fix Applied
Changed `sdkconfig` and `sdkconfig.defaults`:
```
# CONFIG_SPIRAM_USE_CAPS_ALLOC is not set
CONFIG_SPIRAM_USE_MALLOC=y
CONFIG_SPIRAM_MALLOC_ALWAYSINTERNAL=4096
CONFIG_SPIRAM_MALLOC_RESERVE_INTERNAL=4096
```

With `SPIRAM_USE_MALLOC`, when `malloc()` can't allocate from internal SRAM, it transparently
falls back to SPIRAM. The 378 CC map nodes now allocate in SPIRAM. DMA-critical allocations
that use `heap_caps_malloc(..., MALLOC_CAP_DMA)` are unaffected.

### Verification
Boot log after fix:
```
Current Free Memory     19303           3918552   (before Init)
PicoSeqRack: DrumRack: number of CC's registered 378
Current Free Memory     2975            3873356   (after CC registration - internal dipped, SPIRAM used)
Audio task started, entering main loop.
Audio task CPU time 460-513 uS
Mem freesize internal 14499   (recovered after init temporaries freed)
counters: tx-err=0 queue-err=0 parse-err=0
```

No crashes. Stable audio processing. Memory stable across multiple debug_task cycles.
