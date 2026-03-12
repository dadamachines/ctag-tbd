# TBD-16 Sample Manager — Implementation Documentation v3

```
Version  : 3.0
Date     : 2025-02-26
Status   : WebUI + Firmware API fully implemented, deployed, tested on device
License  : LGPL 3.0 (dadamachines additions)
Copyright: (c) 2014-2026 Johannes Elias Lohbihler for dadamachines
Previous : docs/sample-manager-implementation-v2.md (superseded)
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
12. [Development Server](#12-development-server)
13. [Build & Deploy Workflow](#13-build--deploy-workflow)
14. [Caching Strategy](#14-caching-strategy)
15. [Key Design Decisions & Constraints](#15-key-design-decisions--constraints)
16. [Troubleshooting](#16-troubleshooting)
17. [Changelog](#17-changelog)
18. [Licensing](#18-licensing)

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
- **Kit management** — create, switch, save kits; rename/delete individual entries
- **Zero build step** — vanilla JS + Shoelace Web Components served from SD card

### Stack

| Layer | Technology |
|-------|-----------|
| WebUI | Shoelace 2.20.1 (bundled, 52 KB gzipped), vanilla JS, Sortable.js |
| Firmware API | ESP-IDF v5.5.1 `httpd`, C++17, rapidjson, SPIRAM for POST bodies |
| Networking | USB NCM (Network Control Model) — virtual Ethernet over USB |
| Dev Server | Node.js, zero dependencies, mock API on port 3000 |
| Build | ESP-IDF `idf.py build` + `create_sd_archive.sh` for gzipped web files |

---

## 2. File Inventory

### WebUI (served from SD card as `.gz` files)

| File | Lines | Size (gzipped) | Purpose |
|------|------:|---------------:|---------|
| `sdcard_image/www/samples.html` | 740 | ~6.4 KB | HTML + inline CSS — full page layout + 7 dialogs |
| `sdcard_image/www/js/sample-manager.js` | 2003 | ~17.5 KB | Client application logic |
| `sdcard_image/www/js/Sortable.min.js` | — | — | Sortable.js library (drag-and-drop) |
| `sdcard_image/www/js/shoelace-bundle.js` | 3215 | ~52 KB | Bundled Shoelace (15 components + Lit + 16 icons) |
| `sdcard_image/www/shoelace/themes/dark.css` | — | — | Shoelace dark theme stylesheet |
| `sdcard_image/www/shoelace/themes/light.css` | — | — | Shoelace light theme stylesheet |

### Firmware (ESP32-P4)

| File | Lines | Purpose |
|------|------:|---------|
| `main/SampleAPI.hpp` | 45 | Header — 2 public handler declarations |
| `main/SampleAPI.cpp` | 821 | Full REST API implementation (list, upload, manage, folder ops) |
| `main/RestServer.cpp` | 745 | HTTP server — URI registration, static file serving, query-string stripping |
| `components/network/network.cpp` | 456 | USB NCM + WiFi networking stack |

### Tooling & Documentation

| File | Lines | Purpose |
|------|------:|---------|
| `tools/dev-server.js` | 439 | Development server with mock API |
| `docs/sample-manager-implementation-v3.md` | — | This document |
| `docs/sample-manager-implementation-v2.md` | 816 | Previous doc (superseded) |
| `docs/sample-manager-implementation.md` | 639 | V1 doc — original 4-endpoint API scheme |
| `docs/sample-manager-bugfixes-2025-02-25.md` | — | Phase 15 bug fix notes |

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Browser                                                             │
│                                                                      │
│  samples.html ──► sample-manager.js ──► Shoelace Web Components      │
│       │                  │                      │                     │
│       │            Sortable.js           shoelace-bundle.js           │
│       │                  │             (15 components + Lit)          │
│       │                  ▼                                           │
│       │          ┌──────────────┐                                    │
│       │          │  state {}    │     Single source of truth         │
│       │          │  files[]     │     for all UI rendering           │
│       │          │  kitEntries[]│                                    │
│       │          │  kits{}      │                                    │
│       │          └──────────────┘                                    │
│       │                  │                                           │
│       ▼                  ▼                                           │
│  ┌─────────────────────────────────┐                                 │
│  │     fetch() / apiPost()         │                                 │
│  │     GET  /api/v1/samples        │                                 │
│  │     POST /api/v1/samples?action=│                                 │
│  └─────────────┬───────────────────┘                                 │
└────────────────┼─────────────────────────────────────────────────────┘
                 │ USB NCM (virtual Ethernet)
                 │ Host IP: 192.168.4.2
                 │ Device IP: 192.168.4.1
                 │
┌────────────────┼─────────────────────────────────────────────────────┐
│  ESP32-P4      │                                                     │
│                ▼                                                     │
│  ┌─────────────────────────┐                                        │
│  │  esp_httpd server       │ max 7 sockets (LWIP_MAX_SOCKETS=10)   │
│  │  URI: /api/v1/samples*  │ 2 handlers: GET + POST                │
│  │  URI: /*                │ static file handler (gzipped)          │
│  └────────┬────────────────┘                                        │
│           │                                                          │
│  ┌────────┴────────────────┐     ┌──────────────────────┐           │
│  │  SampleAPI.cpp          │     │  SD Card (/sdcard/)   │           │
│  │  - handle_list()        │◄───►│  /tbdsamples/         │           │
│  │  - handle_upload()      │     │    *.wav files         │           │
│  │  - handle_manage()      │     │    sample_rom.jsn      │           │
│  │  - handle_reload()      │     │    *.kit.jsn           │           │
│  └─────────────────────────┘     │  /www/ (gzipped)      │           │
│                                  │  /data/ (config)      │           │
│                                  └──────────────────────┘           │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 4. Networking & Connectivity

The TBD-16 uses **USB NCM (Network Control Model)** to provide networking over the
USB connection. This creates a virtual Ethernet interface on the host computer.

### How It Works

1. **Device side**: TinyUSB NCM driver creates a network interface with DHCP server
2. **Host side**: macOS/Linux/Windows sees a USB Ethernet adapter and gets an IP via DHCP
3. **IP Assignment**: Device is always `192.168.4.1`, host gets `192.168.4.2`

### Network Interface Details

| Property | Value |
|----------|-------|
| Interface type | USB NCM (CDC Network Control Model) |
| Device IP | `192.168.4.1` |
| Host IP | `192.168.4.2` (via DHCP) |
| Subnet | `255.255.255.0` |
| Gateway | `0.0.0.0` (no internet routing) |
| DHCP lease time | 60 seconds |
| NCM init delay | 3 seconds (waits for host driver) |
| USB product name | `TBD_BBA` |

### macOS Interface

On macOS, the USB NCM interface appears as `en6` (or similar). The device shows up
in System Preferences → Network as a USB Ethernet adapter.

### Common Issues

- **MIDIServer exclusivity**: macOS MIDIServer may grab exclusive ownership of the
  TBD USB device. A device reset (unplug/replug or DTR/RTS toggle) resolves this.
- **"Failed to send buffer to USB -1"**: Normal during first 10 seconds of boot while
  host initializes the NCM driver. Becomes an error only after the init window.
- **Device not showing up**: Check `ifconfig -a` for an interface with `192.168.4.x`.
  Try `ioreg -p IOUSB -l | grep TBD_BBA` to verify USB enumeration.

---

## 5. REST API Contract

Two URI handlers, consolidated per lead-dev guidance to stay within `max_uri_handlers = 20`.
Actions are dispatched via query strings.

### GET /api/v1/samples

**Default (list)** — returns all samples, kits, capacity:

```json
{
  "files": [
    { "name": "BD_808", "path": "drums/factory", "size": 15432, "mtime": 1740000000000 }
  ],
  "kits": {
    "smp_banks": ["drums/factory/kit_default.kit.jsn"],
    "smp_bank_names": ["Factory Kit"],
    "smp_bank_tags": ["factory"],
    "smp_bank_meta": [""],
    "active_smp_bank": 0
  },
  "active_kit_entries": [
    { "filename": "BD_808", "path": "drums/factory", "nsamples": 7694, "sname": "BD" },
    null
  ],
  "capacity": {
    "psram_max_bytes": 29360128,
    "active_bank_bytes": 15388,
    "sd_total_bytes": 15728640000,
    "sd_free_bytes": 14000000000
  }
}
```

**Preview** — `?preview=drums/factory/BD_808` → streams raw WAV as `audio/wav`

**Kit switch** — `?kit=2` → switches active kit before listing

### POST /api/v1/samples?action=upload

Binary WAV upload with query parameters:
- `?action=upload&path=drums/user&filename=mysample`
- Body: raw WAV binary
- Creates directory tree recursively if needed
- Returns: `{ "ok": true, "name": "mysample", "path": "drums/user", "size": 12345 }`

### POST /api/v1/samples?action=manage

JSON body with `action` field dispatching to:

| Action | Fields | Description |
|--------|--------|-------------|
| `rename` | `oldName`, `newName`, `path` | Rename a WAV file |
| `delete` | `filename`, `path` | Delete a WAV file |
| `saveKit` | `kitIndex`, `entries[]` | Save kit entries to `.kit.jsn` file |
| `createKit` | `name`, `entries[]` | Create new kit, register in `sample_rom.jsn` |
| `createFolder` | `path` | Create folder (recursive `mkdir`) |
| `renameFolder` | `oldPath`, `newPath` | Rename folder (validates source exists, target doesn't) |
| `deleteFolder` | `path` | Delete folder recursively (files first, then dirs, multi-pass) |

### POST /api/v1/samples?action=reload

Triggers PSRAM sample reload from SD card.

---

## 6. Firmware Implementation — SampleAPI

### File: `main/SampleAPI.cpp` (821 lines)

**Key constants:**
- `SAMPLE_ROOT` = `/sdcard/tbdsamples`
- `SAMPLE_ROM_FILE` = `/sdcard/tbdsamples/sample_rom.jsn`
- `PSRAM_MAX_BYTES` = 29,360,128 (≈28 MB)
- `CHUNK_BUF_SIZE` = 4096 (allocated from SPIRAM)

**Handler dispatch:**
- `samples_get_handler()` → `handle_list()` (list, preview, kit-switch via query params)
- `samples_post_handler()` → routes via `?action=` to `handle_upload()`, `handle_manage()`, `handle_reload()`

**`handle_list()` flow:**
1. Check for `?preview=` → stream WAV file directly
2. Load `sample_rom.jsn` into rapidjson Document
3. Check for `?kit=N` → switch active kit index
4. Scan WAV files recursively via `scan_wav_files()`
5. Build response with files, kits metadata, active kit entries, capacity (PSRAM + SD)
6. SD card storage queried via `esp_vfs_fat_info("/sdcard", &total, &free)`

**`handle_upload()` flow:**
1. Parse query params (`path`, `filename`)
2. Create target directory recursively
3. Stream request body in 4 KB chunks from SPIRAM buffer to SD card file
4. Return file info JSON

**`handle_manage()` actions:**
- `rename` / `delete` — simple `rename()` / `remove()` syscalls
- `saveKit` — write kit entries array to `.kit.jsn` file via rapidjson
- `createKit` — create new `.kit.jsn`, register in `sample_rom.jsn`
- `createFolder` — recursive `mkdir()` for full path
- `renameFolder` — validates old path is directory, target doesn't exist, calls `rename()`
- `deleteFolder` — iterative stack-based deletion: collects all paths, deletes files via `remove()`, then directories in reverse order with multi-pass (up to 10 passes for FAT32 safety)

### File: `main/SampleAPI.hpp` (45 lines)

Declares `SampleAPI` class with two static handler methods. Documents the
consolidated 2-endpoint API contract in the header comment.

---

## 7. WebUI — samples.html

### File: `sdcard_image/www/samples.html` (740 lines)

Single-page HTML with inline CSS. No build step required.

### Layout Structure

```
┌─ .app ──────────────────────────────────────────────────────────────┐
│ .app-header  │ TBD-16 │ status │ ──spacer── │ storage bar │ theme │ │
├──────────────┴────────────────────────────────────────────────────── │
│ .app-main                                                           │
│  ┌── sl-split-panel (40/60) ──────────────────────────────────────┐ │
│  │ .panel-left (Sample Pool)    │ .panel-right (Kit Editor)       │ │
│  │  ├─ .panel-title-bar         │  ├─ .panel-title-bar            │ │
│  │  │  Pool · breadcrumbs       │  │  Kit · selector · save btn   │ │
│  │  ├─ .pool-controls (sort/    │  ├─ .kit-memory-bar             │ │
│  │  │   search/new-folder)      │  │  PSRAM capacity              │ │
│  │  ├─ .drop-zone               │  ├─ .kit-content (scrollable)   │ │
│  │  │  (drag-to-upload)         │  │  8 banks × 32 slots          │ │
│  │  ├─ .col-header-bar          │  │  (drag-and-drop reorder)     │ │
│  │  │  (name/date/size/dur)     │  │                              │ │
│  │  └─ #pool-content            │  └─ #bank-container             │ │
│  │     (scrollable file list)   │                                 │ │
│  └──────────────────────────────┴─────────────────────────────────┘ │
│ .transfer-bar (collapsible — upload progress + transfer log)        │
└─────────────────────────────────────────────────────────────────────┘
```

### CSS Design System

Font sizes follow a consistent scale:
| Element | Size |
|---------|------|
| App title | 0.95rem |
| Panel titles | 0.82rem |
| Breadcrumbs | 0.82rem |
| Column headers | 0.72rem |
| Table rows (name) | 0.82rem |
| Table rows (date, size, dur) | 0.75rem |
| Bank card headers | 0.78rem |
| Bank entry text | 0.72rem |
| Transfer bar items | 0.78rem |
| Storage text | 0.78rem |

### Dependencies (loaded via `<script>` / `<link>`)

```html
<link rel="stylesheet" href="/shoelace/themes/dark.css?v=2">
<script type="module" src="/js/shoelace-bundle.js?v=2"></script>
<script defer src="js/Sortable.min.js?v=2"></script>
<script defer src="js/sample-manager.js?v=4"></script>
```

### Dialogs (7 total)

| Dialog ID | Purpose |
|-----------|---------|
| `#new-folder-dialog` | Create a new folder in the current pool directory |
| `#rename-folder-dialog` | Rename folder — includes kit reference warning |
| `#delete-folder-dialog` | Delete folder — includes destructive action warning |
| `#rename-dialog` | Rename a WAV file or kit entry display name |
| `#delete-dialog` | Delete a WAV file |
| `#new-kit-dialog` | Create new kit (optionally clone from active) |
| `#picker-dialog` | Sample picker for adding files to bank slots |

---

## 8. WebUI — sample-manager.js

### File: `sdcard_image/www/js/sample-manager.js` (2003 lines)

Vanilla JavaScript application with centralized state management.

### Application State

```javascript
const state = {
  files: [],            // [{ name, path, size, mtime }] from API
  folders: [],          // unique folder paths (computed from files)
  kits: {               // from sample_rom.jsn via API
    smp_banks: [],
    smp_bank_names: [],
    smp_bank_tags: [],
    smp_bank_meta: [],
    active_smp_bank: 0,
  },
  kitEntries: [],       // flat Kit descriptor array (may have nulls)
  banks: [...],         // 8 bank definitions with name, color, collapsed
  capacity: {},         // PSRAM + SD card capacity

  // Navigation
  poolPath: '',         // current folder path in sample pool
  sortKey: 'name',      // 'name' | 'date' | 'size' | 'duration'
  sortDir: 'asc',       // 'asc' | 'desc'
  poolSearch: '',       // search filter text
  viewMode: 'banked',  // 'banked' | 'flat'

  // UI State
  dirty: false,         // unsaved kit changes
  initializing: true,   // blocks event handlers during init

  // Dialog context (set before opening dialogs)
  _renameCtx: null,
  _deleteCtx: null,
  _renameFolderCtx: null,
  _deleteFolderCtx: null,
};
```

### Key Functions (organized by category)

**Utilities:**
- `formatBytes(bytes)` — human-readable size (B/KB/MB/GB)
- `formatDuration(nsamples)` — `mm:ss` from sample count at 44.1 kHz
- `formatDate(ms)` — `MM/DD/YY HH:MM`, returns `''` for dates before 2020 (FAT32 epoch fix)
- `sanitizeFolderName(name)` — FAT32-safe name: ASCII, underscores, max 32 chars

**API Layer:**
- `apiGet(queryString)` → `fetch(API_BASE + qs)` with error handling
- `apiPost(queryString, body)` → `fetch(API_BASE + qs, { method: 'POST', body })`
- `fetchSampleList()` — loads files, folders, kits, kitEntries, capacity from API
- `createFolderOnDevice(path)` — POST manage → `createFolder`
- `renameFolderOnDevice(oldPath, newPath)` — POST manage → `renameFolder`
- `deleteFolderOnDevice(path)` — POST manage → `deleteFolder`
- `deleteSample(path, filename)` — POST manage → `delete`
- `renameSample(path, oldName, newName)` — POST manage → `rename`
- `saveKit()` — POST manage → `saveKit`, clears dirty flag
- `createKitOnDevice(name, entries)` — POST manage → `createKit`

**Rendering:**
- `renderPoolContent()` — builds file/folder table rows with action buttons
- `renderKitEditor()` — builds 8 bank cards with Sortable.js drag-and-drop
- `renderKitSelector()` — populates kit dropdown
- `updateCapacityBar()` — PSRAM usage bar (green/yellow/red thresholds)
- `updateStorageBar()` — SD card usage in header (e.g., "12.5 / 14.8 GB (16%)")
- `updateDropZoneTarget()` — shows current upload target folder
- `updateSaveButton()` — enables/disables save button based on dirty state

**Pool Actions:**
- `setupPoolActions()` — click handler for pool rows: dispatches folder rename/delete,
  sample preview/rename/delete, and folder navigation (via `data-act` and `data-nav` attributes)
- `setupColumnSort()` — sortable column headers (name, date, size, duration)

**Drag & Drop:**
- `setupDropZone()` — file drop zone for WAV upload with format conversion
- `handleDroppedFiles(files)` — processes dropped files, converts non-WAV to WAV
- `setupPoolDragEvents()` — drag from pool rows into kit bank slots

**Kit Safety:**
- `findKitReferencesInFolder(folderPath)` — scans `state.kitEntries` for references
- `updateKitPathsAfterRename(oldPath, newPath)` — updates paths in-memory after rename

**Dialogs:**
- `setupNewFolderDialog()` — create folder → validates, calls API, refreshes pool
- `openRenameFolderDialog()` / `setupRenameFolderDialog()` — rename with kit warning
- `openDeleteFolderDialog()` / `setupDeleteFolderDialog()` — delete with destructive warning
- `setupRenameDialog()` — rename WAV file
- `setupDeleteDialog()` — delete WAV file
- `setupNewKitDialog()` — create kit (optional clone)
- `setupSamplePicker()` / `openSamplePicker()` — add samples to bank via search

**Initialization:**
- `init()` → sets up all event handlers, fetches initial data, renders everything
- Waits for `DOMContentLoaded` + 200ms delay for Shoelace component registration

---

## 9. Shoelace Bundle

### Why Bundled?

The ESP32 HTTP server is limited to ~7 concurrent sockets (LWIP_MAX_SOCKETS=10).
Shoelace's default autoloader triggers 100+ individual chunk requests, each needing
its own socket — this overwhelmed the ESP32 and caused connection failures.

### Bundle Details

| Property | Value |
|----------|-------|
| Shoelace version | 2.20.1 |
| Build tool | esbuild |
| File | `sdcard_image/www/js/shoelace-bundle.js` |
| Size (minified) | ~3215 lines |
| Size (gzipped) | ~52 KB |
| Components included | 15 (see list below) |
| Icons | 16 Bootstrap Icons as inline SVG data URIs |

### Included Components

`sl-button`, `sl-checkbox`, `sl-dialog`, `sl-divider`, `sl-dropdown`,
`sl-icon`, `sl-icon-button`, `sl-input`, `sl-menu`, `sl-menu-item`,
`sl-option`, `sl-select`, `sl-spinner`, `sl-split-panel`, `sl-switch`

### Inline Icons (data URI SVGs)

`arrow-bar-up`, `arrows-move`, `caret-right-fill`, `chevron-down`,
`chevron-right`, `folder-fill`, `moon-fill`, `music-note-beamed`,
`pencil`, `play-fill`, `plus-lg`, `search`, `sort-down`, `sort-up`,
`trash`, `x-lg`

The `sun-fill` icon (for light theme toggle) is handled as an inline SVG
data URI in `sample-manager.js` because it wasn't included in the original bundle.

---

## 10. Folder Management System

### UI Components

**"New Folder" button** — in the pool controls bar, creates a folder in the current
directory. Validates FAT32-safe names via `sanitizeFolderName()`.

**Folder row actions** — each folder row in the pool table has:
- Pencil icon (`data-act="rename-folder"`) → opens rename dialog
- Trash icon (`data-act="delete-folder"`) → opens delete dialog

### API Actions

**createFolder:**
```json
POST /api/v1/samples?action=manage
{ "action": "createFolder", "path": "drums/user/kicks" }
```
Firmware creates the full directory tree recursively.

**renameFolder:**
```json
POST /api/v1/samples?action=manage
{ "action": "renameFolder", "oldPath": "drums/old_name", "newPath": "drums/new_name" }
```
Firmware validates source exists and is a directory, checks target doesn't exist,
then calls `rename()`.

**deleteFolder:**
```json
POST /api/v1/samples?action=manage
{ "action": "deleteFolder", "path": "drums/user/kicks" }
```
Firmware performs iterative stack-based deletion:
1. Traverses directory tree collecting all file and directory paths
2. Deletes all files first via `remove()`
3. Deletes directories in reverse order (deepest first)
4. Multi-pass approach (up to 10 passes) for FAT32 reliability

### FAT32 Name Sanitization

```javascript
function sanitizeFolderName(name) {
  // 1. Trim whitespace
  // 2. Normalize Unicode (NFKD) and strip non-ASCII
  // 3. Replace whitespace runs with underscores
  // 4. Remove chars not in [A-Za-z0-9_\-.]
  // 5. Collapse consecutive special chars
  // 6. Trim leading/trailing special chars
  // 7. Default to "folder" if empty
  // 8. Truncate to 32 characters
}
```

---

## 11. Kit Safety Mechanism

Folder operations can break kit assignments if folders contain referenced samples.
The Sample Manager includes safeguards:

### On Folder Rename

1. `findKitReferencesInFolder(folderPath)` scans `state.kitEntries` for any entries
   whose `path` matches the folder being renamed (exact match or subfolder)
2. If references found, the rename dialog shows a **warning banner** (yellow):
   _"N sample(s) in the active kit reference this folder. Renaming will automatically
   update their paths."_
3. After successful rename, `updateKitPathsAfterRename(oldPath, newPath)` updates
   all matching entry paths in-memory
4. If entries were updated, the kit is auto-saved via `saveKit()`
5. If the user was navigating inside the renamed folder, `state.poolPath` is updated

### On Folder Delete

1. `findKitReferencesInFolder(folderPath)` checks for kit references
2. If references found, the delete dialog shows a **danger banner** (red):
   _"N sample(s) in the active kit reference files in this folder. Deleting will
   break those kit assignments and leave empty slots."_
3. File count is shown: _"Delete folder 'name' containing N file(s)?"_
4. After deletion, affected kit entries are set to `null` (empty slots)
5. If entries were cleared, the kit is auto-saved
6. If the user was inside the deleted folder, navigation moves to the parent

### Scope

Kit safety only checks the **active kit**. Other kits that reference the same
folder will not be automatically updated — this is by design to avoid loading
all kit files during a folder operation.

---

## 12. Development Server

### File: `tools/dev-server.js` (439 lines)

Zero-dependency Node.js server for local development without hardware.

### Usage

```bash
node tools/dev-server.js [port]
# Default port: 3000
# Open http://localhost:3000/samples.html
```

### Mock API

- **Static files**: served from `sdcard_image/www/` with correct MIME types
- **Sample data**: served from `sample_rom/tbdsamples/` (same structure as SD card)
- **All manage actions**: supported (rename, delete, saveKit, createKit, createFolder, renameFolder, deleteFolder)
- **Upload**: writes files to mock tbdsamples directory
- **Preview**: streams WAV files for audio playback

### Key Differences from Firmware

| Feature | Firmware | Dev Server |
|---------|----------|------------|
| File serving | `.gz` files with `Content-Encoding: gzip` | Raw files |
| Query string | URI handler wildcard `/api/v1/samples*` | Exact path match |
| File deletion | `remove()` syscall | `fs.rmSync({ recursive: true })` |
| PSRAM capacity | `esp_vfs_fat_info()` | Hardcoded mock values |
| SD storage | Real SD card stats | Calculated from mock directory |

---

## 13. Build & Deploy Workflow

### Build

```bash
source ~/esp/esp-idf/export.sh
cd /path/to/ctag-tbd_hacking
idf.py build
```

The build runs `create_sd_archive.sh` which:
1. Copies `sdcard_image/www/` and gzips all files (`.html` → `.html.gz`, etc.)
2. Copies `sdcard_image/data/` and `sample_rom/tbdsamples/`
3. Creates `build/tbd-sd-card.zip` with hash file for SD card auto-update

### Flash Firmware

```bash
idf.py -p /dev/cu.usbmodem101 flash
```

### Deploy Web Files to SD Card (via USB Mass Storage)

1. **Switch to USB MSC mode** (OTA slot 1):
   ```bash
   python ~/esp/esp-idf/components/app_update/otatool.py \
     --port /dev/cu.usbmodem101 switch_ota_partition --slot 1
   ```

2. **Wait for SD card to mount** (~12 seconds):
   ```bash
   sleep 12 && ls "/Volumes/NO NAME/www/"
   ```

3. **Gzip and copy web files**:
   ```bash
   gzip -c sdcard_image/www/samples.html > /tmp/samples.html.gz
   gzip -c sdcard_image/www/js/sample-manager.js > /tmp/sample-manager.js.gz
   cp /tmp/samples.html.gz "/Volumes/NO NAME/www/samples.html.gz"
   cp /tmp/sample-manager.js.gz "/Volumes/NO NAME/www/js/sample-manager.js.gz"
   ```

4. **Eject and switch back** to main firmware (OTA slot 0):
   ```bash
   sync && diskutil eject "/Volumes/NO NAME"
   sleep 3
   python ~/esp/esp-idf/components/app_update/otatool.py \
     --port /dev/cu.usbmodem101 switch_ota_partition --slot 0
   ```

### SD Card Auto-Update Caveat

**WARNING**: The firmware's `fs.cpp` compares `.version` vs `tbd-sd-card-hash.txt`
on boot. If they differ, it **deletes** `/www/`, `/data/`, `/tbdsamples/` and
re-extracts from the built-in archive. When manually deploying web files, do NOT
modify the `.version` file or the hash file.

### OTA Partition Layout

| Slot | Content | Purpose |
|------|---------|---------|
| ota_0 | `ctag-tbd.bin` | Main firmware |
| ota_1 | `tusb_msc.bin` | USB Mass Storage for SD card access |

---

## 14. Caching Strategy

### Problem

The ESP32's limited sockets mean every request is expensive. Static assets should
be aggressively cached, but we need a way to bust the cache when files change.

### Solution: Query-String Cache Busting

**RestServer.cpp** (line 108):
```c
// Strip query string from URI before constructing file path.
// req->uri may contain "?v=2" etc. for cache-busting — we must
// not include that when looking up the file on the SD card.
char *query = strchr(uri_path, '?');
if (query) *query = '\0';
```

**Cache headers** for `.js` files:
```
Cache-Control: public, max-age=2592000, immutable
```
(30-day cache for JavaScript files)

**Current cache bust versions:**
| File | Version |
|------|---------|
| `shoelace-bundle.js` | `?v=2` |
| `Sortable.min.js` | `?v=2` |
| `sample-manager.js` | `?v=4` |
| `dark.css` / `light.css` | `?v=2` |

Increment the `?v=N` parameter when deploying updated files to force browser reload.

---

## 15. Key Design Decisions & Constraints

### ESP32-P4 Constraints

1. **Socket limit**: `LWIP_MAX_SOCKETS=10`, httpd uses max 7. This drove the
   Shoelace bundling decision and consolidated API design.

2. **No RTC**: FAT32 timestamps default to 1980-01-01 epoch. `formatDate()` hides
   dates before 2020 rather than showing meaningless "01/01/80".

3. **SPIRAM for buffers**: All large buffers (upload chunks, response bodies) are
   allocated from SPIRAM via `heap_caps_malloc(size, MALLOC_CAP_SPIRAM)`.

4. **FAT32 filesystem**: 8.3 compatibility not required (long filenames supported),
   but special characters are restricted. `sanitizeFolderName()` enforces safe names.

### API Design

5. **2 URI handlers, not 4+**: Wildcard URI `/api/v1/samples*` with query-string
   dispatch (`?action=upload|manage|reload`) keeps handler count low.

6. **Single GET for everything**: File list, kit data, capacity, and preview all
   served from one handler, reducing registration overhead.

### UI/UX Design

7. **Inline CSS**: All styles in `samples.html` — no separate stylesheet for the
   Sample Manager. Reduces HTTP requests.

8. **Zero build step**: Vanilla JS with no transpilation. Can be edited and
   deployed directly.

9. **Centralized state**: Single `state` object drives all rendering. Mutations
   → re-render pattern without a framework.

10. **Flexbox scrolling**: Flex children with `overflow-y: auto` require `min-height: 0`
    on all ancestor flex containers. This was a key fix for proper panel scrolling.

---

## 16. Troubleshooting

### Device Not Showing Up in Network

1. Check USB: `ls /dev/cu.usb*` — should show `/dev/cu.usbmodem101` or similar
2. Check USB device: `ioreg -p IOUSB -l | grep "TBD_BBA"` — verifies firmware running
3. Check if MIDIServer grabbed it: `ioreg -p IOUSB -l | grep UsbExclusiveOwner`
4. Reset device: Toggle DTR/RTS via serial, or unplug/replug USB
5. Check interface: `ifconfig -a | grep "192.168.4"` — should show `inet 192.168.4.2`
6. Monitor logs: `idf.py -p /dev/cu.usbmodem101 monitor --no-reset`

### Web Page Not Loading

1. Verify HTTP: `curl -s -o /dev/null -w "%{http_code}" http://192.168.4.1/samples.html`
   — should return `200`
2. Check gzip: Files on SD card must have `.gz` extension (`samples.html.gz`)
3. Check hash: If `.version` changed, SD card contents were auto-replaced on boot
4. Cache issues: Hard refresh (Cmd+Shift+R) or increment `?v=N` version

### API Errors

1. "Failed to read existing file" — wrong endpoint path (use `/api/v1/samples`, plural)
2. "Cannot read sample_rom.jsn" — file missing or corrupt on SD card
3. Upload timeout — file too large for available SPIRAM; check `UPLOAD_SOFT_LIMIT` (10 MB)

### Build Issues

1. ESP-IDF environment: `source ~/esp/esp-idf/export.sh` before build
2. `#include <vector>` required in SampleAPI.cpp for `deleteFolder` action

---

## 17. Changelog

### V3 Changes (Phases 15–18, Feb 2025)

#### Phase 15 — Bug Fixes

- Fixed bank addressing: banks now correctly use array indices 0–7 for 32-slot banks
- Fixed transfer log: upload progress and completion messages display correctly
- Fixed storage display: shows SD card total/free in header bar
- Added cache busting: `?v=N` query params on all script/CSS references
- RestServer.cpp: strips query strings from URIs before file lookup

#### Phase 16 — Scrolling & Upload UX

- Fixed panel scrolling: added `min-height: 0` to all flex ancestors
- Improved upload UX: drag-and-drop zone shows current target folder
- Transfer panel redesign: collapsible bar with progress badges
- Storage bar: shows GB values and percentage with color thresholds

#### Phase 17 — Font Sizes & Visual Polish

- Bumped all font sizes from 0.62–0.72rem range to 0.68–0.82rem range
- Column widths: date 90→100px, size 62→68px
- Breadcrumb text: 0.78→0.82rem
- Panel titles: 0.82rem font-weight 700
- Consistent sizing across Pool, Kit Editor, and Transfer Bar

#### Phase 18 — Folder Management & Kit Safety

**Folder Management:**
- Added "New Folder" button in pool controls bar
- Added rename (pencil) and delete (trash) icons on folder rows
- Three new dialogs: Create Folder, Rename Folder, Delete Folder
- `sanitizeFolderName()` enforces FAT32-safe names (ASCII, 32-char max)
- Firmware API: `createFolder`, `renameFolder`, `deleteFolder` actions in SampleAPI.cpp
- Dev server: matching `renameFolder` and `deleteFolder` handlers

**Kit Safety:**
- `findKitReferencesInFolder()` — scans active kit for folder references
- `updateKitPathsAfterRename()` — auto-updates kit paths after folder rename
- Rename dialog: yellow warning banner when kit references found
- Delete dialog: red danger banner with file count and kit reference warning
- Auto-save kit after folder operations that modify kit entries
- Navigation auto-updates when current folder is renamed/deleted

**Date Display:**
- `formatDate()` returns empty string for dates before 2020 (FAT32 without RTC)

**Firmware:**
- Added `#include <vector>` for deleteFolder implementation
- `renameFolder`: validates source directory, checks target doesn't exist
- `deleteFolder`: iterative stack-based recursive deletion with multi-pass for FAT32

---

## 18. Licensing

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
