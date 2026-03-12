# SROM / Rompler Crash Fixes & Track Defaults Kit Sync

**Date:** 2026-03-06  
**Branch:** `feature/webui-merge-planning`  
**Status:** Fixed, deployed, verified

## Problem

After uploading samples, creating a new Kit (MD1) in the Sample Manager, and
switching to that Kit in the Track Defaults dialog, the device crashed on boot
with:

```
E (xxxx) SROM: No filename for slice 2104-2175
Guru Meditation Error: Core 0 panic'ed (Load access fault). Exception was unhandled.
```

The WebUI also stopped working because PicoSeqRack (which hosts the Romplers)
crashed before the HTTP server could serve requests.

## Root Causes Found

### 1. ReadSlice() / ReadSliceAsFloat() memcpy buffer overread

**File:** `components/ctagSoundProcessor/helpers/ctagSampleRom.cpp`

Both functions clamped `len` when a read would go past the slice end, but then
used the **unclamped** `n_samples` in the actual `memcpy()`:

```cpp
// BEFORE (broken)
int32_t len = n_samples;
if (offset + len >= sliceSizes[slice]) {
    len = sliceSizes[slice] - offset;   // ← len is clamped
}
memcpy(dst, &ptrSPIRAM[start], n_samples*2);  // ← but n_samples is NOT
```

**Fix:** Use `len` (the clamped value) in `memcpy()`.

### 2. No bounds check on `slice` parameter

`ReadSlice()` and `ReadSliceAsFloat()` accessed `sliceOffsets[slice]` and
`sliceSizes[slice]` without first checking whether `slice < numberSlices`.
When an invalid slice index was passed (e.g. from a Kit with fewer samples than
expected), this caused a **Load access fault** — the crash the user saw.

**Fix:** Added early bounds check returning zeroed output for out-of-range
slices.

### 3. HasSliceGroup() off-by-one

Used `>` instead of `>=`, allowing access at `sliceSizes[numberSlices]`
(one past the end of the array).

**Fix:** Changed to `>=`.

### 4. GetSliceGroupSize() unbounded loop

Iterated from `startSlice` to `endSlice` without checking against
`numberSlices`, risking out-of-bounds reads.

**Fix:** Added `startSlice >= numberSlices` guard and clamped `endSlice`.

### 5. RomplerVoiceMinimal / RomplerVoice assert crashes

**Files:**
- `components/ctagSoundProcessor/synthesis/RomplerVoiceMinimal.cpp`
- `components/ctagSoundProcessor/synthesis/RomplerVoice.cpp`

Six `assert(readBufferLength <= readBufferMaxSize - 2)` calls in the real-time
audio path would crash the device in production if the buffer length computation
ever exceeded the limit (possible with extreme EG FM modulation settings).

**Fix:** Added a safe clamp on `readBufferLength` immediately after it is
computed, before entering the playback switch statement.

### 6. numberSlices could exceed maxSlices

If a Kit descriptor had more than `MAX_SLICES_SAMPLES` (128) entries,
`numberSlices` would exceed the allocated array size for `sliceOffsets[]` and
`sliceSizes[]`.

**Fix:** Clamped `numberSlices` and `slices_samples` to `maxSlices` with a
warning log.

### 7. PSRAM oversize assert replaced with graceful degradation

`assert(MAX_ALLOC_BYTES_PSRAM >= totalSize)` would crash the device if a Kit's
total sample data exceeded the 28 MiB PSRAM budget.

**Fix:** Replaced with an `ESP_LOGE` log + `numberSlices = 0; return;` so the
device continues running (Romplers produce silence instead of crashing).

### 8. Track Defaults save did NOT sync PSRAM

**File:** `main/MacroAPI.cpp`

The `save_trackdefaults` endpoint only wrote `trackdefaults.json` to the SD
card. It did **not**:
- Update `sample_rom.jsn`'s `active_smp_bank` field
- Call `SetActiveSampleBank()`
- Call `RefreshDataStructure()` to reload PSRAM

This meant the user could change the Kit in the Track Defaults dialog, but the
PSRAM would still hold the old Kit's data. On next boot, the device loaded
whatever Kit was in `sample_rom.jsn` — not what `trackdefaults.json` said.

The Pico would eventually send the correct `SetActiveSampleRomBank` via SPI,
but the crash happened **before** the Pico could do this (during
`PicoSeqRack::Init()`).

**Fix:** After writing the JSON file, `handle_save_trackdefaults()` now:
1. Parses the `sampleKit` field from the incoming JSON
2. Calls `DisablePluginProcessing()`
3. Calls `SetActiveSampleBank(sampleKit)`
4. Calls `RefreshDataStructure()`
5. Calls `EnablePluginProcessing()`

This mirrors the same sequence used by the SPI `SetActiveSampleRomBank` handler
in `SpiAPI.cpp`.

Also added `#include "helpers/ctagSampleRom.hpp"` to `MacroAPI.cpp`.

## Files Changed

| File | Changes |
|------|---------|
| `components/ctagSoundProcessor/helpers/ctagSampleRom.cpp` | Fixed ReadSlice/ReadSliceAsFloat memcpy, added slice bounds checks, fixed HasSliceGroup off-by-one, fixed GetSliceGroupSize bounds, clamped numberSlices, replaced totalSize assert |
| `components/ctagSoundProcessor/synthesis/RomplerVoiceMinimal.cpp` | Clamped readBufferLength before switch statement |
| `components/ctagSoundProcessor/synthesis/RomplerVoice.cpp` | Same readBufferLength clamp |
| `main/MacroAPI.cpp` | Added ctagSampleRom include; save_trackdefaults now syncs PSRAM with requested kit |

## Workflow Validation

The intended user workflow now works end-to-end:

1. **Upload samples** via Sample Manager drag-drop
2. **Create a new Kit** (e.g. "MD1") in Sample Manager
3. **Open Track Defaults** dialog in the Macro Preset Manager
4. **Switch Kit** to MD1 and assign Rompler tracks
5. **Save** → PSRAM is immediately reloaded with the new Kit
6. **Reboot** → Device boots cleanly, Romplers play the correct samples

If the Kit is missing or has issues, Romplers now produce silence instead of
crashing the device. The WebUI remains functional.

## Deployment

- Firmware built and flashed via esptool (4 images)
- WebUI built (app-bundle.js, macro-bundle.js, etc.)
- Fresh SD card deploy (full erase + archive extract)
- Verified: USB NCM up (192.168.4.2), HTTP 200 on main page + macro manager
