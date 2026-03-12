# TBD-16 Sample Manager — Implementation Guide

> **Version:** 1.0  
> **Date:** 2026-02-25  
> **Status:** WebUI implemented, dev server ready, firmware API endpoints pending  
> **Reference:** [CONCEPT-SAMPLE-MANAGER-V1.md](../sample_rom/sample_manager/CONCEPT-SAMPLE-MANAGER-V1.md)

---

## Table of Contents

1. [Overview](#1-overview)
2. [File Inventory](#2-file-inventory)
3. [Architecture](#3-architecture)
4. [WebUI Features](#4-webui-features)
5. [Development Server](#5-development-server)
6. [Shoelace Bundle](#6-shoelace-bundle)
7. [API Contract](#7-api-contract)
8. [Code Structure — sample-manager.js](#8-code-structure--sample-managerjs)
9. [Code Structure — samples.html](#9-code-structure--sampleshtml)
10. [Testing Locally](#10-testing-locally)
11. [Deploying to Device](#11-deploying-to-device)
12. [What's Left — Firmware API](#12-whats-left--firmware-api)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Overview

The Sample Manager is a browser-based tool for managing audio samples on the
TBD-16 synthesizer module. It replaces the previous Python script + SD card
workflow with a single web page that handles:

- **Upload** — drop audio files (WAV/MP3/AIFF/OGG/FLAC), convert client-side to
  44.1 kHz / 16-bit / mono PCM WAV, upload to device
- **Browse** — view all samples on the SD card in a folder tree
- **Organize** — create Kits with named Banks (KICK, SNARE, HIHAT, etc.),
  drag samples from the Pool into Bank slots
- **Edit** — rename samples, delete samples, reorder slots within Banks
- **Preview** — click play to audition any sample via the browser's audio engine

The UI uses [Shoelace Web Components](https://shoelace.style/) for the component
library (dark theme) and vanilla JavaScript — no build step required.

---

## 2. File Inventory

### New Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `sdcard_image/www/samples.html` | 400 | Main HTML page — layout, styles, DOM structure |
| `sdcard_image/www/js/sample-manager.js` | 1315 | Complete client-side application logic |
| `tools/dev-server.js` | 301 | Node.js development server with mock API |
| `sdcard_image/www/shoelace/` | ~11 MB | Self-hosted Shoelace 2.20.1 CDN bundle |
| `docs/sample-manager-implementation.md` | this file | Implementation documentation |

### Shoelace Bundle Contents

```
sdcard_image/www/shoelace/
├── shoelace-autoloader.js      ← ES module autoloader (lazy-loads components)
├── shoelace.js                 ← Full bundle (not used — autoloader preferred)
├── themes/
│   ├── dark.css                ← Dark theme (used)
│   └── light.css               ← Light theme (available)
├── components/                 ← 58 component entry points (loaded on demand)
│   ├── split-panel/
│   ├── tree/
│   ├── dialog/
│   ├── button/
│   └── ...
├── chunks/                     ← 269 shared code chunks
└── assets/icons/               ← 2052 Bootstrap Icons SVGs
```

### Existing Files (Not Modified)

| File | Role |
|------|------|
| `sdcard_image/www/js/Sortable.min.js` | Drag-and-drop reordering (already existed) |
| `sample_rom/tbdsamples/sample_rom.jsn` | Master kit index (read by dev server) |
| `sample_rom/tbdsamples/def_smp.jsn` | Default kit descriptor (read by dev server) |
| `sample_rom/tbdsamples/**/*.wav` | 158 sample WAV files (scanned by dev server) |

---

## 3. Architecture

```
┌──────────────────────────────────────────────────┐
│  Browser                                          │
│                                                   │
│  samples.html                                     │
│  ├── Shoelace dark theme CSS                      │
│  ├── Shoelace autoloader (ES modules)             │
│  ├── Sortable.min.js (drag-and-drop)              │
│  └── sample-manager.js                            │
│       ├── Client-side WAV conversion pipeline     │
│       ├── API client (fetch / XHR)                │
│       ├── Upload queue manager                    │
│       ├── Audio preview (AudioContext)             │
│       ├── Kit / Bank state management             │
│       ├── UI rendering (Pool tree, Bank cards)    │
│       └── Event handlers (drop, drag, dialogs)    │
│                                                   │
│              │  HTTP / JSON / binary              │
└──────────────┼────────────────────────────────────┘
               │
┌──────────────┼────────────────────────────────────┐
│  Device (ESP32-P4) or Dev Server (Node.js)        │
│              ▼                                     │
│  GET  /api/v1/samples/list    → file listing      │
│  POST /api/v1/samples/upload  → receive WAV       │
│  POST /api/v1/samples/manage  → rename/delete/etc │
│  POST /api/v1/samples/reload  → reload PSRAM      │
│                                                   │
│  Static files: /sdcard/www/ (device)              │
│            or: sdcard_image/www/ (dev server)     │
└───────────────────────────────────────────────────┘
```

### Data Flow

1. **Page load** → `init()` → `fetchSampleList()` → `GET /api/v1/samples/list`
2. API returns `{ files, kits, active_kit_entries, capacity }`
3. JS populates `state` object → renders Pool tree (left) and Kit editor (right)
4. **Upload**: User drops files → `AudioContext.decodeAudioData()` → `encodeWAV()`
   → `POST /api/v1/samples/upload` (raw binary via XHR with progress)
5. **Organize**: Drag from Pool → drop on Bank → `addEntryToBank()` → `saveKit()`
   → `POST /api/v1/samples/manage { action: 'updateBank' }`
6. **Rename/Delete**: Click icon → Shoelace dialog → API call → refresh

---

## 4. WebUI Features

### Left Panel — Sample Pool

| Feature | Implementation |
|---------|---------------|
| **Drop Zone** | Accepts WAV/MP3/AIFF/OGG/FLAC files via drag-and-drop or file picker |
| **Client-side conversion** | `AudioContext.decodeAudioData()` → resample to 44.1k → mono mixdown → 16-bit PCM WAV encoding |
| **Upload queue** | Visual queue with per-file progress bars, status badges (Queued/Converting/Uploading/Done/Error) |
| **Target folder selector** | `<sl-select>` populated from API folder list + defaults (`drums/user`, `drums/factory`, `other`) |
| **File tree** | Hierarchical `<sl-tree>` with folder icons, expandable nodes, file entries showing name + duration |
| **Per-file actions** | Preview (play), Rename (dialog), Delete (confirm dialog) — via `<sl-icon-button>` |
| **Draggable files** | Each file in the tree is `draggable="true"` with `application/x-tbd-sample` data transfer |
| **New folder** | Dialog to create subfolders (e.g., `drums/my_samples`) |

### Right Panel — Kit Editor

| Feature | Implementation |
|---------|---------------|
| **Kit selector** | `<sl-select>` populated from `sample_rom.jsn` kit names |
| **New Kit** | Dialog to create a new kit, optionally cloning the active kit |
| **Reload PSRAM** | Button to trigger `POST /api/v1/samples/reload` — reloads samples into PSRAM |
| **View toggle** | Switch between **Banked view** (8 named bank cards) and **Flat view** (sequential list) |
| **Bank cards** | 8 collapsible cards (KICK, SNARE, HIHAT CL, HIHAT OP, CLAP, RIM, PERC, OTHER) |
| **Bank customization** | Inline-editable bank names, color-coded headers |
| **Slot management** | Each slot shows sample name + duration, with Preview/Edit/Remove actions |
| **Drag-and-drop reorder** | Sortable.js handles within-bank slot reordering |
| **Pool → Bank drop** | Drop samples from left panel onto any bank body |
| **Add sample button** | Opens a searchable sample picker dialog |
| **Auto-save** | Kit descriptor is saved to device after every change |

### Global Features

| Feature | Implementation |
|---------|---------------|
| **Capacity bar** | `<sl-progress-bar>` in header showing PSRAM usage (bytes → MB, color-coded) |
| **Status bar** | Footer showing connection status + total file count |
| **Toast notifications** | Shoelace `<sl-alert>` toasts for success/warning/error feedback |
| **Loading overlay** | Full-screen overlay with spinner for PSRAM reload |
| **Dark theme** | Shoelace `sl-theme-dark` class on `<html>`, all CSS uses Shoelace design tokens |

---

## 5. Development Server

### What It Is

`tools/dev-server.js` is a zero-dependency Node.js HTTP server that:

1. **Serves static files** from `sdcard_image/www/` with correct MIME types
   (critical for ES module imports — Shoelace requires `application/javascript`)
2. **Provides mock API** endpoints that mirror the real device API
3. **Scans real sample data** from `sample_rom/tbdsamples/` for realistic responses
4. **Logs requests** to the terminal (excluding chunk/icon noise)

### Prerequisites

- **Node.js** 18+ (or any version supporting ES2020+)
- No npm install needed — zero external dependencies

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

### Open in Browser

After starting, open **http://localhost:3000/samples.html** in any modern browser
(Chrome, Firefox, Safari, Edge). The VS Code Simple Browser also works.

> **Important:** Do NOT open `samples.html` directly as `file://`. ES modules
> (required by Shoelace) are blocked by CORS over the `file://` protocol.

### Mock API Behavior

| Endpoint | Mock Behavior |
|----------|--------------|
| `GET /api/v1/samples/list` | Scans `sample_rom/tbdsamples/` for WAV files, reads `sample_rom.jsn` + active kit descriptor. Returns real file counts and sizes. |
| `POST /api/v1/samples/upload` | Accepts binary body, logs filename/path/size to console, stores in memory (not written to disk). Shows up in subsequent list calls. |
| `POST /api/v1/samples/manage` | Logs the action to console. `updateBank` updates the in-memory kit entries. `rename`/`delete`/`createKit`/`createFolder` are logged but do not modify the filesystem. |
| `POST /api/v1/samples/reload` | Logs "Reload PSRAM" and returns `{ ok: true }`. |

### Request Logging

The server logs all requests except Shoelace chunk and icon requests (to reduce
noise). Example output:

```
  14:33:50 GET /samples.html
  14:33:50 GET /shoelace/themes/dark.css
  14:33:50 GET /shoelace/shoelace-autoloader.js
  14:33:50 GET /js/Sortable.min.js
  14:33:50 GET /js/sample-manager.js
  14:33:50 GET /api/v1/samples/list
  14:33:50 GET /shoelace/components/split-panel/split-panel.js
  14:33:50 GET /shoelace/components/icon/icon.js
  ...
```

### Limitations

- **Uploads are in-memory only** — files are not written to disk
- **Renames and deletes are logged** but don't modify the real sample files
- **No audio preview from device** — browser previews would need the actual WAV
  file served from the API (not implemented in mock; works on real device)
- **Kit saves update in-memory state** — changes are lost when the server restarts

---

## 6. Shoelace Bundle

### Version

Shoelace **2.20.1** — downloaded from npm `@shoelace-style/shoelace` CDN build.

### How It Works

The **autoloader** (`shoelace-autoloader.js`) watches the DOM via
`MutationObserver`. When it sees an unregistered `sl-*` element, it dynamically
imports the corresponding component from `components/<name>/<name>.js`, which in
turn imports shared chunks from `chunks/`.

**Base path detection:** The autoloader finds its own `<script>` tag in the DOM,
extracts the directory from its `src` attribute (`/shoelace/`), and uses that as
the base for all component imports.

### Components Used

| Component | Where Used |
|-----------|-----------|
| `sl-split-panel` | Main left/right layout |
| `sl-tree` + `sl-tree-item` | File browser tree |
| `sl-button` | Actions, toolbar buttons |
| `sl-icon-button` | Per-item action buttons |
| `sl-icon` | File/folder/action icons (Bootstrap Icons) |
| `sl-select` + `sl-option` | Kit selector, target folder |
| `sl-dialog` | Rename, Delete, New Kit, New Folder, Sample Picker |
| `sl-input` | Dialog inputs |
| `sl-checkbox` | Clone checkbox in New Kit dialog |
| `sl-switch` | Bank/Flat view toggle |
| `sl-progress-bar` | Capacity bar, upload progress |
| `sl-spinner` | Loading states |
| `sl-tooltip` | Button tooltips |
| `sl-alert` | Toast notifications |
| `sl-badge` | Upload queue status |

### Size Considerations

The full Shoelace bundle is ~11 MB uncompressed. However:

- The `create_sd_archive.sh` script gzips all files for the device — typical
  compression is 60-70%, so ~3-4 MB on the SD card
- The autoloader only fetches components that are actually used (~16 of 58)
- Icons are loaded on demand (only the ~15 used icons are fetched)

---

## 7. API Contract

These are the 4 REST API endpoints the WebUI expects. The dev server mocks them;
the real firmware needs to implement them in `RestServer.cpp`.

### `GET /api/v1/samples/list`

Returns all WAV files on the SD card and current kit state.

**Response:**
```json
{
  "files": [
    { "name": "BD0", "path": "drums/factory", "size": 22976 },
    { "name": "cw_amen01_175", "path": "drums/loops", "size": 489476 }
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

**Field details:**
- `files[].name` — filename stem (no `.wav` extension)
- `files[].path` — relative path under `/sdcard/tbdsamples/`
- `files[].size` — file size in bytes (including WAV header)
- `kits` — contents of `sample_rom.jsn` (subset)
- `active_kit_entries` — the parsed kit descriptor JSON array
- `capacity.active_bank_bytes` — sum of `nsamples × 2` for all entries

### `POST /api/v1/samples/upload`

Upload a single WAV file to the SD card.

**Query parameters:**
- `path` — target folder (e.g., `drums/user`)
- `filename` — filename stem (e.g., `my_kick`)

**Body:** Raw WAV binary (`Content-Type: application/octet-stream`)

**Response:**
```json
{ "ok": true, "name": "my_kick", "path": "drums/user", "size": 45678 }
```

### `POST /api/v1/samples/manage`

Multipurpose management endpoint. Action is determined by `body.action`.

**Actions:**

| Action | Body | Effect |
|--------|------|--------|
| `rename` | `{ action, path, oldName, newName }` | Rename a WAV file on SD |
| `delete` | `{ action, path, filename }` | Delete a WAV file from SD |
| `updateBank` | `{ action, bankIndex, entries }` | Save kit descriptor to SD |
| `createKit` | `{ action, name, entries }` | Create new kit descriptor |
| `createFolder` | `{ action, path }` | Create directory on SD |

**Response:** `{ "ok": true }`

### `POST /api/v1/samples/reload`

Trigger PSRAM reload from the active kit descriptor.

**Body:** `{}` (empty JSON)

**Response:** `{ "ok": true }`

---

## 8. Code Structure — sample-manager.js

The file is organized into clearly separated sections:

| Section | Lines | Purpose |
|---------|-------|---------|
| **Configuration** | 1–65 | Constants (`API_BASE`, `SAMPLE_RATE`, etc.), state object, default bank definitions |
| **Helpers** | 65–90 | `formatDuration()`, `formatBytes()`, `fileDuration()`, `nsamples()` |
| **WAV Encoding** | 90–175 | `writeString()`, `encodeWAV()`, `convertToWAV()`, `sanitizeFilename()` |
| **API Client** | 175–270 | `apiGet()`, `apiPost()`, `fetchSampleList()`, `uploadSample()`, `renameSample()`, `deleteSample()`, `updateKitDescriptor()`, `createKitOnDevice()`, `reloadPSRAM()` |
| **Upload Queue** | 270–385 | `processUploadQueue()`, `queueFilesForUpload()` — sequential processing with progress |
| **Audio Preview** | 385–400 | `playPreview()`, `stopPreview()` — AudioContext-based playback |
| **Kit/Bank Logic** | 400–480 | `getBankEntries()`, `addEntryToBank()`, `removeEntryFromBank()`, `compactBank()`, `reorderBankSlots()`, `getKitForSave()`, `saveKit()`, `calculateUsedBytes()` |
| **Toast Notifications** | 480–520 | `toast()`, `iconForVariant()`, `esc()` |
| **UI Rendering** | 520–760 | `updateCapacityBar()`, `renderUploadQueue()`, `renderPoolTree()`, `buildFolderTree()`, `renderTreeNode()`, `updateFolderOptions()`, `renderKitSelector()`, `renderKitEditor()`, `renderBankedView()`, `renderFlatView()`, `renderBankSlots()` |
| **Sortable.js** | 760–800 | `setupBankSortables()` — Sortable instances for each bank body |
| **Pool → Bank Drag** | 800–855 | `setupPoolDragEvents()` — dragstart on pool files, drop on bank bodies |
| **Drop Zone** | 855–930 | `setupDropZone()` — file drop/browse → queue for upload |
| **Event Handlers** | 930–990 | `setupPoolActions()`, `setupKitActions()`, `setupToolbar()` — delegated click handlers |
| **Dialogs** | 990–1260 | `setupRenameDialog()`, `setupDeleteDialog()`, `setupNewKitDialog()`, `setupNewFolderDialog()`, `setupSamplePicker()` |
| **Initialization** | 1260–1316 | `init()` — wires everything together, fetches data, renders UI |

### State Management

All application state lives in a single `state` object:

```javascript
const state = {
  files: [],            // Pool files from API: [{ name, path, size }]
  folders: [],          // Unique folder paths derived from files
  kits: { ... },        // Kit metadata from sample_rom.jsn
  kitEntries: [],       // Active kit descriptor entries (may have nulls for empty slots)
  banks: [...],         // Bank metadata: [{ name, color, collapsed }]
  capacity: { ... },    // PSRAM usage
  viewMode: 'banked',   // 'banked' | 'flat'
  targetFolder: '...',  // Upload target
  uploadQueue: [],      // Upload queue items
  // ... audio context, dialog contexts, sortable instances
};
```

### Bank Addressing

Banks are virtual groups within the flat `kitEntries` array:

```
Bank 0 (KICK):    kitEntries[0..31]
Bank 1 (SNARE):   kitEntries[32..63]
Bank 2 (HIHAT CL): kitEntries[64..95]
...
Bank 7 (OTHER):   kitEntries[224..255]
```

This maps directly to the Rompler's `bank × 32 + slice` addressing.

---

## 9. Code Structure — samples.html

The HTML is a self-contained page with inline CSS. Structure:

| Section | Description |
|---------|------------|
| **Head** | Shoelace CSS theme import, autoloader script, inline `<style>` with all CSS |
| **Header** | Title + capacity progress bar |
| **Main** | `<sl-split-panel position="40">` with left (Pool) and right (Kit Editor) panels |
| **Footer** | Connection status + file count |
| **Dialogs** | 5 `<sl-dialog>` elements: Rename, Delete, New Kit, New Folder, Sample Picker |
| **Loading overlay** | Full-screen overlay with spinner for PSRAM reload |
| **Toast stack** | Fixed-position container for toast notifications |
| **Scripts** | Sortable.min.js + sample-manager.js (non-module scripts) |

### CSS Design Tokens

All colors, borders, radii, and fonts use Shoelace CSS custom properties
(e.g., `var(--sl-color-neutral-400)`, `var(--sl-border-radius-large)`) for
automatic dark/light theme support.

---

## 10. Testing Locally

### Quick Start

```bash
# 1. Start the dev server
node tools/dev-server.js

# 2. Open in browser
open http://localhost:3000/samples.html    # macOS
# or just navigate to the URL in any browser
```

### What You Can Test

| Feature | Works in Dev Server? | Notes |
|---------|---------------------|-------|
| Page rendering & layout | ✅ | Full Shoelace components |
| File tree browsing | ✅ | Shows 158 real samples from sample_rom |
| Kit selector | ✅ | Shows "Default" and "A4 Dub" kits |
| Bank card display | ✅ | 8 bank cards with real sample entries |
| Drag-and-drop reorder | ✅ | Sortable.js within banks |
| Pool → Bank drag | ✅ | Drag from tree, drop on bank |
| View toggle (banked/flat) | ✅ | Switches between views |
| Upload (file conversion) | ✅ | Files converted client-side, uploaded to mock |
| Rename dialog | ✅ | Opens dialog, sends mock API call |
| Delete dialog | ✅ | Opens dialog, sends mock API call |
| New Kit dialog | ✅ | Creates kit in memory |
| New Folder dialog | ✅ | Sends mock API call |
| Sample Picker dialog | ✅ | Searchable list of pool files |
| Capacity bar | ✅ | Shows real PSRAM usage from kit entries |
| Toast notifications | ✅ | Shoelace alerts |
| Audio preview | ⚠️ Partial | Would need WAV file serving from API |
| PSRAM reload | ✅ Mock | Logs to console, returns success |

### Testing Audio Preview

Audio preview attempts to fetch
`/api/v1/samples/preview?path=<path>&name=<name>`. This endpoint is not
implemented in the dev server. To test preview locally, you could add a handler
that serves WAV files from `sample_rom/tbdsamples/`.

---

## 11. Deploying to Device

### Static Files

The `create_sd_archive.sh` script automatically handles packaging:

```bash
./create_sd_archive.sh
```

This will:
1. Copy `sdcard_image/www/` contents to the archive
2. Gzip all files (HTML, CSS, JS, SVG) for efficient serving
3. The ESP32 serves gzipped files with appropriate `Content-Encoding: gzip` headers

### New Files to Deploy

```
/sdcard/www/samples.html              ← Main page
/sdcard/www/js/sample-manager.js      ← Application logic
/sdcard/www/shoelace/                 ← Shoelace bundle (gzipped)
    themes/dark.css
    shoelace-autoloader.js
    components/**
    chunks/**
    assets/icons/**
```

### Linking from Existing UI

*(Future work — not implemented in this iteration)*

Add a navigation link from `main.html` to `samples.html`:
```html
<a href="samples.html">Sample Manager</a>
```

---

## 12. What's Left — Firmware API

The WebUI is complete. The remaining work is implementing the 4 REST API
endpoints on the ESP32-P4 firmware side in `RestServer.cpp`.

### Endpoints to Implement

| Priority | Endpoint | Description |
|----------|----------|-------------|
| **P0** | `GET /api/v1/samples/list` | Scan `/sdcard/tbdsamples/` recursively, read `sample_rom.jsn`, read active kit descriptor |
| **P0** | `POST /api/v1/samples/upload` | Write binary body to `/sdcard/tbdsamples/<path>/<filename>.wav` |
| **P1** | `POST /api/v1/samples/manage` | Handle rename (`rename()`), delete (`unlink()`), updateBank (write JSON), createKit, createFolder (`mkdir()`) |
| **P1** | `POST /api/v1/samples/reload` | Call `ctagSampleRom::RefreshDataStructure()` |

### Firmware Implementation Notes

- **4 URI handler slots available** (16 of 20 used currently)
- **File scanning**: Use `opendir()`/`readdir()` recursively on `/sdcard/tbdsamples/`
- **Upload**: Read body via `httpd_req_recv()` in chunks (existing pattern in
  `set_configuration_post_handler`), write to SD card via `fopen()`/`fwrite()`
- **JSON responses**: Use `cJSON` (already in firmware) or direct string building
- **PSRAM reload**: `DisablePluginProcessing()` → refresh → `EnablePluginProcessing()`

---

## 13. Troubleshooting

### Shoelace Components Not Rendering (raw HTML visible)

**Cause:** The `components/` directory is missing from `sdcard_image/www/shoelace/`.

**Fix:** Ensure the Shoelace CDN bundle includes `components/`, `chunks/`, and
`themes/` directories. The autoloader tries to load
`/shoelace/components/<name>/<name>.js` for each `sl-*` element.

Re-install if needed:
```bash
cd /tmp && mkdir shoelace-dl && cd shoelace-dl
npm init -y && npm install @shoelace-style/shoelace@2.20.1
cp -r node_modules/@shoelace-style/shoelace/cdn/components \
      /path/to/sdcard_image/www/shoelace/components
```

### Page Opens but Shows "Could not connect to device"

**Cause:** The dev server is not running, or it's on a different port.

**Fix:** Start `node tools/dev-server.js` and open `http://localhost:3000/samples.html`.

### Opened via file:// Protocol — Nothing Works

**Cause:** ES modules are blocked by CORS over `file://`. Shoelace's autoloader
uses `import()` which requires `application/javascript` MIME type from an HTTP server.

**Fix:** Always use the dev server (`http://localhost:3000/...`), never `file://`.

### "Module" MIME Type Errors in Browser Console

**Cause:** Server is not setting `Content-Type: application/javascript` for `.js`
files. The dev server handles this correctly. The ESP32 firmware needs to set
this header too (or rely on gzip serving which typically handles it).

### Upload Fails or Hangs

**Cause (dev server):** The mock upload stores data in memory but doesn't write
to disk. This is expected behavior.

**Cause (device):** Check that the SD card has free space and the upload endpoint
is implemented correctly.

---

## Appendix: Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Shoelace over Onsen UI** | Modern, tree-shakeable, dark theme built-in, better component set (tree, split-panel, dialog). Onsen UI is mobile-first and doesn't have tree/split-panel. |
| **Autoloader over full bundle** | Autoloader lazy-loads only the ~16 components we use, reducing initial payload from ~500 KB to ~100 KB JS |
| **Vanilla JS over framework** | No build step, works on ESP32 without Node/Webpack. Matches existing drumrack.js pattern. |
| **Client-side conversion** | ESP32 has no spare cycles for audio format conversion. Browser `AudioContext.decodeAudioData()` handles WAV/MP3/AIFF/OGG/FLAC natively with zero server code. |
| **Single state object** | Simple, debuggable. Same pattern as drumrack.js. No framework overhead. |
| **Separate page (samples.html)** | Avoids touching the working Onsen UI code. Clean separation. Can be linked from existing UI later. |
| **4 API endpoints** | Exactly fits the 4 remaining ESP32 URI handler slots. Combined manage endpoint handles rename/delete/updateBank/createKit/createFolder via `action` field. |
