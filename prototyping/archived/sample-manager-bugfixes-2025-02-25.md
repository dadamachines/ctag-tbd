# Sample Manager — Bug Fixes & Findings (2025-02-25)

## Issues Fixed

### 1. Bank Addressing Bug — Samples Always Appear in Bank 01

**Root Cause:** `getKitForSave()` stripped all `null` entries from the kit array
before sending it to the firmware. This produced a dense (gapless) array. When
reloaded, entries started from index 0 which maps to Bank 01 (KICK), regardless
of which bank they were originally placed in.

**How bank addressing works:** The kit descriptor is a flat JSON array. Banks are
addressed by position: indices 0–31 = Bank 01, indices 32–63 = Bank 02, etc.
Empty slots must be `null` to preserve the positional mapping.

**Fix:** `getKitForSave()` now emits the full sparse array including `null`
placeholders. Trailing nulls are trimmed for storage efficiency. On the firmware
side, the capacity calculation now guards against null entries with
`v.IsObject()` before calling `HasMember()`.

**Files changed:**
- `sdcard_image/www/js/sample-manager.js` — `getKitForSave()` rewritten
- `main/SampleAPI.cpp` — added `v.IsObject()` guard in kit entry iteration

### 2. Save Button Incorrectly Triggered PSRAM Reload

**Root Cause:** `saveKit()` called `reloadPSRAM()` after saving the kit
descriptor to the SD card. The PSRAM reload (`RefreshSampleRom`) should be
managed by the RP2350 firmware/app, not from the WebUI.

**Fix:** Removed the `reloadPSRAM()` call from `saveKit()`. The save button now
only writes the kit descriptor JSON to the SD card. Toast message changed from
"Kit saved — reloading PSRAM…" to "Kit saved to SD card".

**File:** `sdcard_image/www/js/sample-manager.js` — `saveKit()`

### 3. Transfer Window Lost Track of Completed Transfers

**Root Cause:** `renderTransferBar()` filtered items to only show those
completed within the last 5 seconds (`Date.now() - q._doneAt < 5000`). After
5 seconds, completed transfers disappeared.

**Fix:** The transfer log now persists **all** items (queued, converting,
uploading, done, error) for the duration of the browser session. Items are shown
newest-first. A "Clear" button appears when all transfers are finished, letting
the user manually clear the log. The log resets on page close/refresh.

**Files changed:**
- `sdcard_image/www/js/sample-manager.js` — `renderTransferBar()` rewritten,
  added `clearTransferLog()`
- `sdcard_image/www/samples.html` — increased transfer bar max-height, added
  clear button CSS

### 4. MEMORY USED Bar Showed Only Percentage

**Root Cause:** `updateCapacityBar()` displayed only `X%` without showing actual
megabyte values.

**Fix:** Now displays `X.X MB / 28 MB` (used / total PSRAM capacity).

**File:** `sdcard_image/www/js/sample-manager.js` — `updateCapacityBar()`

### 5. Storage Display Used Hardcoded 32 GB Estimate

**Root Cause:** `updateStorageBar()` hardcoded `SD_CAPACITY = 32 * 1024 * ...`
because the firmware API didn't report real SD card size.

**Fix (firmware):** Added `esp_vfs_fat_info("/sdcard", &total, &free)` call to
the list handler. The API response now includes:
```json
"capacity": {
  "psram_max_bytes": 29360128,
  "active_bank_bytes": 12345,
  "sd_total_bytes": 31914983424,
  "sd_free_bytes": 31885000000
}
```

**Fix (JS):** `updateStorageBar()` reads `sd_total_bytes` and `sd_free_bytes`
from the API response. Displays real values like "29.7 GB Free / 29.7 GB".

**Files changed:**
- `main/SampleAPI.cpp` — added `#include "esp_vfs_fat.h"`, `esp_vfs_fat_info()`
  call in capacity section
- `main/CMakeLists.txt` — added `fatfs` to REQUIRES
- `sdcard_image/www/js/sample-manager.js` — `updateStorageBar()` rewritten

### 6. Missing PicoSeqRack Plugin Files

**Root Cause:** The PicoSeqRack plugin requires two preset files on the SD card
(`mp-PicoSeqRack.jsn` and `mui-PicoSeqRack.jsn`) in `/data/sp/`. These were
present in the reference zip at `docs/_static/sdcard_image/tbd-sd-card.zip` but
missing from the working `sdcard_image/data/sp/` directory.

**Fix:** Extracted both files from the reference zip into `sdcard_image/data/sp/`
and manually copied them to the device's SD card. They are now also included in
the build archive (`tbd-sd-card.zip`).

**Files restored:**
- `sdcard_image/data/sp/mp-PicoSeqRack.jsn` (17 KB — macro parameter presets)
- `sdcard_image/data/sp/mui-PicoSeqRack.jsn` (31 KB — UI parameter presets)

---

## Important Technical Notes

### Kit Descriptor Format

The kit descriptor (`def_smp.jsn`, etc.) is a **positionally-indexed** JSON
array. Bank assignment is purely based on array index:

| Array Indices | Bank  |
|--------------|-------|
| 0–31         | 01    |
| 32–63        | 02    |
| 64–95        | 03    |
| ...          | ...   |
| 224–255      | 08    |

Empty slots MUST be `null` (not omitted) to preserve bank positions. The
firmware safely skips null entries when computing capacity.

### SD Card Auto-Update Hazard

The firmware's `check_and_update_sd_content()` compares `.version` and
`tbd-sd-card-hash.txt` on every boot. If they differ, it **deletes** `/www/`,
`/data/`, and `/tbdsamples/` then re-extracts from `tbd-sd-card.zip`. Manual SD
card file changes will be destroyed if these hash files get out of sync.

**Critical rule:** Never change `.version` or `tbd-sd-card-hash.txt` when doing
manual file updates via USB MSC.

### USB Port May Change

After OTA partition switching, the USB serial port name often changes (e.g.,
`/dev/cu.usbmodem1101` → `/dev/cu.usbmodem101`). Always check with
`ls /dev/cu.usb*` before running `otatool.py` or `idf.py flash`.

### ESP-IDF fatfs Dependency

`esp_vfs_fat_info()` requires the `fatfs` component in `main/CMakeLists.txt`:
```cmake
REQUIRES ... fatfs
```

### Double-Precision for SD Card Size

SD card sizes exceed `uint32_t` range (max 4 GB). The API uses `double` in
JSON for `sd_total_bytes` / `sd_free_bytes` to handle cards up to 2 TB.
