# TBD-16 Sample Manager — Implementation Documentation

```
Version  : 2.0
Date     : 2025-07
Status   : WebUI + Firmware API fully implemented
License  : LGPL 3.0 (dadamachines additions)
Copyright: (c) 2014-2026 Johannes Elias Lohbihler for dadamachines
```

---

## Table of Contents

1.  [Overview](#1-overview)
2.  [File Inventory](#2-file-inventory)
3.  [Architecture](#3-architecture)
4.  [REST API Contract (Consolidated)](#4-rest-api-contract-consolidated)
5.  [Firmware Implementation — SampleAPI](#5-firmware-implementation--sampleapi)
6.  [WebUI — samples.html](#6-webui--sampleshtml)
7.  [WebUI — sample-manager.js](#7-webui--sample-managerjs)
8.  [Shoelace Bundle](#8-shoelace-bundle)
9.  [Development Server](#9-development-server)
10. [Testing Locally](#10-testing-locally)
11. [Deploying to Device](#11-deploying-to-device)
12. [Licensing](#12-licensing)
13. [Key Design Decisions](#13-key-design-decisions)
14. [Troubleshooting](#14-troubleshooting)
15. [Changelog (V1 → V2)](#15-changelog-v1--v2)

---

## 1. Overview

The TBD-16 Sample Manager is a browser-based tool for managing the WAV samples,
kits, and bank assignments on the dadamachines TBD-16 (ESP32-P4 platform).

**Design goals:**

- Elektron Transfer / Ableton Move–inspired UX — minimal, dark, professional
- Pool browser (left panel) + Kit editor with 8 banks × 32 slots (right panel)
- Drag-and-drop from pool into bank slots, reorder within banks via Sortable.js
- Client-side audio format conversion (MP3/AIFF/FLAC/OGG → 44.1 kHz 16-bit mono WAV)
- Audio preview with waveform-less "play from device" button
- PSRAM capacity bar showing used vs. available memory
- Dynamic kit and folder management (create, rename, delete)
- Zero build step — vanilla JS + Shoelace Web Components served from SD card

**Stack:**

| Layer | Technology |
|-------|-----------|
| WebUI | Shoelace 2.20.1 (self-hosted, autoloader), vanilla JS, Sortable.js |
| Firmware API | ESP-IDF `httpd`, C++17, rapidjson, SPIRAM for POST bodies |
| Dev Server | Node.js, zero dependencies, mock API on port 3000 |
| Build | `create_sd_archive.sh` gzips all `www/` for SD card |

---

## 2. File Inventory

### WebUI (served from SD card)

| File | Lines | Purpose |
|------|------:|---------|
| `sdcard_image/www/samples.html` | 657 | HTML + inline CSS — full page layout |
| `sdcard_image/www/js/sample-manager.js` | 1600 | Client application logic |
| `sdcard_image/www/js/Sortable.min.js` | — | Sortable.js library (drag-and-drop) |
| `sdcard_image/www/shoelace/` | — | Shoelace 2.20.1 CDN bundle (autoloader) |

### Firmware (ESP32-P4)

| File | Lines | Purpose |
|------|------:|---------|
| `main/SampleAPI.hpp` | 46 | Header — 2 public handler declarations |
| `main/SampleAPI.cpp` | 694 | Full REST API implementation |
| `main/RestServer.cpp` | 742 | HTTP server — 2 Sample API registrations (lines 520–535) |

### Tooling

| File | Lines | Purpose |
|------|------:|---------|
| `tools/dev-server.js` | 406 | Development server with mock API |
| `docs/sample-manager-implementation-v2.md` | — | This document |

### Documentation (superseded)

| File | Notes |
|------|-------|
| `docs/sample-manager-implementation.md` | V1 doc (639 lines) — documents the original 4-endpoint API scheme |

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Browser                                                             │
│                                                                      │
│  samples.html ──► sample-manager.js ──► Shoelace Web Components      │
│       │                   │                                          │
│       │     REST calls    │                                          │
│       │                   ▼                                          │
│       │     ┌─────────────────────────────────┐                      │
│       │     │  GET  /api/v1/samples*          │                      │
│       │     │    (default)  → list + kits     │                      │
│       │     │    ?preview=  → stream WAV      │                      │
│       │     │    ?kit=N     → switch kit       │                      │
│       │     ├─────────────────────────────────┤                      │
│       │     │  POST /api/v1/samples*          │                      │
│       │     │    ?action=upload   → save WAV  │                      │
│       │     │    ?action=manage   → JSON ops  │                      │
│       │     │    ?action=reload   → PSRAM     │                      │
│       │     └─────────────────────────────────┘                      │
└──────┼──────────────────────────────────────────────────────────────┘
       │                                                               
       ▼                                                               
┌──────────────────────────────────────────────────────────────────────┐
│  ESP32-P4 Firmware                                                   │
│                                                                      │
│  RestServer.cpp                                                      │
│    ├── 16 existing URI handlers (config, presets, favorites, etc.)    │
│    ├── GET  /api/v1/samples*  → SampleAPI::samples_get_handler()     │
│    ├── POST /api/v1/samples*  → SampleAPI::samples_post_handler()    │
│    └── GET  /*                → static file server (catch-all)       │
│                                                                      │
│  SampleAPI.cpp                                                       │
│    ├── samples_get_handler()  → dispatch: list / preview / kit       │
│    │     ├── scan_wav_files()        recursive /sdcard/tbdsamples/    │
│    │     ├── load_json_file()        sample_rom.jsn + kit descriptor  │
│    │     └── chunked WAV streaming   for audio preview               │
│    └── samples_post_handler() → dispatch via ?action= query string   │
│          ├── upload   → fwrite() binary WAV to SD                    │
│          ├── manage   → rename/delete/saveKit/createKit/createFolder  │
│          └── reload   → Disable DSP → RefreshSampleRom → Enable DSP  │
│                                                                      │
│  SD Card: /sdcard/tbdsamples/                                        │
│    ├── sample_rom.jsn           — kit registry (banks, names, tags)   │
│    ├── def_smp.jsn              — default kit descriptor (256 entries)│
│    ├── drums/factory/*.wav      — factory samples                    │
│    ├── drums/user/*.wav         — user uploads                       │
│    └── wavetables/*.wav         — wavetable samples                  │
└──────────────────────────────────────────────────────────────────────┘
```

### Handler Budget

The ESP-IDF HTTP server is configured with `max_uri_handlers = 20`.

| Slot Count | Purpose |
|-----------:|---------|
| 16 | Existing handlers (config GET/POST, presets, favorites, etc.) |
| 2  | Sample Manager (1 GET + 1 POST, consolidated via query strings) |
| **18** | **Total used** |
| 2  | **Free slots remaining** |

Consolidation rationale: lead-dev guidance that the 20-handler limit is
problematic to increase. The original design used 4 URI handlers; the
consolidated design uses 2, dispatching via query strings.

---

## 4. REST API Contract (Consolidated)

Two URI registrations, one for GET and one for POST, both matching
`/api/v1/samples*`. The wildcard allows the esp-idf URI matcher to route
all paths under this prefix to the handler.

### 4.1 GET /api/v1/samples — List

Returns all WAV files, kit metadata, active kit entries, and PSRAM capacity.

**Query parameters (all optional):**

| Param | Effect |
|-------|--------|
| *(none)* | Default — return full listing for current active kit |
| `kit=N` | Switch active kit index to N before building response |
| `preview=path/name` | Stream the WAV file for audio preview (see §4.2) |

**Response (default / kit=N):**

```json
{
  "files": [
    { "name": "BD0", "path": "drums/factory", "size": 22976, "mtime": 1720000000000 }
  ],
  "kits": {
    "smp_banks": ["def_smp.jsn", "a4_dub.jsn"],
    "smp_bank_names": ["Default", "A4 Dub"],
    "smp_bank_tags": [["basic", "stock"], ["analog 4", "dub"]],
    "smp_bank_meta": [],
    "active_smp_bank": 0
  },
  "active_kit_entries": [
    { "filename": "BD0", "path": "drums/factory", "nsamples": 11466, "sname": "" },
    { "filename": "BD1", "path": "drums/factory", "nsamples": 32193, "sname": "" }
  ],
  "capacity": {
    "psram_max_bytes": 29360128,
    "active_bank_bytes": 7183046
  }
}
```

**Field notes:**
- `files[].name` — filename stem (no `.wav` extension)
- `files[].path` — relative path under `/sdcard/tbdsamples/`
- `files[].size` — raw file size in bytes (WAV header + PCM data)
- `files[].mtime` — modification time in milliseconds since epoch
- `capacity.active_bank_bytes` — sum of `nsamples × 2` for all kit entries (16-bit mono)

### 4.2 GET /api/v1/samples?preview=path/name — Audio Preview

Streams the requested WAV file as chunked `audio/wav` response.

**Example:** `GET /api/v1/samples?preview=drums/factory/BD0`

**Behavior:**
1. Constructs full path: `/sdcard/tbdsamples/drums/factory/BD0.wav`
2. Falls back to `.WAV` extension if `.wav` not found
3. Streams the file in 4 KB chunks from SPIRAM buffer
4. Returns `404 Not Found` if file doesn't exist

### 4.3 POST /api/v1/samples?action=upload — Upload WAV

Upload a single WAV file to the SD card.

**Query parameters:**
- `action=upload` (required)
- `path=drums/user` — target folder relative to `/sdcard/tbdsamples/`
- `filename=my_kick` — filename stem (no extension)

**Body:** Raw WAV binary (`Content-Type: application/octet-stream`)

**Behavior:**
1. Creates target directory recursively if it doesn't exist
2. Writes binary body to `/sdcard/tbdsamples/<path>/<filename>.wav`
3. Uses SPIRAM buffer for receiving body chunks

**Response:**
```json
{ "ok": true, "name": "my_kick", "path": "drums/user", "size": 45678 }
```

### 4.4 POST /api/v1/samples?action=manage — Management Operations

Multipurpose management endpoint. The JSON body's `action` field determines
the operation.

**Body (JSON), dispatched by `action`:**

| Action | Body Fields | Effect |
|--------|-------------|--------|
| `rename` | `{ action, path, oldName, newName }` | Rename WAV file on SD |
| `delete` | `{ action, path, filename }` | Delete WAV file from SD |
| `saveKit` | `{ action, bankIndex, entries }` | Overwrite kit descriptor JSON |
| `createKit` | `{ action, name, entries }` | Create new kit + register in `sample_rom.jsn` |
| `deleteKit` | `{ action, bankIndex }` | Remove kit from `sample_rom.jsn` |
| `createFolder` | `{ action, path }` | Create directory (recursive `mkdir`) |

**Response:** `{ "ok": true }`

### 4.5 POST /api/v1/samples?action=reload — PSRAM Reload

Trigger the sample ROM reload from SD card into PSRAM.

**Body:** `{}` (empty JSON, or no body)

**Behavior:**
1. `DisablePluginProcessing()` — mutes audio output
2. `RefreshSampleRom()` — re-reads kit descriptor, reloads all samples into PSRAM
3. `EnablePluginProcessing()` — restores audio output

**Response:** `{ "ok": true }`

---

## 5. Firmware Implementation — SampleAPI

### Class Design

```cpp
namespace CTAG::REST {
    class SampleAPI final {
    public:
        SampleAPI() = delete;  // static-only class
        static esp_err_t samples_get_handler(httpd_req_t *req);
        static esp_err_t samples_post_handler(httpd_req_t *req);
    };
}
```

- **Static-only** — no instances, no state. All state lives on the SD card.
- **Two public methods** registered as esp-idf URI handlers.
- Query string parsing determines the internal dispatch path.

### Internal Helpers (file-static)

| Function | Purpose |
|----------|---------|
| `url_decode()` | Decode `%XX` and `+` in query values |
| `send_json()` | Send `application/json` with CORS headers |
| `send_ok()` | Send `{"ok":true}` |
| `send_error()` | Send error JSON with HTTP status code |
| `read_post_body()` | SPIRAM-allocated chunked POST body reader |
| `load_json_file()` | Read + parse JSON from SD card via `FileReadStream` |
| `store_json_file()` | Write JSON document to SD card via `FileWriteStream` |
| `scan_wav_files()` | Recursive directory scan for `.wav` files |
| `compute_used_bytes()` | Sum `nsamples × 2` from kit entries |

### Memory Management

- **POST bodies** are read into SPIRAM (`MALLOC_CAP_SPIRAM`) buffers via
  `heap_caps_malloc()`, freed after processing.
- **WAV preview streaming** uses a 4 KB SPIRAM chunk buffer, streamed via
  `httpd_resp_send_chunk()`.
- **JSON parsing** uses rapidjson's `FileReadStream` with a 1 KB stack buffer.
- No persistent heap allocations — everything is allocated per-request and freed.

### Registration in RestServer.cpp

Two URI registrations at lines 520–535, placed **before** the `/*` catch-all
static file handler (required so they take priority):

```cpp
/* Sample Manager API — GET: list / preview */
httpd_uri_t samples_get_uri = {
    .uri = "/api/v1/samples*",
    .method = HTTP_GET,
    .handler = &CTAG::REST::SampleAPI::samples_get_handler,
    .user_ctx = rest_context
};
httpd_register_uri_handler(server, &samples_get_uri);

/* Sample Manager API — POST: upload / manage / reload (via ?action=) */
httpd_uri_t samples_post_uri = {
    .uri = "/api/v1/samples*",
    .method = HTTP_POST,
    .handler = &CTAG::REST::SampleAPI::samples_post_handler,
    .user_ctx = rest_context
};
httpd_register_uri_handler(server, &samples_post_uri);
```

### Dependencies

```cpp
#include "SampleAPI.hpp"          // own header
#include "SPManager.hpp"          // DisablePluginProcessing, RefreshSampleRom, EnablePluginProcessing
#include <dirent.h>               // opendir, readdir, closedir
#include <sys/stat.h>             // stat, mkdir
#include "esp_heap_caps.h"        // heap_caps_malloc, heap_caps_free (SPIRAM)
#include "rapidjson/document.h"   // JSON parsing
#include "rapidjson/writer.h"     // JSON serialization
#include "rapidjson/filereadstream.h"  // file → JSON
#include "rapidjson/filewritestream.h" // JSON → file
```

---

## 6. WebUI — samples.html

Self-contained HTML page with all CSS inline in a `<style>` block.

### Page Structure

```
<!DOCTYPE html> + LGPL license comment
<head>
  ├── Shoelace dark theme CSS
  ├── Shoelace autoloader script (module)
  └── <style> — all application CSS (~350 lines)
<body>
  ├── <header> — title + PSRAM capacity bar
  ├── <main> — sl-split-panel (position="40")
  │   ├── left panel (slot="start")
  │   │   ├── Pool toolbar: upload, new folder, search
  │   │   ├── View toggle: banked / flat
  │   │   └── <sl-tree> — file/folder browser
  │   └── right panel (slot="end")
  │       ├── Kit selector toolbar: dropdown, save, reload, new/delete kit
  │       ├── Kit memory bar (per-kit PSRAM usage)
  │       └── Bank cards (8 × 32 slots) or flat list
  ├── <footer> — connection status + file count
  ├── Dialogs (5× <sl-dialog>): rename, delete, new kit, new folder, sample picker
  ├── Loading overlay — full-screen spinner for PSRAM reload
  ├── Toast stack — fixed-position notification container
  └── Scripts: Sortable.min.js + sample-manager.js
```

### CSS Design Tokens

All colors, spacing, borders, and fonts reference Shoelace CSS custom properties:

```css
var(--sl-color-neutral-0)     /* background */
var(--sl-color-neutral-100)   /* panel backgrounds */
var(--sl-color-neutral-400)   /* folder icons */
var(--sl-color-neutral-700)   /* borders */
var(--sl-color-primary-600)   /* accent, active states */
var(--sl-border-radius-large) /* card corners */
var(--sl-font-sans)           /* UI text */
var(--sl-font-mono)           /* teletype/code */
```

This ensures automatic dark/light theme support via Shoelace's theme system.

---

## 7. WebUI — sample-manager.js

### Section Map

| Section | Lines (approx.) | Purpose |
|---------|----------------:|---------|
| **License header** | 1–13 | LGPL 3.0 attribution |
| **Configuration** | 14–72 | Constants, state object, default bank definitions |
| **Helpers** | 72–100 | `formatDuration()`, `formatBytes()`, `fileDuration()`, `nsamples()` |
| **WAV Encoding** | 100–185 | `writeString()`, `encodeWAV()`, `convertToWAV()`, `sanitizeFilename()` |
| **API Client** | 185–280 | `apiGet()`, `apiPost()`, `fetchSampleList()`, `uploadSample()`, `renameSample()`, `deleteSample()`, `saveKitDescriptor()`, `createKitOnDevice()`, `reloadPSRAM()` |
| **Upload Queue** | 280–400 | `processUploadQueue()`, `queueFilesForUpload()` — sequential with progress |
| **Audio Preview** | 400–415 | `playPreview()`, `stopPreview()` — AudioContext playback |
| **Kit/Bank Logic** | 415–500 | `getBankEntries()`, `addEntryToBank()`, `removeEntryFromBank()`, `compactBank()`, `reorderBankSlots()`, `getKitForSave()`, `saveKit()`, `calculateUsedBytes()` |
| **Toast Notifications** | 500–540 | `toast()`, `iconForVariant()`, `esc()` |
| **UI Rendering** | 540–800 | Pool tree, kit selector, bank cards, flat view, capacity bars |
| **Sortable.js Setup** | 800–840 | Per-bank Sortable instances for drag reorder |
| **Pool → Bank Drag** | 840–900 | dragstart on pool files, drop on bank bodies |
| **Drop Zone** | 900–980 | File drop → client-side convert → queue upload |
| **Event Handlers** | 980–1050 | Delegated click handlers for pool/kit/toolbar |
| **Dialogs** | 1050–1320 | Rename, Delete, New Kit, New Folder, Sample Picker |
| **Dynamic Banks** | 1320–1400 | Add/delete bank, 1-based numbering |
| **Initialization** | 1400–1600 | `init()` — wire events, fetch data, render UI |

### State Management

Single mutable `state` object — no framework, no store:

```javascript
const state = {
  files: [],            // Pool: [{ name, path, size, mtime }]
  folders: [],          // Unique folder paths from files
  kits: { ... },        // From sample_rom.jsn
  kitEntries: [],       // Active kit descriptor (256 entries, may contain nulls)
  banks: [...],         // Bank metadata: [{ name, color, collapsed }]
  capacity: { ... },    // { psram_max_bytes, active_bank_bytes }
  viewMode: 'banked',   // 'banked' | 'flat'
  targetFolder: '...',  // Upload target path
  uploadQueue: [],      // [{ file, name, path, status, progress }]
};
```

### Bank Addressing

8 banks × 32 slots = 256 entries in the flat `kitEntries` array:

```
Bank 01 (KICK):     kitEntries[0..31]
Bank 02 (SNARE):    kitEntries[32..63]
Bank 03 (HIHAT CL): kitEntries[64..95]
...
Bank 08 (OTHER):    kitEntries[224..255]
```

Banks are numbered 01–08 in the UI (1-based) but 0–7 internally.

### API Client Functions

All HTTP calls go through two helpers:

```javascript
function apiGet(queryString = '') {
    return fetch(API_BASE + queryString).then(r => r.json());
}

function apiPost(queryString, body, isJSON = true) {
    return fetch(API_BASE + queryString, {
        method: 'POST',
        headers: isJSON ? { 'Content-Type': 'application/json' } : {},
        body: isJSON ? JSON.stringify(body) : body,
    }).then(r => r.json());
}
```

**Usage examples:**

| Operation | Call |
|-----------|------|
| List samples | `apiGet()` |
| Switch kit | `apiGet('?kit=2')` |
| Upload WAV | `apiPost('?action=upload&path=drums/user&filename=kick', wavBlob, false)` |
| Rename file | `apiPost('?action=manage', { action:'rename', path, oldName, newName })` |
| Delete file | `apiPost('?action=manage', { action:'delete', path, filename })` |
| Save kit | `apiPost('?action=manage', { action:'saveKit', bankIndex, entries })` |
| Create kit | `apiPost('?action=manage', { action:'createKit', name, entries })` |
| Delete kit | `apiPost('?action=manage', { action:'deleteKit', bankIndex })` |
| Create folder | `apiPost('?action=manage', { action:'createFolder', path })` |
| Reload PSRAM | `apiPost('?action=reload', {})` |

### Client-Side Audio Conversion

`convertToWAV(file)` uses the Web Audio API to decode any browser-supported
format (WAV, MP3, AIFF, FLAC, OGG) and re-encode as 44.1 kHz 16-bit mono WAV:

1. `file.arrayBuffer()` → `AudioContext.decodeAudioData()`
2. If stereo, mix down to mono: `(L + R) / 2`
3. If sample rate ≠ 44100, resample via `OfflineAudioContext`
4. `encodeWAV()` — write RIFF header + PCM data into `ArrayBuffer`
5. Return as `Blob`

### Pool Tree with Folder Sizes

`getPoolItems()` computes per-folder sizes by summing `file.size` for all files
in each folder, displayed as `(N files · XX.X MB)` next to folder names.

### Dynamic Bank Add/Delete

- **Add Bank:** Creates new bank after the last one, up to 8 max. New bank gets
  a default name and color. Banks are numbered 01–08 in the UI.
- **Delete Bank:** Removes a bank by index, clears its 32 kit entries, shifts
  remaining entries, and persists the change.

### PSRAM Reload Flow

After saving a kit, the UI calls `reloadPSRAM()`:

1. Show full-screen loading overlay with spinner
2. `POST /api/v1/samples?action=reload`
3. Firmware: `DisablePluginProcessing()` → `RefreshSampleRom()` → `EnablePluginProcessing()`
4. On success, re-fetch sample list to update UI
5. Hide overlay, show toast notification

---

## 8. Shoelace Bundle

### Version & Hosting

Shoelace **2.20.1** — downloaded from npm, self-hosted at `/shoelace/` on the
SD card. No CDN dependency at runtime.

### Autoloader

`shoelace-autoloader.js` uses `MutationObserver` to watch the DOM. When an
unregistered `sl-*` element appears, it dynamically imports the component JS
from `/shoelace/components/<name>/<name>.js`.

### Components Used (16 of 58)

| Component | Where Used |
|-----------|-----------|
| `sl-split-panel` | Main left/right layout |
| `sl-tree` + `sl-tree-item` | File browser tree |
| `sl-button` | Actions, toolbar buttons |
| `sl-icon-button` | Per-item action buttons |
| `sl-icon` | File/folder/action icons (Bootstrap Icons) |
| `sl-select` + `sl-option` | Kit selector, target folder |
| `sl-dialog` | 5 dialogs: Rename, Delete, New Kit, New Folder, Sample Picker |
| `sl-input` | Dialog text inputs |
| `sl-checkbox` | Clone checkbox in New Kit dialog |
| `sl-switch` | Bank/Flat view toggle |
| `sl-progress-bar` | PSRAM capacity bar, upload progress |
| `sl-spinner` | Loading states (initial load, PSRAM reload) |
| `sl-tooltip` | Button tooltips |
| `sl-alert` | Toast notifications |
| `sl-badge` | Upload queue status badge |

### Size on SD Card

Full Shoelace bundle: ~11 MB uncompressed. After gzip via `create_sd_archive.sh`:
~3–4 MB on SD. Only ~16 components are actually fetched (lazy-loaded by autoloader).

---

## 9. Development Server

### Usage

```bash
# Start with default port (3000)
node tools/dev-server.js

# Start with custom port
node tools/dev-server.js 8080
```

### Output

```
  TBD-16 Sample Manager Dev Server
  ─────────────────────────────────
  Static files : /path/to/sdcard_image/www
  Sample ROM   : /path/to/sample_rom/tbdsamples
  Listening    : http://localhost:3000
  Open         : http://localhost:3000/samples.html
```

### Mock API Routing

The dev server mirrors the consolidated 2-endpoint scheme:

| Route | Mock Behavior |
|-------|--------------|
| `GET /api/v1/samples` (default) | Scans `sample_rom/tbdsamples/` for WAV files, reads `sample_rom.jsn`, returns real file counts + sizes |
| `GET /api/v1/samples?preview=...` | Serves WAV file from `sample_rom/tbdsamples/` for audio preview |
| `GET /api/v1/samples?kit=N` | Switches in-memory active kit index, re-reads kit descriptor |
| `POST /api/v1/samples?action=upload` | Accepts binary body, logs to console, stores in memory (not on disk) |
| `POST /api/v1/samples?action=manage` | Dispatches by `body.action`: `saveKit` updates in-memory state; `rename`/`delete`/`createKit`/`createFolder` are logged |
| `POST /api/v1/samples?action=reload` | Logs "Reload PSRAM" and returns `{ ok: true }` |

### Request Logging

All requests are logged except Shoelace component chunk and icon fetches (noise reduction).

### Limitations

- **Uploads are in-memory only** — not written to disk
- **Renames and deletes are logged** but don't modify the filesystem
- **Kit saves update in-memory state** — lost on server restart
- **Audio preview** works if WAV files exist at the expected paths

---

## 10. Testing Locally

### Quick Start

```bash
node tools/dev-server.js
open http://localhost:3000/samples.html    # macOS
```

> **Important:** Do NOT open `samples.html` directly as `file://`. Shoelace's
> autoloader uses ES module imports, which are blocked by CORS over `file://`.

### Feature Test Matrix

| Feature | Dev Server | Device |
|---------|:----------:|:------:|
| Page rendering & layout | ✅ | ✅ |
| File tree with folder sizes | ✅ | ✅ |
| Kit selector (switch kits) | ✅ | ✅ |
| 8 bank cards with entries | ✅ | ✅ |
| Drag-and-drop reorder | ✅ | ✅ |
| Pool → Bank drag | ✅ | ✅ |
| View toggle (banked/flat) | ✅ | ✅ |
| Upload with client-side conversion | ✅ | ✅ |
| Rename / Delete dialogs | ✅ | ✅ |
| New Kit / New Folder dialogs | ✅ | ✅ |
| Dynamic bank add/delete | ✅ | ✅ |
| Sample Picker dialog | ✅ | ✅ |
| PSRAM capacity bar | ✅ | ✅ |
| Audio preview (WAV streaming) | ✅ | ✅ |
| PSRAM reload | ✅ Mock | ✅ |
| Toast notifications | ✅ | ✅ |

---

## 11. Deploying to Device

### SD Card Packaging

```bash
./create_sd_archive.sh
```

This gzips all `sdcard_image/www/` contents. The ESP32 firmware serves gzipped
files with `Content-Encoding: gzip` headers.

### Files on SD Card

```
/sdcard/www/
  ├── samples.html              ← Main page
  ├── js/
  │   ├── sample-manager.js     ← Application logic
  │   └── Sortable.min.js       ← Drag-and-drop library
  └── shoelace/                 ← Self-hosted Shoelace 2.20.1
      ├── themes/dark.css
      ├── shoelace-autoloader.js
      ├── components/**
      ├── chunks/**
      └── assets/icons/**
```

### Build Integration

`SampleAPI.cpp` is auto-compiled by CMake's `file(GLOB ...)` in `main/CMakeLists.txt`.
No manual build configuration changes needed — just add the `.cpp`/`.hpp` files
and they are included in the next build.

### Linking from Existing UI

Add a navigation link in the existing `main.html`:
```html
<a href="samples.html">Sample Manager</a>
```

---

## 12. Licensing

### Dual License Structure

The TBD-16 repository uses dual licensing (see `LICENSE` in repo root):

| Scope | License | Copyright |
|-------|---------|-----------|
| Core DSP engine (upstream ctag-tbd) | **GPL 3.0** | (c) 2020–2026 Robert Manzke |
| dadamachines additions (WebUI, tools, docs) | **LGPL 3.0** | (c) 2014–2026 Johannes Elias Lohbihler for dadamachines |

### Sample Manager License

All Sample Manager files are **dadamachines additions** and licensed under
**LGPL 3.0**:

- `sdcard_image/www/samples.html` — HTML comment at top
- `sdcard_image/www/js/sample-manager.js` — JS comment block at top
- `tools/dev-server.js` — JSDoc comment block at top
- `main/SampleAPI.hpp` — C block comment at top
- `main/SampleAPI.cpp` — C block comment at top

### LGPL 3.0 Summary

- Individual developers may freely use, modify, and contribute.
- Modifications to LGPL-licensed code must be shared under LGPL 3.0 if distributed.
- Commercial use requires contributing modifications back, or obtaining a commercial
  license from dadamachines.

Full text: https://www.gnu.org/licenses/lgpl-3.0.txt

---

## 13. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **2 URI handlers (consolidated)** | Max 20 handlers in esp-idf HTTP server. Original 4-endpoint design replaced with query-string dispatch per lead-dev guidance. 18/20 slots used, 2 free. |
| **Shoelace over Onsen UI** | Modern, tree-shakeable, dark theme built-in. Onsen UI is mobile-first without tree/split-panel components. |
| **Autoloader over full bundle** | Lazy-loads only the ~16 components used, reducing initial JS payload from ~500 KB to ~100 KB. |
| **Vanilla JS, no framework** | No build step. Works on ESP32 without Node/Webpack. Matches existing `drumrack.js` patterns. |
| **Client-side audio conversion** | ESP32 has no spare cycles for format conversion. Browser `AudioContext` handles WAV/MP3/AIFF/FLAC/OGG natively. |
| **Single state object** | Simple, debuggable. No framework overhead. Same pattern as `drumrack.js`. |
| **Separate page (samples.html)** | Clean separation from existing Onsen UI code. Can be linked later. |
| **SPIRAM for POST bodies** | Upload files can be several MB. SPIRAM has ~8 MB free vs. ~200 KB internal RAM. |
| **Chunked WAV streaming** | Preview files streamed in 4 KB chunks — no need to hold entire WAV in RAM. |
| **rapidjson** | Already used by existing firmware (`ctagDataModelBase`). Faster than cJSON for large documents. |
| **1-based bank numbering** | Matches musician expectations (Bank 01–08 in UI, 0–7 internally). |
| **Folder sizes in pool tree** | Quick visual feedback on how much sample data is in each folder. |
| **PSRAM reload after kit save** | Ensures device playback matches the saved kit immediately. Brief audio mute is acceptable UX. |

---

## 14. Troubleshooting

### Shoelace Components Not Rendering

**Cause:** Missing `components/` directory in `sdcard_image/www/shoelace/`.

**Fix:** Re-install from npm:
```bash
cd /tmp && mkdir sl && cd sl
npm init -y && npm install @shoelace-style/shoelace@2.20.1
cp -r node_modules/@shoelace-style/shoelace/cdn/components \
      /path/to/sdcard_image/www/shoelace/components
```

### "Could not connect to device" in Footer

**Cause:** Dev server not running or wrong port.

**Fix:** `node tools/dev-server.js` → open `http://localhost:3000/samples.html`

### Page via file:// Protocol — Nothing Works

**Cause:** ES module imports blocked by CORS over `file://`.

**Fix:** Always serve via HTTP (dev server or device).

### Upload Fails or Hangs

- **Dev server:** Uploads are in-memory only — expected behavior.
- **Device:** Check SD card free space. Check ESP log for `SampleAPI` error messages.

### PSRAM Reload Causes Audio Glitch

**Expected:** The reload sequence briefly disables plugin processing (~100–500 ms).
The UI shows a full-screen loading overlay during this time.

### Handler Registration Fails

If adding more URI handlers causes `httpd_register_uri_handler` to return
`ESP_ERR_HTTPD_HANDLERS_FULL`, the 20-handler limit has been reached.
Consolidate additional endpoints into the existing query-string dispatch pattern.

---

## 15. Changelog (V1 → V2)

| Area | V1 | V2 |
|------|----|----|
| **API design** | 4 separate URI endpoints | 2 consolidated handlers with query-string dispatch |
| **Handler slots** | 20/20 (zero free) | 18/20 (2 free) |
| **Firmware** | Not implemented — documented as future work | Fully implemented (`SampleAPI.hpp/cpp`, 740 lines) |
| **Audio preview** | Not implemented | Chunked WAV streaming via `?preview=` |
| **PSRAM reload** | Documented as future | Implemented: Disable DSP → Refresh → Enable DSP |
| **Bank numbering** | 0-based (00–07) | 1-based (01–08) |
| **Folder sizes** | Not shown | `(N files · XX.X MB)` in pool tree |
| **Dynamic banks** | Fixed 8 banks | Add/delete banks (up to 8) |
| **Pool icons** | Orange folder color | Neutral-400 (theme-consistent) |
| **License headers** | None | LGPL 3.0 in all source files |
| **sample-manager.js** | ~1316 lines | ~1600 lines |
| **samples.html** | ~647 lines | ~657 lines |
| **dev-server.js** | ~400 lines | ~406 lines |
| **Documentation** | WebUI-focused, firmware TBD | Full stack: WebUI + firmware + API + deployment |
