# TBD-16 Sample Manager — Implementation Documentation v4

```
Version  : 4.0
Date     : 2025-02-26
Status   : WebUI + Firmware API fully implemented, deployed, tested on device
License  : LGPL 3.0 (dadamachines additions)
Copyright: (c) 2014-2026 Johannes Elias Lohbihler for dadamachines
Previous : docs/sample-manager-implementation-v3.md (superseded)
```

---

## Table of Contents

1.  [Overview](#1-overview)
2.  [File Inventory](#2-file-inventory)
3.  [Architecture](#3-architecture)
4.  [Networking & Connectivity](#4-networking--connectivity)
5.  [REST API Contract](#5-rest-api-contract)
6.  [Firmware Implementation — SampleAPI](#6-firmware-implementation--sampleapi)
7.  [WebUI — samples.html](#7-webui--sampleshtml)
8.  [WebUI — sample-manager.js](#8-webui--sample-managerjs)
9.  [Shoelace Bundle](#9-shoelace-bundle)
10. [Folder Management System](#10-folder-management-system)
11. [Kit Safety Mechanism](#11-kit-safety-mechanism)
12. [Kit Management — Delete Kit](#12-kit-management--delete-kit)
13. [Selection & Multi-Delete](#13-selection--multi-delete)
14. [Transfer Bar](#14-transfer-bar)
15. [Development Server](#15-development-server)
16. [Build & Deploy Workflow](#16-build--deploy-workflow)
17. [Caching Strategy](#17-caching-strategy)
18. [Key Design Decisions & Constraints](#18-key-design-decisions--constraints)
19. [Troubleshooting](#19-troubleshooting)
20. [Changelog](#20-changelog)
21. [Licensing](#21-licensing)

---

## 1. Overview

The TBD-16 Sample Manager is a browser-based tool for managing WAV samples,
kits, and bank assignments on the dadamachines TBD-16 (ESP32-P4 RISC-V platform).

### Design Goals

- **Elektron Transfer / Ableton Move–inspired UX** — minimal, dark, professional
- **Pool browser** (left panel) + **Kit editor** with 8 banks × 32 slots (right panel)
- **Drag-and-drop** from pool into bank slots, reorder within banks via Sortable.js
- **Client-side audio conversion** (MP3/AIFF/FLAC/OGG → 44.1 kHz 16-bit mono WAV)
- **Audio preview** — stream WAV from device for playback in browser
- **PSRAM capacity bar** — real-time used vs. available memory display
- **SD card storage bar** — total/free disk space displayed in header (GB + %)
- **Folder management** — create, rename, delete folders with kit safety guards
- **Kit management** — create, switch, save, delete kits; rename/delete individual entries
- **Selection mode** — multi-select files for batch delete (user folders only)
- **Transfer bar** — collapsible upload area with progress tracking and log
- **Zero build step** — vanilla JS + Shoelace Web Components served from SD card

### Stack

| Layer | Technology |
|-------|-----------|
| WebUI | Shoelace 2.20.1 (bundled, 52 KB gzipped), vanilla JS, Sortable.js |
| Firmware API | ESP-IDF v5.5.1 `httpd`, C++17, rapidjson, SPIRAM for POST bodies |
| Transport | USB NCM virtual Ethernet (192.168.4.1 ↔ 192.168.4.2) |
| Dev Server | Node.js zero-dependency mock server (tools/dev-server.js) |
| Storage | SD card (FAT32), PSRAM for sample streaming |

---

## 2. File Inventory

### WebUI Files (served from SD card `/www/`)

| File | Lines | Gzipped | Purpose |
|------|------:|--------:|---------|
| `samples.html` | 852 | 7.5 KB | Single-page HTML + all inline CSS |
| `js/sample-manager.js` | 2478 | 21.4 KB | Application logic (vanilla JS) |
| `js/Sortable.min.js` | — | 9 KB | Drag-and-drop library |
| `js/shoelace-bundle.js` | — | 52 KB | Shoelace 2.20.1 component bundle |
| `css/shoelace-dark-theme.css` | — | ~3 KB | Shoelace dark theme |
| `shoelace/assets/icons/*.svg` | 2052 | — | Bootstrap icon SVGs (fallback resolver) |

### Firmware Files

| File | Lines | Purpose |
|------|------:|---------|
| `main/SampleAPI.hpp` | ~30 | Header: handler registration prototype |
| `main/SampleAPI.cpp` | 951 | REST API: list, upload, manage, reload handlers |
| `main/RestServer.cpp` | ~400 | HTTP server setup, static file serving, gzip, query-string stripping |

### Tooling & Documentation

| File | Lines | Purpose |
|------|------:|---------|
| `tools/dev-server.js` | ~440 | Node.js mock API for local development |
| `docs/sample-manager-implementation-v4.md` | — | This document |
| `docs/sample-manager-implementation-v3.md` | 884 | Previous version (superseded) |
| `docs/sample-manager-implementation-v2.md` | — | Older version |
| `docs/sample-manager-implementation.md` | — | Original version |

---

## 3. Architecture

```
┌───────────────────────────────────────────────────────────────┐
│ BROWSER  (Chrome / Safari)                                    │
│                                                               │
│  samples.html ──▶ sample-manager.js ──▶ Shoelace Components  │
│       │                  │                                    │
│       │          ┌───────┴────────┐                           │
│       │          │  state {}      │  ◀── centralized state    │
│       │          │  - files[]     │                           │
│       │          │  - folders[]   │                           │
│       │          │  - kits{}      │                           │
│       │          │  - kitEntries[]│                           │
│       │          │  - banks[]     │                           │
│       │          │  - capacity{}  │                           │
│       │          └───────┬────────┘                           │
│       │                  │                                    │
│       │          fetch() / apiPost()                          │
└───────┼──────────────────┼────────────────────────────────────┘
        │   USB NCM        │
        │   192.168.4.2    │    192.168.4.1
┌───────┼──────────────────┼────────────────────────────────────┐
│ ESP32-P4                 │                                    │
│                          ▼                                    │
│  esp_httpd ──▶ 2 handlers:                                   │
│       GET  /api/v1/samples   → list / preview / switchKit     │
│       POST /api/v1/samples   → upload / manage / reload       │
│       GET  /*                → static files from /www/        │
│                          │                                    │
│            SampleAPI.cpp │                                    │
│                          ▼                                    │
│  ┌───────────────────────────────────┐                        │
│  │ SD Card (/sdcard/)                │                        │
│  │  /tbdsamples/                     │                        │
│  │    sample_rom.jsn  (kit registry) │                        │
│  │    def_smp.jsn     (Default kit)  │                        │
│  │    a4_dub.jsn      (A4 Dub kit)   │                        │
│  │    drums/          (factory)      │                        │
│  │    wavetables/     (factory)      │                        │
│  │    my-samples/     (user folder)  │                        │
│  │  /www/             (web files)    │                        │
│  │  /data/            (user prefs)   │                        │
│  └───────────────────────────────────┘                        │
└───────────────────────────────────────────────────────────────┘
```

---

## 4. Networking & Connectivity

### USB NCM (Network Control Model)

The TBD-16 creates a virtual Ethernet adapter over USB using TinyUSB's NCM driver.

| Property | Value |
|----------|-------|
| Device IP | `192.168.4.1` |
| Host IP | `192.168.4.2` |
| Subnet | `/24` (255.255.255.0) |
| DHCP | Device runs DHCP server, 60 s lease |
| Init delay | ~3 seconds after USB enumeration |
| USB Product | `TBD_BBA` |

### macOS Interface

- Appears as "RNDIS/Ethernet Gadget" in Network preferences
- Interface typically named `en7`, `en8` etc.
- Verify: `ifconfig | grep -A 5 192.168.4`
- MIDIServer may grab the USB device exclusively — monitor with `log stream`

### Common Issues

1. **Device not detected**: Check `ioreg -p IOUSB -l -w 0 | grep TBD_BBA`
2. **MIDIServer**: `sudo launchctl disable system/com.apple.midiserver`
3. **Interface up but no route**: Wait 3 seconds after enumeration
4. **"Failed to send buffer"**: Non-fatal TinyUSB init-window warning

---

## 5. REST API Contract

### Endpoints

Two wildcard handlers registered on `/api/v1/samples`:

| Method | Path | Dispatch |
|--------|------|----------|
| GET | `/api/v1/samples` | `handle_list()` — returns file listing, kits, capacity |
| GET | `/api/v1/samples?preview=PATH` | Streams WAV file for audio preview |
| GET | `/api/v1/samples?switchKit=N` | Switches active kit index, returns updated listing |
| POST | `/api/v1/samples?action=upload` | Binary WAV upload (headers: `X-Filename`, `X-Path`) |
| POST | `/api/v1/samples?action=manage` | JSON body with sub-actions (see below) |
| POST | `/api/v1/samples?action=reload` | Reloads sample_rom.jsn from SD card |

### Manage Sub-Actions

POST body: `{ "action": "<name>", ... }`

| Action | Parameters | Description |
|--------|-----------|-------------|
| `rename` | `oldPath`, `newPath` | Rename/move a WAV file |
| `delete` | `path` | Delete a single WAV file |
| `saveKit` | `index`, `entries[]` | Save kit slot assignments to .jsn |
| `createKit` | `name`, `tags[]` | Create new empty kit, returns updated registry |
| `deleteKit` | `index` | Delete kit file and remove from registry |
| `createFolder` | `path` | Create a new folder (recursive mkdir) |
| `renameFolder` | `oldPath`, `newPath` | Rename a folder |
| `deleteFolder` | `path` | Recursively delete a folder and all contents |

### List Response Schema

```json
{
  "files": [
    { "name": "kick.wav", "path": "drums", "size": 52480, "dur": 0.298, "smp": 13200, "date": "2025-02-20T14:30:00" }
  ],
  "folders": ["drums", "my-samples", "wavetables"],
  "kits": {
    "smp_banks": ["def_smp.jsn", "a4_dub.jsn"],
    "smp_bank_names": ["Default", "A4 Dub"],
    "smp_bank_tags": [["basic","stock"], ["analog 4","dub"]],
    "smp_bank_meta": [{}, {}],
    "active_smp_bank": 0
  },
  "capacity": { "usedBytes": 1048576, "maxBytes": 8388608 },
  "sdcard": { "totalBytes": 31457280000, "freeBytes": 28000000000 }
}
```

---

## 6. Firmware Implementation — SampleAPI

File: `main/SampleAPI.cpp` (951 lines)

### Key Constants

```c
static const char *SAMPLE_ROOT = "/sdcard/tbdsamples";
static const size_t PSRAM_MAX_BYTES = 8 * 1024 * 1024;  // 8 MB
static const size_t CHUNK_BUF_SIZE = 32 * 1024;          // 32 KB upload chunks
```

### Handler Dispatch

```
handle_list(req)
  ├── ?preview=PATH  →  stream WAV file (chunked, SPIRAM buffer)
  ├── ?switchKit=N   →  switch active kit, return updated list
  └── (default)      →  scan files, load kits, return JSON

handle_upload(req)
  └── ?action=upload  →  chunked binary receive to SD card

handle_manage(req)
  └── ?action=manage  →  parse JSON body, dispatch to sub-action:
       ├── rename
       ├── delete
       ├── saveKit
       ├── createKit
       ├── deleteKit       ← New in v4
       ├── createFolder
       ├── renameFolder
       └── deleteFolder    ← Fixed in v4

handle_reload(req)
  └── ?action=reload  →  re-read sample_rom.jsn
```

### deleteKit Handler (new in v4)

Deletes a kit by index: removes the `.jsn` file from SD card, removes the entry from
all `sample_rom.jsn` arrays (`smp_banks`, `smp_bank_names`, `smp_bank_tags`,
`smp_bank_meta`), adjusts `active_smp_bank` if needed, and writes the updated
registry back to disk. Returns the updated `sample_rom.jsn` for client-side state sync.

- **Validation**: Index must be ≥ 1 (cannot delete Default kit at index 0)
- **Atomicity**: Registry is written after all array mutations complete
- **Client sync**: Response includes full updated `kits` object

### deleteFolder Handler (fixed in v4)

**Previous (v3)**: Used an iterative stack-based approach with a re-push pattern
that caused infinite loops when processing directories with subdirectories.

**Current (v4)**: BFS-based collection followed by ordered deletion:

1. **BFS scan** — walk the directory tree breadth-first, collecting all file paths
   and directory paths separately.
2. **Delete files** — remove all files first (FAT32 requirement).
3. **Delete directories** — remove directories in reverse BFS order (deepest first),
   guaranteeing children are removed before parents.
4. **Verification** — `stat()` the original target after deletion; if still exists,
   return HTTP 500 error. This ensures the client sees failures.

```c
// BFS collection
std::vector<std::string> allFiles;
std::vector<std::string> allDirs;
std::vector<std::string> queue;
queue.push_back(dirPath);
size_t qi = 0;
while (qi < queue.size()) {
    std::string current = queue[qi++];
    allDirs.push_back(current);
    DIR *dir = opendir(current.c_str());
    // ... scan and classify children ...
    closedir(dir);
}
// Delete files, then dirs in reverse order
for (const auto &f : allFiles) remove(f.c_str());
for (auto it = allDirs.rbegin(); it != allDirs.rend(); ++it) rmdir(it->c_str());
// Verify target is gone
if (stat(dirPath.c_str(), &post_st) == 0) return send_error(req, 500, "Failed");
```

---

## 7. WebUI — samples.html

File: `sdcard_image/www/samples.html` (852 lines)

Single-page HTML with all CSS inlined. No external stylesheets beyond the Shoelace
dark theme.

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│ app-header: storage bar, capacity bar                       │
├──────────────────────────┬──────────────────────────────────┤
│ Pool (left panel, 40%)   │ Kit Editor (right panel, 60%)   │
│                          │                                  │
│ ┌──────────────────────┐ │ ┌──────────────────────────────┐ │
│ │ pool-controls-bar    │ │ │ kit-selector                 │ │
│ │ Upload / Select /    │ │ │ (dropdown + New/Delete Kit)  │ │
│ │ New Folder / Sort    │ │ │                              │ │
│ ├──────────────────────┤ │ ├──────────────────────────────┤ │
│ │ breadcrumb           │ │ │ bank-tabs (8 banks)          │ │
│ ├──────────────────────┤ │ ├──────────────────────────────┤ │
│ │ column headers       │ │ │ bank-slots (32 slots)        │ │
│ │ NAME | DURATION |    │ │ │  pill-style rows with        │ │
│ │ SIZE | ▸            │ │ │  border-radius + background  │ │
│ ├──────────────────────┤ │ │                              │ │
│ │ pool-content         │ │ │                              │ │
│ │  folder rows         │ │ │                              │ │
│ │  file rows           │ │ │                              │ │
│ └──────────────────────┘ │ └──────────────────────────────┘ │
├──────────────────────────┴──────────────────────────────────┤
│ Transfer Bar (collapsible): drop zone, progress, log        │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ transfer-bar-header: title, file count, status, toggle │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ transfer-bar-body: drop zone + table                   │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │ # | NAME | SIZE | STATUS                         │  │ │
│  │  │ (uploaded file log with progress)                │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### CSS Design System — Font Sizes

| Element | Size | Weight |
|---------|------|--------|
| Pool breadcrumb | 0.82rem | 500 |
| Pool controls buttons | 0.72rem | 600 (uppercase) |
| Column headers | 0.68rem | 700 (uppercase) |
| File/folder row text | 0.78rem | 400 |
| Kit selector label | 0.78rem | 400 |
| Bank tab text | 0.72rem | — |
| Bank slot text | 0.78rem | 400 |
| Transfer bar title | 0.72rem | 700 |
| Transfer bar actions | 0.72rem | 600 (uppercase, neutral-600) |
| Transfer bar status | 0.72rem | — (tabular-nums) |
| Transfer table headers | 0.68rem | 600 |

### Column Layout

| Column | Class | Width | Notes |
|--------|-------|-------|-------|
| Name | `.col-name` | flex: 1 | `min-width: 0` for text truncation |
| Duration | `.col-dur` | 72px | `flex-shrink: 0` — prevents collapse |
| Size | `.col-smp` | 68px | `flex-shrink: 0` |
| Actions | `.col-actions` | 68px | `flex-shrink: 0` |

### Kit Editor Row Styling (v4 — restored v2 pill style)

```css
.bank-slot {
  padding: 0.25rem 0.4rem;
  border-radius: var(--sl-border-radius-medium);
  background: var(--sl-color-neutral-100);
  margin-bottom: 0.15rem;
}
.bank-slot-actions {
  width: 72px;          /* compact */
  font-size: 0.82rem;   /* compact icons */
}
```

The v3 version had used a flat row style with `border-bottom` and no background.
User feedback strongly preferred the original v2 pill/card style with rounded
corners and subtle background — restored in v4.

### Dependency Loading

```html
<link rel="stylesheet" href="css/shoelace-dark-theme.css?v=1">
<script src="js/shoelace-bundle.js?v=1"></script>
<script src="js/Sortable.min.js?v=2"></script>
<script src="js/sample-manager.js?v=9"></script>
```

Cache-bust version is now `v=9` for `sample-manager.js`.

### Dialogs (7 total)

| Dialog ID | Purpose |
|-----------|---------|
| `new-folder-dialog` | Create a new folder |
| `rename-folder-dialog` | Rename a folder |
| `delete-folder-dialog` | Delete a folder (with kit reference warning) |
| `rename-dialog` | Rename a file or edit display name |
| `delete-dialog` | Delete a single file (with kit reference warning) |
| `new-kit-dialog` | Create a new kit |
| `picker-dialog` | File browser for slot assignment |

---

## 8. WebUI — sample-manager.js

File: `sdcard_image/www/js/sample-manager.js` (2478 lines)

### State Object

```javascript
const state = {
  files: [],          // { name, path, size, dur, smp, date }
  folders: [],        // folder path strings
  kits: {},           // sample_rom.jsn structure
  kitEntries: [],     // current kit's 256 slot entries (8 banks × 32)
  banks: [],          // current kit's bank metadata
  activeBank: 0,      // selected bank tab (0–7)
  poolPath: '',       // current folder path in pool browser
  poolSort: { key: 'name', dir: 'asc' },
  capacity: {},       // { usedBytes, maxBytes }
  sdcard: {},         // { totalBytes, freeBytes }
  dirty: false,       // unsaved kit changes
  selectionMode: false,
  selectedFiles: new Set(),
  _renameFolderCtx: null,
  _deleteFolderCtx: null,
  _renameCtx: null,
  _deleteCtx: null,
};
```

### Function Reference (by category)

**Path Helpers:**
- `isUserWritable(path)` — true if path is `my-samples` or inside it
- `isUserWritableChild(path)` — true if path is a child of `my-samples` (not the folder itself)
- `isInUserFolder()` — true if currently browsing inside `my-samples`

**Utilities:**
- `formatBytes(n)` → `"1.2 MB"` / `formatDuration(secs)` → `"1.23s"`
- `formatDate(iso)` → `"Feb 20"` (empty for pre-2020 dates)
- `sanitizeFolderName(input)` → FAT32-safe folder name (7-step algorithm)
- `esc(str)` — HTML entity escaping

**API Layer:**
- `fetchSampleList()` — GET file listing + kits + capacity
- `uploadFileToDevice(file, path)` — POST binary upload with progress
- `renameFileOnDevice(old, new)` / `deleteFileOnDevice(path)`
- `saveKitToDevice(index, entries)` / `createKitOnDevice(name, tags)`
- `deleteKitOnDevice(index)` — POST deleteKit action
- `createFolderOnDevice(path)` / `renameFolderOnDevice(old, new)`
- `deleteFolderOnDevice(path)` — POST deleteFolder action
- `reloadSampleRom()` — POST reload action

**Rendering:**
- `renderPoolContent()` — pool folder/file list with breadcrumb
- `renderBankSlots()` — kit editor slots (pill-style rows, v2 restored)
- `renderFlatView()` — flat sample list in kit editor
- `renderBankTabs()` / `renderKitSelector()`
- `updateCapacityBar()` / `updateStorageBar()`
- `renderBreadcrumb()`

**Selection Mode:**
- `toggleSelectionMode()` — enter/exit multi-select; guarded for factory folders
- `deleteSelectedFiles()` — batch delete with confirmation dialog
- `updateSelectionToolbar()` — shows count badge and Delete Selected button

**Kit Management:**
- `handleNewKit()` — open create kit dialog
- `handleDeleteKit()` — open delete kit confirmation with slot count warning
- `handleKitSwitch(index)` — switch active kit with auto-save

**Drag & Drop:**
- Pool → bank slot assignment (adds sample to kit)
- Bank slot reordering via Sortable.js

**Kit Safety:**
- `findKitReferencesInFolder(path)` — scans kit for folder references
- `updateKitPathsAfterRename(oldPath, newPath)` — auto-update paths

**Dialogs:**
- `openDeleteFolderDialog()` / `setupDeleteFolderDialog()`
- `openRenameFolderDialog()` / `setupRenameFolderDialog()`
- `openDeleteDialog()` / `setupDeleteDialog()`
- `openRenameDialog()` / `setupRenameDialog()`
- `openRenameDisplayName()` — edit display name (sname) for kit entries

---

## 9. Shoelace Bundle

### Why Bundle?

The ESP32's HTTP server supports only 7 concurrent socket connections. Shoelace's
default autoloader would request 100+ individual component/chunk files, exceeding
the socket limit and causing failures.

### Bundle Details

| Property | Value |
|----------|-------|
| Version | 2.20.1 |
| Build tool | esbuild |
| Gzipped size | ~52 KB |
| Components | 15 (see below) |
| Icons (inline) | 18 icons as SVG data URIs |
| Icons (fallback) | 2052 SVGs in `shoelace/assets/icons/` |

### Bundled Components

`sl-button`, `sl-icon`, `sl-icon-button`, `sl-input`, `sl-dialog`,
`sl-dropdown`, `sl-menu`, `sl-menu-item`, `sl-badge`, `sl-tooltip`,
`sl-progress-bar`, `sl-split-panel`, `sl-tab-group`, `sl-tab`, `sl-tab-panel`

### Inline Icons (SVG data URIs in bundle)

`folder2-open`, `file-earmark-music`, `grip-vertical`, `x-lg`, `play-fill`,
`trash3`, `pencil`, `upload`, `plus-lg`, `chevron-right`, `dash`, `check2`,
`arrow-left`, `check2-square`, `square`, `arrow-bar-up`, `sun-fill`, `music-note-beamed`

Additional icons (e.g. `folder-plus`, `list-ul`, `grid-3x3`) are loaded from the
fallback SVG resolver at `/shoelace/assets/icons/{name}.svg`.

---

## 10. Folder Management System

### UI Components

- **New Folder** button in pool controls bar (visible always)
- **Rename** (pencil icon) on folder rows inside `my-samples`
- **Delete** (trash icon) on folder rows inside `my-samples`
- Only folders that are children of `my-samples` show edit/delete controls
  (checked via `isUserWritableChild()`)

### Firmware API

**createFolder** — `POST { action: "createFolder", path: "my-samples/NewFolder" }`
- Recursive `mkdir` creating intermediate directories

**renameFolder** — `POST { action: "renameFolder", oldPath: "...", newPath: "..." }`
- Validates source exists and target doesn't
- Returns 404/409 errors for bad state

**deleteFolder** — `POST { action: "deleteFolder", path: "my-samples/MyFolder" }`
- BFS collection + ordered deletion (files first, directories deepest-first)
- Post-deletion verification with HTTP 500 on failure
- See [§6 deleteFolder Handler](#deletefolder-handler-fixed-in-v4) for algorithm details

### `sanitizeFolderName()` Algorithm

1. Trim whitespace
2. Normalize Unicode (NFC)
3. Replace whitespace runs with single space
4. Remove FAT32-illegal characters (`\/:*?"<>|`)
5. Collapse repeated dots/dashes/underscores
6. Trim leading/trailing dots, dashes, underscores
7. Truncate to 32 characters

---

## 11. Kit Safety Mechanism

Folder and file operations that could break kit assignments trigger safety checks:

### Missing Sample Detection

After every data refresh (`fetchSampleList()`), `markMissingKitEntries()` runs:

1. Builds a `Set` of all available file keys (`"path/filename"`) from `state.files`
2. Iterates all `kitEntries[i]` → sets `e._missing = true` if file not in the set
3. Render functions add `bank-slot-missing` CSS class (red text + warning icon)

This provides immediate visual feedback when switching to a kit that references
deleted or moved samples.

### On File Delete

1. `findKitReferencesForFile(path, filename)` scans active kit entries
2. Delete dialog shows warning box listing affected bank slots: _"KICKS — Slot 3"_
3. User can still proceed — referenced slots will show as "missing" after delete

### On Folder Rename

1. `findKitReferencesInFolder()` scans active kit for references to the folder
2. Yellow warning banner shown if references found
3. After rename: `updateKitPathsAfterRename()` auto-updates all kit paths
4. Kit auto-saved to device
5. Pool path auto-updated if currently browsing renamed folder

### On Folder Delete

1. File count and kit reference count displayed in danger banner
2. After delete: affected kit entries set to `null`
3. Kit auto-saved if any entries were cleared
4. Navigation corrected if inside deleted folder

**Note:** Only the active kit is checked (by design — checking all kits would
require loading every `.jsn` file).

---

## 12. Kit Management — Delete Kit

### UI

- **Delete Kit** button in kit selector bar (disabled for Default kit at index 0)
- **Styling**: Same subtle `variant="default"` as all other buttons (not red/danger)
- Confirmation dialog shows kit name and non-empty slot count

### Flow

1. User clicks Delete Kit
2. Dialog shows: _"Delete kit 'A4 Dub'? This kit has N samples assigned."_
3. On confirm: `deleteKitOnDevice(index)` → POST `{ action: "deleteKit", index: N }`
4. Firmware deletes `.jsn` file, updates `sample_rom.jsn` arrays
5. Response returns updated registry → client syncs `state.kits`
6. Kit selector switches to Default (index 0)

### Validation

- Index 0 (Default kit) cannot be deleted — button is disabled
- The button uses `variant="default"` styling consistent with all other action buttons

---

## 13. Selection & Multi-Delete

### Selection Mode

- **Select** button in pool controls bar (positioned before New Folder)
- **Factory folder guard**: Attempting to enable Select in a factory folder shows
  toast warning: _"Select is only available in the my-samples folder"_
- `isInUserFolder()` check prevents activation outside `my-samples`

### Multi-Select Flow

1. Click Select → selection mode activates (toolbar appears)
2. Click file rows to toggle selection (checkbox icons: `square` / `check2-square`)
3. Selection toolbar shows count badge: _"3 selected"_
4. Click "Delete Selected" → confirmation dialog with count
5. Files deleted sequentially via API
6. Kit entries referencing deleted files are nullified and kit auto-saved

### Deactivation

- Click Select again to exit selection mode
- Selection cleared when navigating to different folder
- Auto-deactivated after successful batch delete

---

## 14. Transfer Bar

### Structure

Collapsible panel at the bottom of the page for file uploads.

### Header

| Element | Style |
|---------|-------|
| Title ("TRANSFER") | 0.72rem, weight 700 |
| File count badge | neutral variant |
| Actions (Clear, Collapse) | 0.72rem, uppercase, weight 600, neutral-600 |
| Status text | 0.72rem, tabular-nums |
| Border-bottom | 1px solid neutral-200 |

### Table Columns

| Column | Header |
|--------|--------|
| `#` | Row number |
| `NAME` | Filename (was "FILE" in v3) |
| `SIZE` | File size |
| `STATUS` | Upload progress/result |

### Upload Process

1. Drop files onto drop zone or click Upload button
2. Client-side audio conversion (MP3/AIFF/FLAC/OGG → 44.1 kHz 16-bit mono WAV)
3. Sequential upload via `POST ?action=upload` with `X-Filename` and `X-Path` headers
4. Transfer table shows real-time progress per file
5. After all uploads complete, sample list is refreshed

---

## 15. Development Server

File: `tools/dev-server.js` (~440 lines, Node.js, zero dependencies)

### Usage

```bash
cd /path/to/ctag-tbd_hacking
node tools/dev-server.js
# → http://localhost:3000/samples.html
```

### Mock API Capabilities

- Serves static files from `sdcard_image/www/`
- Reads sample data from `sample_rom/tbdsamples/`
- Mock implementations for all manage actions
- Upload receives and stores files locally
- Preview streams WAV files from sample_rom

### Firmware vs. Dev Server

| Feature | Firmware | Dev Server |
|---------|----------|------------|
| Gzip | Serves `.gz` files | Serves uncompressed |
| Query strings | Stripped by RestServer | Passed through |
| File deletion | Real SD card operations | Simulated |
| Capacity | Real PSRAM values | Hardcoded mock |
| SD card info | Real disk stats | Hardcoded mock |

---

## 16. Build & Deploy Workflow

### Build

```bash
source ~/esp/esp-idf/export.sh
cd /path/to/ctag-tbd_hacking
idf.py build
```

The build system:
1. Compiles firmware (C++17, ESP-IDF v5.5.1)
2. Runs `create_sd_archive.sh` to create `build/tbd-sd-card.zip`
3. Generates `build/tbd-sd-card-hash.txt` with content hash

### Flash Firmware

```bash
idf.py -p /dev/cu.usbmodem11301 flash
```

### Deploy Web Files to SD Card

The device's SD card is writable via USB Mass Storage when running from OTA slot 1:

```bash
# 1. Gzip web files
cd sdcard_image/www
gzip -9 -k -f samples.html
gzip -9 -k -f js/sample-manager.js

# 2. Switch to OTA slot 1 (mounts SD as USB MSC)
python ~/esp/esp-idf/components/app_update/otatool.py \
  -p /dev/cu.usbmodem11301 switch_ota_partition --slot 1

# 3. Wait for SD card to mount (typically /Volumes/NO NAME)
sleep 5

# 4. Copy gzipped files
cp samples.html.gz "/Volumes/NO NAME/www/samples.html.gz"
cp js/sample-manager.js.gz "/Volumes/NO NAME/www/js/sample-manager.js.gz"

# 5. Update hash files
HASH=$(cat build/tbd-sd-card-hash.txt)
echo -n "$HASH" > "/Volumes/NO NAME/.version"
echo -n "$HASH" > "/Volumes/NO NAME/tbd-sd-card-hash.txt"

# 6. Eject and switch back
diskutil eject "/Volumes/NO NAME"
python ~/esp/esp-idf/components/app_update/otatool.py \
  -p /dev/cu.usbmodem11301 switch_ota_partition --slot 0
```

### SD Card Auto-Update Caveat

On boot, the firmware compares `.version` (on SD card) with the embedded hash
(`tbd-sd-card-hash.txt` in the build). If they differ, it unpacks `tbd-sd-card.zip`
over the SD card contents — **overwriting manual web file deployments**.

Always update `.version` to match after manual SD card changes.

### OTA Partition Layout

| Slot | Name | Usage |
|------|------|-------|
| 0 | `ota_0` | Main firmware (normal boot) |
| 1 | `ota_1` | USB MSC mode (SD card as mass storage) |

---

## 17. Caching Strategy

### Problem

Each HTTP connection uses a socket. With 7 max sockets, large JS files must be
served efficiently. Repeated requests for the same file waste connections.

### Solution

- `Cache-Control: public, max-age=2592000, immutable` for all static files
- Query-string cache busting: `sample-manager.js?v=9`
- RestServer.cpp strips query strings before resolving file paths

### Current Cache-Bust Versions

| File | Version |
|------|---------|
| `shoelace-dark-theme.css` | `?v=1` |
| `shoelace-bundle.js` | `?v=1` |
| `Sortable.min.js` | `?v=2` |
| `sample-manager.js` | `?v=9` |

---

## 18. Key Design Decisions & Constraints

### ESP32-P4 Constraints

1. **7-socket HTTP limit** — forced Shoelace bundling and aggressive caching
2. **No RTC** — `formatDate()` returns empty for dates before 2020
3. **SPIRAM for uploads** — 32 KB chunked receive to avoid stack overflow
4. **FAT32 filesystem** — `sanitizeFolderName()` enforces safe characters
5. **BFS directory deletion** — iterative BFS replaces recursive approach to avoid stack overflow on deeply nested trees

### API Design

6. **2-handler architecture** — GET and POST wildcards with query-string dispatch, avoids handler registration limits
7. **Single GET for everything** — file list, kits, capacity, sd card info in one response, minimizing round trips

### UI/UX Design

8. **Inline CSS** — all styles in `samples.html`, no external stylesheet per-page
9. **Zero build step** — vanilla JS, no bundler/transpiler for application code
10. **Centralized state** — single `state{}` object, all rendering functions read from it
11. **Pill-style kit rows** — restored border-radius + background (v2 style) after user feedback preferred it over flat row style
12. **Consistent button styling** — all action buttons use `variant="default"` (subtle), only Upload uses `variant="primary"` (blue)
13. **Factory folder protection** — Selection mode restricted to `my-samples`; folder edit/delete icons only on user-writable children

---

## 19. Troubleshooting

### Device Not Showing Up

1. Check USB: `ioreg -p IOUSB -l -w 0 | grep TBD_BBA`
2. Check MIDIServer: `log stream --predicate "process == 'MIDIServer'"`
3. Disable if needed: `sudo launchctl disable system/com.apple.midiserver`
4. Check interface: `ifconfig | grep -A 5 192.168.4`
5. Monitor firmware: `idf.py -p /dev/cu.usbmodem11301 monitor`

### Web Page Not Loading

1. Test API: `curl http://192.168.4.1/api/v1/samples | head -c 200`
2. Check gzip: verify `.gz` files exist on SD card
3. Check hash: `.version` must match `tbd-sd-card-hash.txt` in build
4. Clear cache: hard refresh or incognito window

### API Errors

1. Verify endpoint: `/api/v1/samples` (not `/api/v1/sample`)
2. Check `sample_rom.jsn` is valid JSON
3. Upload timeout: increase `CHUNK_BUF_SIZE` if files are very large
4. Folder delete fails: check firmware logs for errno values

### Build Issues

1. Source ESP-IDF: `source ~/esp/esp-idf/export.sh`
2. Ensure `#include <vector>` in SampleAPI.cpp
3. Serial port in use: disconnect Chrome or other serial monitors

---

## 20. Changelog

### V4 Changes (Phases 19–22, Feb 2025)

#### Phase 19 — SD Card Data Cleanup

- Removed leftover factory sample folders: `drums/HiHat`, `drums/MFB`, `drums/user` (42 files)
- Removed loose `.wav` files from root: 2 files
- Removed `berlin_techno.jsn` kit file
- Cleaned `my-samples` folder: removed `MD1_Pack` subfolder
- Updated `sample_rom.jsn`: removed Berlin Techno kit entry
- Synced `.version` and `tbd-sd-card-hash.txt`

#### Phase 20 — Multi-Select & Delete Kit

**Multi-Select Delete:**
- Added `toggleSelectionMode()` with factory folder guard
- Checkbox-based selection UI: `square` → `check2-square` toggle
- Selection toolbar with count badge and "Delete Selected" button
- `deleteSelectedFiles()`: sequential API delete + kit entry cleanup
- `isUserWritableChild()` helper to distinguish `my-samples` from its children

**Delete Kit:**
- Added "Delete Kit" button in kit selector (disabled for Default kit index 0)
- New `deleteKitOnDevice(index)` API function
- Firmware `deleteKit` handler: removes `.jsn` file, updates `sample_rom.jsn`
- Confirmation dialog shows kit name and non-empty slot count
- After deletion: switches to Default kit, refreshes UI

**Transfer Bar Improvements:**
- Sticky `<thead>` headers in transfer log table
- Header text styling: 0.68rem, weight 600, uppercase, neutral-500

**my-samples Root Icon:**
- Fixed folder icon at root level: `my-samples` shows `folder2-open` instead of generic file icon

#### Phase 21 — Visual Refinements & UX Fixes

**Kit Editor Row Styling (restored v2):**
- Restored pill/card style: `border-radius: var(--sl-border-radius-medium)`
- Added `background: var(--sl-color-neutral-100)` and `margin-bottom: 0.15rem`
- Removed v3 flat-row border-bottom style
- Compact icons: `.bank-slot-actions` width 72px, icon font-size 0.82rem
- Slot icons use inline style matching v2: `font-size:0.75rem; color:neutral-400`

**Column Header Fix ("DURATIONSIZE"):**
- `.col-dur` width increased from 60px → 72px
- Added `flex-shrink: 0` to `.col-dur`, `.col-smp`, `.col-actions`
- Added `min-width: 0` to `.col-name` for proper text truncation
- `.sample-row-dur` width matched to 72px

**Button & Control Refinements:**
- Delete Kit button changed from `variant="danger"` (red) to `variant="default"` (subtle)
- Select button repositioned: now appears before New Folder
- Factory folder Select guard: toast warning when attempting Select outside `my-samples`

**Transfer Bar Styling:**
- Title font-size: 0.82rem → 0.72rem
- Actions: 0.72rem, uppercase, weight 600, color neutral-600
- Header border-bottom: 1px solid neutral-200
- Status: 0.72rem with `font-variant-numeric: tabular-nums`
- Table header: "FILE" → "NAME" for consistency with pool headers

**Cache Bust:**
- `sample-manager.js` version bumped: `?v=8` → `?v=9`

#### Phase 22 — Firmware Bug Fixes

**deleteFolder Algorithm Rewrite:**
- Replaced buggy iterative stack-based deletion that caused infinite loops
  for directories with subdirectories (parent was re-pushed to stack indefinitely)
- New BFS-based approach: breadth-first collection of all files and directories,
  delete files first, then delete directories in reverse BFS order (deepest first)
- Added post-deletion verification: `stat()` target, return HTTP 500 if still exists
- Proper error logging with `errno` for failed `rmdir` calls

**SD Card Data:**
- Removed MD1 Pack kit (deleted `md1_pack.jsn`, removed from `sample_rom.jsn`)
- Cleared all remaining files from `my-samples` folder
- Updated local codebase `sample_rom/tbdsamples/sample_rom.jsn` to match device

#### Phase 23 — Kit Safety, Hover UX, Visual Consistency

**Missing Sample Detection:**
- New `markMissingKitEntries()` function: builds a `Set<path/filename>` from
  `state.files`, cross-references each `kitEntries[i]` to set `e._missing = true`
  when the referenced WAV file no longer exists on the SD card
- Called automatically at end of `fetchSampleList()` on every data refresh
- `renderBankSlots()` and `renderFlatView()`: missing entries get
  `bank-slot-missing` CSS class with red text (`--sl-color-danger-500`)
  and `exclamation-triangle` warning icon (`bank-slot-missing-icon`)

**Delete File → Kit Reference Warning:**
- New `findKitReferencesForFile(path, filename)` helper: scans all `kitEntries`
  for matching file path, returns `{ bankIdx, slotIdx, entry }` array
- `openDeleteDialog()` now populates a warning box listing which bank slots
  reference the file being deleted (e.g. "KICKS — Slot 3")
- HTML: added `#delete-kit-refs` container with styled list, shown conditionally

**Hover-Only Action Icons:**
- New `.action-hover` CSS class: `opacity: 0; transition: opacity 0.15s`
- Parent `:hover .action-hover { opacity: 1 }` reveals icons on mouse hover
- `@media (hover: none)` override: always visible on touch devices
- Applied to: pool file rename/delete, folder rename/delete, bank slot edit/remove
- Bank header delete button: initial opacity `0.4` → `0` (fully hidden until hover)

**Font & Icon Consistency:**
- `.sample-row-icon` unified to `0.78rem` (was `0.85rem`) for pool and kit slots
- Bank slot icons now use `class="sample-row-icon"` instead of inline styles
- `.sample-row-actions sl-icon-button` font-size: `0.88rem` → `0.82rem`
- `.bank-slot-dur` width: `72px` → `68px`
- `.bank-slot-actions` width: `72px` → `80px` (match pool row actions)

**SIZE Header Alignment Fix:**
- `.col-header` padding: `0.3rem 0.85rem` → `0.3rem 0.55rem`
  (matches `.sample-row` padding `0.32rem 0.55rem` for column alignment)

**Transfer Button Sizing:**
- `.transfer-bar-actions button` increased: `0.72rem/0.15rem` → `0.78rem/0.25rem`
- Border-radius changed from `3px` to `var(--sl-border-radius-medium)`
- Text color: `neutral-600` → `neutral-700`; added `line-height: 1.4`

**Cache Bust:**
- `sample-manager.js` version bumped: `?v=9` → `?v=10`

#### Phase 24 — Cross-Kit Safety, Missing Sample Replace, UX Polish

**Cross-Kit File Reference Check (Firmware + WebUI):**
- New firmware `checkFileRefs` action in `SampleAPI.cpp`: POST handler accepting
  `{action: "checkFileRefs", path, filename}`. Loads `sample_rom.jsn`, iterates
  ALL kit `.jsn` files (via `smp_banks[]`), scans each kit's entry array for
  matching `{path, filename}`, returns `{refs: [{kitIndex, kitName, slotIndex}, ...]}`
- `openDeleteDialog()` is now `async`: calls firmware `checkFileRefs` endpoint to
  discover references across ALL kits (not just the active one). Falls back to local
  `findKitReferencesForFile()` on network error
- Dialog header changed from "Used in current Kit:" to "Used in Kit(s):" showing
  kit name, bank number, and slot number for each reference
- Prevents accidental deletion of files used by non-active kits

**Replace Missing Sample via Drag-Drop:**
- Kit panel drag handlers now detect drops on `.bank-slot` elements (replaces
  existing slot entry) vs `.bank-body[data-drop="bank"]` (adds new entry)
- Replacement directly sets `state.kitEntries[absIdx]` with new
  `{filename, path, nsamples, sname}`, calls `markMissingKitEntries()` + `markDirty()`
- New `.bank-slot.drop-target-slot` CSS: solid primary-500 outline with 12%
  primary-600 background for visual drop-target feedback
- `renderBankSlots()` and `renderFlatView()`: missing slots show disabled preview
  button (`opacity: 0.3`), tooltip "Missing sample — drag a file from the pool
  to replace", and updated warning icon title

**Bank Delete Confirmation (Always):**
- Removed empty-bank shortcut that skipped the confirmation dialog
- `deleteBank()` now ALWAYS calls `openDeleteBankDialog()` regardless of slot count
- Dialog message differentiates: `Delete Bank "NAME"?` (empty) vs
  `Delete Bank "NAME"? It contains N sample(s).` (non-empty)

**Transfer Bar Bottom Spacing:**
- Added `padding-bottom: env(safe-area-inset-bottom, 0px)` to `.transfer-bar`
  for mobile browser safe areas
- Collapsed max-height increased: 30px → 36px
- Header min-height: 30px → 34px, padding: 0.3rem → 0.35rem

**Selection Toolbar Height & Button Consistency:**
- New `.selection-toolbar` CSS class: `min-height: 34px`, `padding: 0.3rem 0.55rem`
  matching `.col-header` dimensions exactly
- `.sel-label`: 0.72rem, weight 700, uppercase, neutral-500 (matches col-header span)
- `.sel-btn` / `.sel-btn-danger`: 0.72rem, weight 600, uppercase padding
  `0.25rem 0.65rem` matching `.transfer-bar-actions button` styling
- Replaced all inline styles in `updateSelectionToolbar()` with CSS classes
- HTML element uses `class="selection-toolbar"` instead of inline-styled div

**Build Fix:**
- Resolved rapidjson `GenericValue` constructor ambiguity: changed `uint32_t`
  loop variables to `unsigned` with explicit `(unsigned)` casts in `checkFileRefs`

**Cache Bust:**
- `sample-manager.js` version bumped: `?v=10` → `?v=11`

---

## 21. Licensing

All Sample Manager files carry the following header:

```
(c) 2014-2026 Johannes Elias Lohbihler for dadamachines.

Licensed under the GNU Lesser General Public License (LGPL 3.0).
https://www.gnu.org/licenses/lgpl-3.0.txt

Part of the dadamachines additions to the CTAG TBD platform.
See LICENSE in the repository root for full terms.
```

Files covered:
- `sdcard_image/www/samples.html`
- `sdcard_image/www/js/sample-manager.js`
- `main/SampleAPI.hpp`
- `main/SampleAPI.cpp`
- `tools/dev-server.js`
