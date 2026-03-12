# Sample Manager & Kit Editor — Changes (2026-03-06)

## Summary

Five features added to the Sample Manager WebUI plus UX improvements to the Kit Editor panel.

## Features Implemented

### 1. Multi-Select Drag from Sample Pool to Kit Editor

- Clicking files in the pool now toggles selection (highlighted state)
- Dragging any selected file drags **all** selected files as a batch
- Multi-sample drops land in the target bank, filling consecutive empty slots
- Uses `application/x-tbd-samples` MIME type (JSON array) vs existing `application/x-tbd-sample` (single object)
- Bank body highlights on multi-drop dragover; individual slot highlights only for single drops

### 2. Folder Drag to Kit Editor

- Folder rows in the pool are now `draggable="true"` with `data-folder-path`
- Dragging a folder collects all WAV files under that path and drops them as a batch
- Same slot-filling logic as multi-select drag

### 3. Sample Count in Folder Rows

- `getPoolItems()` now builds `folderCountMap` alongside `folderSizeMap`
- Folder items carry a `fileCount` property
- `renderPoolContent()` renders "N samples" in the duration column for folder rows

### 4. Active PSRAM Kit Indicator

- `renderKitSelector()` now marks the active kit with a `●` dot in the dropdown
- A green badge `#psram-active-label` in the memory bar shows "PSRAM: KitName"
- Badge updates whenever the kit selector re-renders

### 5. Kit Export / Import with Auto-Mapping

- **Export**: Downloads a JSON backup with `{ _format, _version, kitName, kitIndex, exportDate, banks, entries }`
- **Import**: Opens a dialog showing auto-mapping analysis:
  - Matches imported sample paths to available pool files by filename
  - Shows matched / missing / remapped counts
  - Detailed table of per-sample mapping status
- "Apply Kit" replaces current kit's banks and entries, using remapped paths where originals are missing

## UX Changes

### Save Strategy (aligned with Track Defaults pattern)

- `saveKit()` writes JSON to SD card only — does NOT reload PSRAM
- Toast: "Kit saved to SD card. Reload PSRAM or reboot to apply." (5s)
- Separate **Reload PSRAM** button with audio-pause warning

### Button Layout Reorganization

- **Title bar** (top-right): ⟳ Reload PSRAM, ⬇ Export, ⬆ Import — icon-only `<sl-icon-button>`
- **Kit controls row**: Kit selector → Save → New → Delete (with labels)
- **Memory bar**: PSRAM: KitName badge + memory usage bar

### HTML Changes

- `#import-kit-dialog` added with body and Apply Kit / Cancel buttons
- Hidden `<input type="file" id="import-kit-input">` for JSON import

## Files Modified

- `sdcard_image/www/js/sample-manager.js` — All JS logic (~300 lines added)
- `sdcard_image/www/index.html` — Kit Editor panel structure, new dialog, CSS

## Deployment

Fresh SD Card Deploy (complete erase + reimage) performed via `SD-Card-Deploy.md` procedure.
Serial port: `/dev/cu.usbmodem1201`. Hash: `54940e69b9d88f8b7fd0927641f895b2`.
