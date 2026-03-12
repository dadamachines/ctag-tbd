# TBD-16 Unified WebUI — Implementation Plan

```
Version  : 1.0
Date     : 2026-02-27
Status   : Plan — ready for implementation
License  : LGPL 3.0 (dadamachines additions)
Copyright: (c) 2014-2026 Johannes Elias Lohbihler for dadamachines
Branch   : feature/webui-general-ui-rework
Prior Art: prototyping/WEBUI-SYNTHESIS.md (superseded by this document)
           prototyping/sample-manager-implementation-v4.md (current Sample Manager)
           prototyping/MACRO-PRESET-SPEC.md (macro/Kit spec — future phases)
```

---

## Table of Contents

1.  [Goals & Principles](#1-goals--principles)
2.  [What We Have Today](#2-what-we-have-today)
3.  [Target Architecture](#3-target-architecture)
4.  [Application Shell & Routing](#4-application-shell--routing)
5.  [Shared Header & Navigation](#5-shared-header--navigation)
6.  [View 1 — Plugin Management](#6-view-1--plugin-management)
7.  [View 2 — Sample Manager](#7-view-2--sample-manager)
8.  [Shared Infrastructure](#8-shared-infrastructure)
9.  [Plugin Parameter Renderer](#9-plugin-parameter-renderer)
10. [Preset Management](#10-preset-management)
11. [System Configuration](#11-system-configuration)
12. [Favorites](#12-favorites)
13. [Dev Server Evolution](#13-dev-server-evolution)
14. [File Structure](#14-file-structure)
15. [Build & Deploy](#15-build--deploy)
16. [Firmware Changes Required](#16-firmware-changes-required)
17. [Implementation Phases](#17-implementation-phases)
18. [Migration Strategy](#18-migration-strategy)
19. [Constraints & Risks](#19-constraints--risks)
20. [Open Questions](#20-open-questions)

---

## 1. Goals & Principles

### Primary Goals

1. **Single-page, two-view application** — Plugin Management and Sample Manager are the two top-level views, switched via header navigation. No Onsen page transitions. No full-page reloads.
2. **Replace Onsen UI + jQuery entirely** — move to vanilla JS + Shoelace Web Components (already proven in the Sample Manager).
3. **Plugin editing stays in-view** — selecting, configuring, and switching plugins all happen in the Plugin Management view without page changes. Both Slot A and Slot B are always visible (reference: attached prototype screenshots).
4. **Reuse Sample Manager code and patterns** — the working Sample Manager (2,593 lines, battle-tested on device) sets the architectural standard. Same `state` object pattern, same `render*()` approach, same Shoelace components, same toast/dialog systems.
5. **Ship incrementally** — each phase produces a working, deployable artifact. The old UI remains accessible during transition.

### Design Principles

| Principle | Rationale |
|-----------|-----------|
| **No framework** | Vanilla JS + Shoelace. Proven by Sample Manager. Minimal bundle size for ESP32 serving. |
| **No build step for development** | Serve from SD card or dev server directly. Cache-busted `?v=N` query strings for versioning. |
| **Dark theme first** | Shoelace `sl-theme-dark` as default. Light mode toggle preserved. |
| **Elektron / Ableton Move aesthetics** | Compact, professional, dark. Established in Sample Manager. |
| **Hardware UI is primary** | The WebUI is a companion. MIDI mapping accessible via a dedicated section. |
| **Knobs over sliders** | Plugin parameters default to knob display (via `webaudio-controls` or CSS-styled rotary controls), not sliders. Sliders reserved for ranges where linear drag is more natural (e.g., volume, pan). |

---

## 2. What We Have Today

### Working (keep as-is, integrate)

| Asset | Status | Notes |
|-------|--------|-------|
| `samples.html` | ✅ Production | 852 lines, Shoelace, dark theme |
| `js/sample-manager.js` | ✅ Production | 2,593 lines, vanilla JS, all Sample Manager logic |
| `js/shoelace-bundle.js` | ✅ Production | 52 KB gzipped, 15 components + inline icons |
| `js/Sortable.min.js` | ✅ Production | 9 KB gzipped, drag-and-drop |
| `shoelace/themes/dark.css` | ✅ Production | Shoelace dark theme CSS |
| `shoelace/assets/icons/*.svg` | ✅ Production | Bootstrap icon SVGs |
| `tools/dev-server.js` | ✅ Working | Mock API for Sample Manager endpoints |
| `main/SampleAPI.cpp` | ✅ Production | 951 lines, firmware Sample API |
| `main/RestServer.cpp` | ✅ Production | 746 lines, static file server + all v1 API handlers |

### Old UI (to be replaced)

| Asset | Status | Notes |
|-------|--------|-------|
| `index.html` | ❌ Replace | Onsen navigator shell |
| `main.html` | ❌ Replace | Onsen dashboard — plugin selection, favorites |
| `edit.html` | ❌ Replace | Onsen plugin parameter editor |
| `load.html` | ❌ Replace | Onsen preset loader |
| `save.html` | ❌ Replace | Onsen preset saver |
| `config.html` | ❌ Replace | Onsen system configuration |
| `fav.html` | ❌ Replace | Onsen favorite editor |
| `drumrack.html` | ❌ Replace | Standalone DrumRack page (jQuery) |
| `js/drumrack.js` | ❌ Replace | 1,202 lines jQuery DrumRack logic |
| `js/onsenui.min.js` | ❌ Remove | Onsen UI runtime |
| `js/jquery-3.4.1.min.js` | ❌ Remove | jQuery |
| `js/ajaxq.js` | ❌ Remove | jQuery AJAX queue plugin |
| `js/jszip.min.js` | ⚠️ Keep if needed | Used for backup/restore (config page) |
| `css/onsen*.css` | ❌ Remove | Onsen stylesheets |
| `css/drumrack.css` | ❌ Remove | DrumRack custom styles |
| `css/sample-rom.css` | ❌ Remove | Old sample ROM styles |

### REST API (v1 — no changes, fully preserved)

All 15+ existing endpoints remain unchanged. The new WebUI calls the same `/api/v1/*` endpoints.

---

## 3. Target Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  BROWSER                                                             │
│                                                                      │
│  index.html (app shell)                                              │
│    ├── <header>  Shared navigation: [Plugins] [Samples] + status     │
│    │                                                                 │
│    ├── <main id="view-plugins">   ← Plugin Management View          │
│    │     ├── Sidebar (plugin browser, collapsible)                   │
│    │     ├── Slot A panel (plugin info + param editor)               │
│    │     ├── Slot B panel (plugin info + param editor)               │
│    │     └── Presets sidebar (collapsible, right)                    │
│    │                                                                 │
│    ├── <main id="view-samples">   ← Sample Manager View             │
│    │     ├── Pool panel (left, file browser)                         │
│    │     ├── Kit editor panel (right, banks + slots)                 │
│    │     └── Transfer bar (bottom)                                   │
│    │                                                                 │
│    └── <footer> Status bar + debug toggle                            │
│                                                                      │
│  js/app.js           ← App shell, routing, shared state              │
│  js/plugin-manager.js ← Plugin view logic                            │
│  js/sample-manager.js ← Sample view logic (existing, adapted)        │
│  js/shared.js         ← Reusable utilities (toast, API, esc, etc.)   │
│  js/param-renderer.js ← Schema-driven plugin parameter rendering     │
│  js/shoelace-bundle.js ← Shoelace components (existing)              │
│  js/Sortable.min.js   ← Drag-and-drop (existing, Sample Manager)    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
        │
        │  USB NCM / WiFi
        │  192.168.4.1
        ▼
┌──────────────────────────────────────────────────────────────────────┐
│  ESP32-P4                                                            │
│                                                                      │
│  RestServer.cpp → esp_httpd                                          │
│    GET  /api/v1/getPlugins        → SPManager                        │
│    GET  /api/v1/getActivePlugin/* → SPManager                        │
│    GET  /api/v1/getPluginParams/* → SPManager                        │
│    GET  /api/v1/setActivePlugin/* → SPManager                        │
│    GET  /api/v1/setPluginParam/*  → SPManager                        │
│    GET  /api/v1/getPresets/*      → SPManager                        │
│    GET  /api/v1/loadPreset/*      → SPManager                        │
│    GET  /api/v1/savePreset/*      → SPManager                        │
│    GET  /api/v1/getPresetData/*   → SPManager                        │
│    POST /api/v1/setPresetData/*   → SPManager                        │
│    POST /api/v1/favorite*         → SPManager                        │
│    GET  /api/v1/getConfiguration  → SPManager                        │
│    POST /api/v1/setConfiguration  → SPManager                        │
│    GET  /api/v1/getIOCaps         → SPManager                        │
│    GET  /api/v1/reboot            → esp_restart()                    │
│    GET  /api/v1/samples*          → SampleAPI (list, preview)        │
│    POST /api/v1/samples*          → SampleAPI (upload, manage)       │
│    GET  /*                        → static files (/sdcard/www/)      │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 4. Application Shell & Routing

### Single HTML Entry Point

The new `index.html` is the only HTML page. It contains:

1. **Shared `<head>`** — Shoelace CSS, shared styles, component bundle
2. **Shared `<header>`** — navigation tabs, status, storage bar, theme toggle
3. **Two `<main>` sections** — `#view-plugins` and `#view-samples`, toggled by display
4. **Shared `<footer>`** — connection status, CPU/memory, debug panel toggle
5. **Shared dialogs** — system config dialog, toast stack
6. **Script tags** — load all JS files with `defer`

### View Switching (Client-Side Routing)

No hash-routing or history API needed. Simple show/hide:

```js
function switchView(viewId) {
  document.querySelectorAll('.app-view').forEach(v => v.classList.toggle('active', v.id === viewId));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.view === viewId));
  // Lazy-init views on first switch
  if (viewId === 'view-samples' && !state.samplesInitialized) {
    initSampleManager();
    state.samplesInitialized = true;
  }
}
```

Views are **lazy-initialized** — the Sample Manager only fetches data and sets up event handlers when the user first navigates to it. The Plugin Manager initializes on page load (it's the default view).

### URL State

Optional: use `?view=samples` or `?view=plugins` query parameter so refreshing preserves the current view. No hash-based routing needed.

---

## 5. Shared Header & Navigation

The header is the primary unifying element. Both views share it.

```
┌────────────────────────────────────────────────────────────────────┐
│  TBD-16    [▪ Plugins]  [▪ Samples]        ● Connected    🌙 ⚙    │
│            ─────────── active tab                          │  │    │
│                                                     theme  config │
└────────────────────────────────────────────────────────────────────┘
```

### Header Elements

| Element | Purpose | Notes |
|---------|---------|-------|
| **Logo/Title** | "TBD-16" | Links to Plugin view (home) |
| **Nav Tabs** | `Plugins` / `Samples` | Toggle between views. Active tab highlighted. |
| **Status indicator** | "● Connected" / "● Offline" | Green/red dot + text. Shared connection state. |
| **SD Storage bar** | "14.2 / 29.3 GB (48%)" | Mini progress bar. Visible in both views. Fetched once. |
| **Theme toggle** | Moon/sun icon | Dark/light mode. Persisted in `localStorage`. |
| **Config button** | Gear icon | Opens system config dialog (overlay, not a page). |

### Connection State Management

Shared across views. A single polling mechanism checks device reachability:

```js
// Shared connection state
const connection = {
  status: 'connecting',  // 'connecting' | 'connected' | 'disconnected'
  retries: 0,
  maxRetries: 20,
  pollInterval: 3000,
};
```

When disconnected: dim the UI, show reconnection indicator, freeze controls. When reconnected: refresh data for the active view.

---

## 6. View 1 — Plugin Management

This is the main view. Based on the prototype screenshots, it has a three-column layout:

```
┌──────────────────────────────────────────────────────────────────────┐
│  HEADER (shared)                                                     │
├──────────┬───────────────────────┬──────────────────┬────────────────┤
│ Plugins  │  SLOT A               │  SLOT B          │  Presets    >  │
│          │  Subbotnik            │  Bit Crusher     │                │
│ ◀ collapse│                      │                  │  No presets    │
│          │  [Presets] [Replace]  │  [Presets] [Repl]│  saved yet.   │
│ Search.. │                       │                  │                │
│ ──────── │  Mono   Synth_voice   │  Mono   Effect   │                │
│ EFFECTS  │  Complex synth voice..│  Bit crushing and│                │
│ Antique  │                       │  sample rate...  │                │
│ Crushendo│  Plugin Parameters    │                  │                │
│ CDelay   │  ┌─ PITCH ──────────┐ │  Plugin Params   │                │
│ CStrip   │  │ 🎛 Pitch A 64000 │ │  ┌─ ENVELOPE ──┐ │                │
│ ...      │  │ 🎛 Tune A  -5e+0 │ │  │ Eg Bc Amt   │ │                │
│          │  │ 🎛 Pitch B 64000 │ │  │ Eg Bc Att   │ │                │
│          │  │ 🎛 Tune B  5     │ │  │ ...         │ │                │
│          │  └──────────────────┘ │  └─────────────┘ │                │
│          │  ┌─ MODULATION ─────┐ │                  │                │
│          │  │ LfoDestination   │ │                  │                │
│          │  │ LfoType          │ │                  │                │
│          │  │ ...              │ │                  │                │
│          │  └──────────────────┘ │                  │                │
├──────────┴──────────┬────────────┴──────────────────┴────────────────┤
│ ● Connected  API: http://...  ● MIDI     │  CPU: 17%  Mem: 228/512  │
│                                           │  [▲ Slot A] [  Slot B]   │
└───────────────────────────────────────────┴──────────────────────────┘
```

### Layout Structure

| Section | Description |
|---------|-------------|
| **Plugin Sidebar** (left, collapsible) | Searchable list of all available plugins. Grouped by type (Effects, Synth_voice, etc.). Click to load into the focused slot. Shows Mono/Stereo badges. |
| **Slot A Panel** (center-left) | Active plugin header (name, type badges, description), action buttons (Presets, Replace), scrollable parameter editor. |
| **Slot B Panel** (center-right) | Same as Slot A. Shows "No Plugin Loaded" + "Add Plugin" button when empty. Disabled when Slot A has a stereo plugin. |
| **Presets Sidebar** (right, collapsible) | Preset list for the focused slot. Load, save, rename presets. |
| **Status Bar** (bottom) | Connection status, API URL, MIDI status, CPU/memory, slot focus tabs. |

### Slot Focus

The status bar has "Slot A" / "Slot B" tabs. The focused slot determines:
- Which slot the presets sidebar shows presets for
- Which slot clicking a plugin in the sidebar loads into
- Visual highlight on the focused slot panel

### Plugin Sidebar Behavior

- **Search**: `<sl-input>` with search icon, filters plugin list in real-time
- **Plugin list**: Fetched from `GET /api/v1/getPlugins`, cached in state
- **Badges**: `Mono` (blue) and `Stereo` (pink/red) inline badges
- **Categories**: Group header rows (EFFECTS, SYNTH_VOICE, etc.) from plugin `hint` field
- **Click to load**: Clicking a plugin calls `GET /api/v1/setActivePlugin/{ch}?id={pluginId}`
- **Collapse**: Chevron button toggles sidebar visibility. Panel resizes.

### Slot Panel State Machine

Each slot (A/B) has three states:

| State | Rendering |
|-------|-----------|
| **Empty** | "No Plugin Loaded" message + large "Add Plugin" button |
| **Loading** | Spinner overlay while plugin switches |
| **Active** | Plugin header + parameter editor (scrollable) |

### Stereo Plugin Handling

When Slot A loads a stereo plugin:
- Slot B panel shows "Stereo — Slot A occupies both channels" dimmed message
- Slot B controls are disabled
- Plugin sidebar shows slot selector dimmed for B

When Slot A loads a mono plugin:
- Slot B panel becomes interactive
- Both slots operate independently

---

## 7. View 2 — Sample Manager

The existing Sample Manager is preserved with minimal changes:

### Integration Changes

1. **Header removed from `samples.html`** → uses the shared app header instead
2. **Status text** → shared connection indicator
3. **Theme toggle** → shared in header
4. **Storage bar** → shared in header (visible in both views)
5. **Toast stack** → shared `#toast-stack` element
6. **Loading overlay** → shared

### Code Changes to `sample-manager.js`

The current `sample-manager.js` is a self-contained module. To integrate:

1. **`init()` becomes callable** — instead of auto-initializing on `DOMContentLoaded`, export an `initSampleManager()` function that the app shell calls on first navigation to the Samples view.
2. **`API_BASE` stays the same** — `/api/v1/samples` is unchanged.
3. **Shared utilities extracted** — `toast()`, `esc()`, `formatBytes()`, `applyTheme()` move to `shared.js`. Sample manager imports from there.
4. **DOM element IDs preserved** — all `#pool-panel`, `#kit-panel`, etc. IDs remain the same inside `#view-samples`.
5. **State remains independent** — the sample manager's `state` object stays separate from the plugin manager's state. No cross-contamination.

### Minimal Refactoring Approach

Rather than a rewrite, wrap the existing code:

```js
// sample-manager.js — add at the top
import { toast, esc, formatBytes, apiBase } from './shared.js';

// Replace DOMContentLoaded listener with:
export function initSampleManager() {
  // existing init() body
}
```

The Sample Manager HTML (panels, dialogs, transfer bar) moves into `#view-samples` inside `index.html`.

---

## 8. Shared Infrastructure

### Shared Module: `js/shared.js`

Extracted from sample-manager.js patterns, used by both views:

```js
// ── Constants ──
export const API_V1 = '/api/v1';

// ── HTML escaping ──
export function esc(str) { ... }

// ── Formatting ──
export function formatBytes(bytes) { ... }
export function formatDuration(samples, rate) { ... }

// ── API Client ──
export async function apiGet(url) { ... }
export async function apiPost(url, body) { ... }

// ── Toast Notifications ──
export function toast(message, variant, duration) { ... }

// ── Theme ──
export function applyTheme(theme) { ... }
export function setupThemeToggle(buttonEl) { ... }

// ── Connection Manager ──
export const connection = { status, retries, ... };
export function startConnectionMonitor(onConnect, onDisconnect) { ... }

// ── Dialog Helpers ──
export function showDialog(id) { ... }
export function hideDialog(id) { ... }
export function confirmDialog(id, message) { ... }  // returns Promise<boolean>
```

### Request Serialization

The old UI used `ajaxq.js` (jQuery plugin) for sequential AJAX. The new UI uses a simple `FetchQueue`:

```js
class FetchQueue {
  #queue = [];
  #running = false;
  
  async enqueue(fn) {
    return new Promise((resolve, reject) => {
      this.#queue.push({ fn, resolve, reject });
      this.#process();
    });
  }
  
  async #process() {
    if (this.#running) return;
    this.#running = true;
    while (this.#queue.length) {
      const { fn, resolve, reject } = this.#queue.shift();
      try { resolve(await fn()); } catch (e) { reject(e); }
    }
    this.#running = false;
  }
}

export const paramQueue = new FetchQueue();  // serializes param SET calls
```

Parameter changes are serialized (one at a time) to avoid overwhelming the ESP32. Reads (getPlugins, getPluginParams) can be concurrent but limited to 2-3 in flight.

---

## 9. Plugin Parameter Renderer

This is the core of the Plugin Management view. It replaces `edit.html`'s inline rendering and `drumrack.js`'s custom rendering with a single, schema-driven renderer.

### Input: Parameter Schema

From `GET /api/v1/getPluginParams/{ch}`, the API returns a tree:

```json
{
  "id": "Subbotnik",
  "params": [
    {
      "id": "pitch_group",
      "type": "group",
      "name": "PITCH",
      "params": [
        { "id": "PitchA", "type": "int", "name": "Pitch A", "min": 0, "max": 4095, "current": 64000 },
        { "id": "TuneA",  "type": "int", "name": "Tune A",  "min": -5, "max": 5, "current": -5 },
        ...
      ]
    },
    {
      "id": "ena_group",
      "type": "group",
      "name": "ENVELOPE",
      "params": [
        { "id": "EgBcEna", "type": "bool", "name": "Eg Bc Ena", "current": 1 },
        ...
      ]
    }
  ]
}
```

### Rendering Rules

| Schema Type | Rendered As |
|-------------|-------------|
| `group` | Collapsible `<sl-details>` section with group name header. Recursively renders child `params[]`. |
| `int` (small range, ≤16 values) | `<sl-select>` dropdown (for enum-like params like `device`, `LfoType`) |
| `int` (large range) | Knob control (default) or slider. Value display shows the raw value. |
| `bool` | `<sl-switch>` toggle with name label |

### Knob Controls

For knob rendering, use `webaudio-controls.js` as identified in the architecture docs:

```html
<webaudio-knob diameter="48" min="0" max="4095" value="2048"
  colors="#333;#e8772e;#e8772e" conv="x" tooltip="Pitch A: %s">
</webaudio-knob>
```

The orange color (`#e8772e`) matches the prototype screenshots. Knobs provide:
- Mouse drag (vertical) for value changes
- Scroll wheel support
- Double-click to reset
- Touch support
- MIDI learn (built-in to `webaudio-controls`)

### Rendering Function

```js
// param-renderer.js
export function renderParams(container, params, channel) {
  container.innerHTML = params.map(p => renderParam(p, channel)).join('');
  setupParamEvents(container, channel);
}

function renderParam(param, ch) {
  if (param.type === 'group') return renderGroup(param, ch);
  if (param.type === 'bool')  return renderBool(param, ch);
  if (param.type === 'int')   return renderInt(param, ch);
  return '';
}
```

### Parameter Change Flow

```
User drags knob → input event (debounced 80ms)
  → paramQueue.enqueue(() => apiGet(`/setPluginParam/${ch}?id=${id}&current=${val}`))
  → update local state
  → (no re-render needed — knob already shows new value)
```

### PicoSeqRack Handling

PicoSeqRack (300+ params, 16 channels) uses the **same generic renderer** with these UX accommodations:

1. **All groups start collapsed** for plugins with >50 parameters
2. **Only the first group auto-expands** on load
3. **Machine selector visibility**: When `ch1_device = 0`, Machine 1's group is visually dimmed (CSS opacity). The renderer detects `device` params and applies conditional CSS classes.
4. **No special-case code** — the schema's group structure handles the hierarchy

### MIDI Mapping (Advanced Mode)

The new UI provides MIDI controller mapping capabilities:

- **"MIDI Mappings" section** below plugin parameters — shows current MIDI-to-parameter assignments
- **"+ Add Mapping" button** — opens a dialog to associate a MIDI CC with a parameter
- **Learn mode** — clicking "Learn" then moving a MIDI controller auto-assigns it

---

## 10. Preset Management

### Presets Sidebar (Right Panel)

The presets sidebar replaces `load.html` and `save.html`:

```
┌─────────────────────┐
│  Presets           > │  ← collapse chevron
│                      │
│  Active: #3 "Bass"   │
│  ──────────────────  │
│  0  Init             │
│  1  Pad Sound        │
│  2  Lead             │
│  3  Bass       ◀ act │
│  4  (empty)          │
│  ...                 │
│  9  (empty)          │
│  ──────────────────  │
│  [Save] [Save As..]  │
└─────────────────────┘
```

### Preset Actions

| Action | Implementation |
|--------|---------------|
| **Load** | Click preset row → `GET /api/v1/loadPreset/{ch}?number={n}` → re-fetch params → re-render |
| **Save** | "Save" button → `GET /api/v1/savePreset/{ch}?number={activeN}&name={name}` |
| **Save As** | "Save As" button → dialog with number + name inputs → same API |
| **Active indicator** | Bold + accent color on the active preset row |

### Preset Data Import/Export

The backup/restore functionality (currently in `config.html`) uses JSZip to download/upload all preset data. This moves into the System Config dialog.

---

## 11. System Configuration

System configuration moves from a full page (`config.html`) to a **dialog/drawer** accessible via the header gear icon.

### Config Dialog Layout

```
┌──────────────── System Configuration ──────────────────┐
│                                                         │
│  AUDIO                                                  │
│  ┌─────────────────────────────────────────────────────┐│
│  │ CH0→CH1 Daisy Chain      [off ▼]                    ││
│  │ CH0 To Stereo             [off ▼]                    ││
│  │ CH1 To Stereo             [off ▼]                    ││
│  │ CH0 Soft Clip Output      [on ▼]                     ││
│  │ CH1 Soft Clip Output      [on ▼]                     ││
│  │ Left Output Level         [32  ]                     ││
│  │ Right Output Level        [32  ]                     ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  NETWORK                                                │
│  ┌─────────────────────────────────────────────────────┐│
│  │ Mode     [USB NCM ▼]                                 ││
│  │ SSID     [_______________]                           ││
│  │ Password [_______________]                           ││
│  │ mDNS     [tbd            ]                           ││
│  │                          [Apply Network Settings]    ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  SYSTEM                                                 │
│  ┌─────────────────────────────────────────────────────┐│
│  │ Firmware: v1.0.0          Hardware: TBD-16           ││
│  │ [Download Backup]    [Upload Backup]                 ││
│  │ [Reboot]                                             ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│                                          [Close]        │
└─────────────────────────────────────────────────────────┘
```

Uses `<sl-dialog>` with `--width: 480px`. All config changes call `POST /api/v1/setConfiguration` immediately (same as current behavior).

---

## 12. Favorites

Favorites management integrates into the Plugin Management view. Options:

### Option A: Favorites Bar in Header (Recommended)

A row of 10 favorite slots in the header area, below the main nav:

```
┌──────────────────────────────────────────────────────────┐
│  TBD-16    [Plugins]  [Samples]         ● Connected  ⚙  │
│  FAV: [1 Bass] [2 Lead] [3 Pad] [4 ──] [5 ──] ... [10] │
└──────────────────────────────────────────────────────────┘
```

- **Click** → Recall favorite
- **Shift+Click** or **long-press** → Store current state to slot
- **Right-click** or **gear icon** → Edit name, export, import

### Option B: Favorites in Presets Sidebar

Add a "Favorites" tab in the presets sidebar alongside "Presets". This keeps the header clean but requires tab switching.

**Recommendation: Option A** — mirrors hardware behavior (quick recall), always visible.

---

## 13. Dev Server Evolution

The existing `tools/dev-server.js` mocks only Sample Manager endpoints. It needs to expand:

### New Mock Endpoints

| Endpoint | Mock Data Source |
|----------|-----------------|
| `GET /api/v1/getPlugins` | Static JSON file or inline array of ~30 plugin entries |
| `GET /api/v1/getActivePlugin/{ch}` | In-memory state |
| `GET /api/v1/getPluginParams/{ch}` | Read actual `mui-*.jsn` files from `components/ctagSoundProcessor/` |
| `GET /api/v1/setActivePlugin/{ch}` | Update in-memory state, return success |
| `GET /api/v1/setPluginParam/{ch}` | Update in-memory param values, return success |
| `GET /api/v1/getPresets/{ch}` | Static mock data |
| `GET /api/v1/loadPreset/{ch}` | Return success |
| `GET /api/v1/savePreset/{ch}` | Return success |
| `GET /api/v1/getConfiguration` | Static mock config |
| `POST /api/v1/setConfiguration` | Accept and log |
| `GET /api/v1/getIOCaps` | Static mock |
| `POST /api/v1/favorite*` | In-memory storage |

### Mock Data from Schema Files

The dev server can read the actual `mui-*.jsn` schema files from the source tree to provide realistic parameter trees:

```
components/ctagSoundProcessor/mui-*.jsn  → parameter schemas
components/ctagSoundProcessor/mp-*.jsn   → preset data
```

This enables developing the parameter renderer against real plugin schemas without a device.

---

## 14. File Structure

### New File Layout (`sdcard_image/www/`)

```
www/
├── index.html              ← NEW: unified app shell (replaces all old HTML)
├── favicon.ico              ← existing
├── css/
│   └── (Onsen CSS removed)
├── js/
│   ├── app.js               ← NEW: app shell, routing, connection manager
│   ├── shared.js            ← NEW: extracted shared utilities
│   ├── plugin-manager.js    ← NEW: Plugin Management view logic
│   ├── param-renderer.js    ← NEW: schema-driven parameter rendering
│   ├── sample-manager.js    ← ADAPTED: existing, refactored init
│   ├── shoelace-bundle.js   ← existing (may need additional components)
│   ├── Sortable.min.js      ← existing
│   └── webaudio-controls.js ← NEW: knob/slider/switch controls (~30 KB)
├── shoelace/
│   ├── themes/
│   │   ├── dark.css          ← existing
│   │   └── light.css         ← existing
│   └── assets/icons/*.svg    ← existing
│
│── (OLD FILES — kept during transition, removed in final phase)
├── main.html                ← old, kept temporarily
├── edit.html                ← old, kept temporarily
├── load.html                ← old, kept temporarily
├── save.html                ← old, kept temporarily
├── config.html              ← old, kept temporarily
├── fav.html                 ← old, kept temporarily
├── drumrack.html            ← old, kept temporarily
└── ...
```

### Gzip Deployment

All `.js` and `.html` files must be gzipped for production (the ESP32 static server requires `.gz` files). The dev server serves uncompressed files directly.

```bash
# Build script creates gzipped versions
gzip -k -9 www/index.html
gzip -k -9 www/js/app.js
gzip -k -9 www/js/shared.js
gzip -k -9 www/js/plugin-manager.js
gzip -k -9 www/js/param-renderer.js
# sample-manager.js.gz already exists
```

---

## 15. Build & Deploy

### Development Workflow

```bash
# Start dev server (serves from sdcard_image/www/, mocks all APIs)
node tools/dev-server.js

# Open in browser
open http://localhost:3000/
# or
open http://localhost:3000/index.html
```

No build step. No bundler. No transpiler. Edit JS/HTML → refresh browser.

### Production Deployment

```bash
# 1. Gzip all web assets
./create_sd_archive.sh   # or manual gzip commands

# 2. Copy to SD card
cp -r sdcard_image/www/ /Volumes/TBD-SD/www/

# 3. Or flash via OTA
# (existing workflow)
```

### Shoelace Bundle Updates

If new Shoelace components are needed (e.g., `<sl-tab-group>`, `<sl-drawer>`, `<sl-dropdown>`), update `shoelace-bundle.js` using the existing bundling approach documented in `sample-manager-implementation-v4.md`.

---

## 16. Firmware Changes Required

### No New Endpoints — Firm Constraint

The ESP32 `max_uri_handlers` is set to 20 and **must not be increased**. 18 of 20
slots are already used. The Sample Manager proved that complex functionality can be
delivered through **query-string dispatch on existing URLs** (one GET + one POST
handler serving all sample/kit/folder operations). The plugin API already follows a
similar pattern (e.g. `setPluginParam` checks for `cv`, `trig`, or `current` in the
query string).

**No new REST endpoints will be added.** All future functionality (batch param set,
macro CRUD, etc.) must be implemented as sub-actions on existing POST handlers —
exactly as `POST /api/v1/samples?action=manage` dispatches `rename`, `delete`,
`saveKit`, `createKit`, `deleteKit`, `createFolder`, `renameFolder`, `deleteFolder`
through a single URI handler slot.

---

## 17. Implementation Phases

### Phase 1: App Shell + Plugin Sidebar (Week 1-2)

**Goal:** New `index.html` app shell with working view switching and plugin browser sidebar.

**Deliverables:**
- [ ] `index.html` — app shell with shared header, two view containers, footer
- [ ] `js/app.js` — view switching, connection monitor, header setup
- [ ] `js/shared.js` — extracted utilities (toast, esc, formatBytes, apiGet/apiPost, theme)
- [ ] Plugin sidebar — fetch plugin list, render searchable list with category grouping
- [ ] Slot A/B headers — show active plugin name, type badges
- [ ] "Replace" button — loads selected plugin into focused slot
- [ ] Dev server — mock `getPlugins`, `getActivePlugin`, `setActivePlugin` endpoints
- [ ] **Both views accessible** — Plugins view is functional, Samples view shows existing Sample Manager

**API calls used:** `getPlugins`, `getActivePlugin/0`, `getActivePlugin/1`, `setActivePlugin/0`, `setActivePlugin/1`, `getIOCaps`

### Phase 2: Parameter Renderer (Week 2-3)

**Goal:** Render and edit plugin parameters with knobs.

**Deliverables:**
- [ ] `js/param-renderer.js` — schema-driven renderer (groups → knobs + toggles)
- [ ] Integrate `webaudio-controls.js` — knob rendering with orange theme
- [ ] Parameter change handler — debounced API calls via `FetchQueue`
- [ ] Collapsible groups — `<sl-details>` sections, auto-collapse for large plugins
- [ ] Dev server — mock `getPluginParams`, `setPluginParam` with real `mui-*.jsn` schemas
- [ ] Test with Subbotnik (simple) and PicoSeqRack (complex, 300+ params)

**API calls used:** `getPluginParams/0`, `getPluginParams/1`, `setPluginParam/*`

### Phase 3: Presets (Week 3-4)

**Goal:** Load and save presets from the presets sidebar.

**Deliverables:**
- [ ] Presets sidebar (right panel, collapsible)
- [ ] Load preset — click to load, re-fetch params, re-render
- [ ] Save preset — dialog with number + name input
- [ ] Active preset indicator
- [ ] Dev server — mock `getPresets`, `loadPreset`, `savePreset`

**API calls used:** `getPresets/0`, `getPresets/1`, `loadPreset/*`, `savePreset/*`

### Phase 4: System Config + Favorites (Week 4-5)

**Goal:** System configuration dialog and favorites management.

**Deliverables:**
- [ ] Config dialog — `<sl-dialog>` with all config sections
- [ ] Config API integration — `getConfiguration`, `setConfiguration`
- [ ] Favorites bar (header) — 10 slots, recall/store
- [ ] Favorites API integration — `getAll`, `store`, `recall`
- [ ] Backup/restore (using JSZip or manual JSON)
- [ ] Reboot button

**API calls used:** `getConfiguration`, `setConfiguration`, `favorites/*`, `reboot`, `getPresetData/*`, `setPresetData/*`

### Phase 5: Sample Manager Integration (Week 5-6)

**Goal:** Integrate existing Sample Manager into the unified app.

**Deliverables:**
- [ ] Move Sample Manager HTML into `#view-samples` in `index.html`
- [ ] Refactor `sample-manager.js` — extract shared utilities, make `init()` callable
- [ ] Shared header — Sample Manager uses app header (status, storage, theme)
- [ ] Lazy initialization — Sample Manager only fetches data on first view switch
- [ ] Verify all Sample Manager features work (upload, drag-drop, kits, preview, etc.)

### Phase 6: Polish & UX (Week 6-7)

**Goal:** Advanced features and refinement.

**Deliverables:**
- [ ] MIDI mapping section (add/remove MIDI controller assignments)
- [ ] Debug panel (bottom drawer: app state, network, parameter dump)
- [ ] Keyboard shortcuts (Cmd+S to save preset, etc.)
- [ ] Empty slot state ("No Plugin Loaded" + "Add Plugin" CTA)
- [ ] Loading states and error handling polish
- [ ] Performance testing on device (ESP32 serving via USB NCM)
- [ ] Mobile/tablet responsive adjustments

### Phase 7: Cleanup & Ship (Week 7-8)

**Goal:** Remove old UI, finalize.

**Deliverables:**
- [ ] Remove old Onsen HTML files (`main.html`, `edit.html`, `load.html`, `save.html`, `config.html`, `fav.html`, `drumrack.html`)
- [ ] Remove jQuery, Onsen JS/CSS, ajaxq.js
- [ ] Remove `drumrack.js` and `drumrack.css`
- [ ] Update `index.html` to be the default page (already is, since `RestServer.cpp` serves `/` → `index.html`)
- [ ] Final gzip build of all assets
- [ ] SD card image update
- [ ] Update documentation

---

## 18. Migration Strategy

### During Development (Phases 1-6)

Both UIs coexist:
- **New UI** at `/index.html` (or just `/` since RestServer serves `index.html` for `/`)
- **Old UI** at `/main.html` (accessible by navigating directly)
- **Sample Manager** at `/samples.html` (standalone, as today — plus integrated in new UI)

The `index.html` file currently loads the Onsen navigator. In Phase 1, we create a **new** `index.html` that is the unified app. If the old `index.html` is needed for fallback, rename it to `index-old.html`.

### After Phase 7

Only `index.html` (new app) and its JS/CSS assets remain. All Onsen files are removed from the SD card image.

---

## 19. Constraints & Risks

### ESP32 Serving Constraints

| Constraint | Mitigation |
|-----------|------------|
| **Max ~4 concurrent connections** | Sequential parameter changes via `FetchQueue`. Avoid parallel fetches. |
| **All static files must be `.gz`** | Build script gzips everything. Dev server serves uncompressed. |
| **20 URI handler slots (18 used, 2 remaining)** | No new API endpoints in Phase 1. Future phases may need to bump `max_uri_handlers`. |
| **`Connection: close` on every response** | No HTTP keep-alive. Each request is a new TCP connection. Batch where possible. |
| **10 KB scratch buffer** | POST bodies >10 KB need chunked reading (already handled by SampleAPI). Plugin param POSTs are small. |

### Bundle Size Budget

| Asset | Size (gzipped) | Status |
|-------|---------------:|--------|
| `index.html` | ~10-12 KB | New (includes all inline CSS) |
| `js/app.js` | ~3-4 KB | New |
| `js/shared.js` | ~2-3 KB | New |
| `js/plugin-manager.js` | ~8-10 KB | New |
| `js/param-renderer.js` | ~4-5 KB | New |
| `js/sample-manager.js` | ~21 KB | Existing |
| `js/shoelace-bundle.js` | ~52 KB | Existing (may grow slightly) |
| `js/Sortable.min.js` | ~9 KB | Existing |
| `js/webaudio-controls.js` | ~30 KB | New |
| **Total** | **~140-150 KB** | Comparable to current Onsen UI stack |

The current old UI (Onsen + jQuery + ajaxq + JSZip) is approximately 150-180 KB gzipped. The new unified UI is comparable or slightly smaller.

### Shoelace Component Needs

The Sample Manager bundle includes 15 components. The Plugin Manager may need additional ones:

| Component | Needed For |
|-----------|------------|
| `<sl-details>` | Collapsible parameter groups |
| `<sl-tab-group>` / `<sl-tab>` | Presets sidebar tabs, debug panel tabs |
| `<sl-drawer>` | Config drawer (alternative to dialog) |
| `<sl-dropdown>` | MIDI mapping menus |
| `<sl-badge>` | Mono/Stereo plugin badges |
| `<sl-tag>` | Plugin type tags |
| `<sl-split-panel>` | Already in bundle (Sample Manager uses it) |
| `<sl-tooltip>` | Already in bundle |

If more than 3-4 new components are needed, rebuild `shoelace-bundle.js` with the expanded set.

---

## 20. Open Questions

| # | Question | Impact | Recommendation |
|---|----------|--------|----------------|
| 1 | **Knob library**: `webaudio-controls.js` vs. custom CSS knob? | Visual consistency, bundle size | Start with `webaudio-controls.js` (proven, feature-rich, MIDI learn). Replace later if needed. |
| 2 | **Favorites: header bar vs. sidebar tab?** | UX, header height | Header bar (Option A) — always visible, mirrors hardware. |
| 3 | **MIDI mapping: inline vs. dialog?** | UX complexity | Inline section below parameters with "+ Add Mapping" button. |
| 4 | **Module system**: ES modules (`import/export`) vs. IIFE globals? | Dev ergonomics, browser support | ES modules with `<script type="module">`. All modern browsers support it. `webaudio-controls` may need a wrapper. |
| 5 | **Config: dialog vs. drawer?** | UX | `<sl-dialog>` (already in bundle). Drawer is heavier. |
| 6 | **Plugin description/categories**: Where do `hint`, `description` come from? | Plugin sidebar richness | `hint` field exists in `getPlugins` response. Add `description` to `mui-*.jsn` if desired (future firmware change). |
| 7 | **JSZip for backup**: Keep the dependency or reimplement? | Bundle size (26 KB gzipped) | Keep JSZip, lazy-load via dynamic `import()` only when backup is triggered. |
| 8 | **Preset sidebar: always visible or collapsible?** | Screen real estate | Collapsible (collapsed by default). Plugin params need horizontal space. |

---

## Appendix A: API Endpoint Reference (v1)

Complete list of existing endpoints used by the new UI:

```
GET  /api/v1/getPlugins                        → plugin list
GET  /api/v1/getActivePlugin/0                  → active plugin ch0
GET  /api/v1/getActivePlugin/1                  → active plugin ch1
GET  /api/v1/getPluginParams/0                  → params ch0
GET  /api/v1/getPluginParams/1                  → params ch1
GET  /api/v1/setActivePlugin/0?id=PluginName    → switch plugin ch0
GET  /api/v1/setActivePlugin/1?id=PluginName    → switch plugin ch1
GET  /api/v1/setPluginParam/0?id=X&current=V    → set param ch0
GET  /api/v1/setPluginParam/1?id=X&current=V    → set param ch1
GET  /api/v1/getPresets/0                        → preset list ch0
GET  /api/v1/getPresets/1                        → preset list ch1
GET  /api/v1/loadPreset/0?number=N               → load preset ch0
GET  /api/v1/loadPreset/1?number=N               → load preset ch1
GET  /api/v1/savePreset/0?number=N&name=X        → save preset ch0
GET  /api/v1/savePreset/1?number=N&name=X        → save preset ch1
GET  /api/v1/getPresetData/PluginId              → all preset data
POST /api/v1/setPresetData/PluginId              → write preset data
POST /api/v1/favorites/getAll                    → all 10 favorites
POST /api/v1/favorites/store/N                   → store favorite
POST /api/v1/favorites/recall/N                  → recall favorite
GET  /api/v1/getConfiguration                    → system config
POST /api/v1/setConfiguration                    → set system config
GET  /api/v1/getIOCaps                           → HW/FW version, triggers, CVs
GET  /api/v1/reboot                              → reboot device
GET  /api/v1/samples                             → sample list + kits
GET  /api/v1/samples?preview=PATH                → stream WAV preview
GET  /api/v1/samples?switchKit=N                 → switch active kit
POST /api/v1/samples?action=upload               → upload WAV
POST /api/v1/samples?action=manage               → manage samples/kits/folders
POST /api/v1/samples?action=reload               → reload PSRAM
```

---

## Appendix B: Prototype Screenshot Analysis

From the attached prototype screenshots, the following design elements are confirmed:

1. **Three-column layout**: Plugin sidebar (left) + Dual slot panels (center) + Presets sidebar (right)
2. **Plugin sidebar**: Searchable, categorized (EFFECTS header), shows Mono/Stereo badges (blue/pink)
3. **Slot headers**: "SLOT A" / "SLOT B" labels in orange, plugin name large, [Presets] [Replace] buttons
4. **Plugin info bar**: Mono/Stereo badge (blue rounded), type tag ("Synth_voice"), description text on gray background
5. **Parameter groups**: Orange uppercase group headers ("PITCH", "MODULATION", "ENVELOPE")
6. **Knobs**: Arc-style knobs in the PITCH section showing 4 knobs in a row (matches `webaudio-controls` style)
7. **Sliders**: Orange range sliders for some parameters (MODULATION, ENVELOPE sections)
8. **Boolean switches**: `<sl-switch>` toggles for bool params (Eg Bc Ena, Eg Bc Loop)
9. **Status bar**: Bottom bar with "● Connected", "API: http://localhost:8000", "● MIDI connected", CPU/Memory stats
10. **Slot focus tabs**: "Slot A" / "Slot B" tabs in bottom-right corner
11. **Empty slot state**: Large "+" icon, "No Plugin Loaded" text, "Select an audio plugin..." subtitle, "Add Plugin" button
12. **Debug panel**: Collapsible bottom panel with "App State" / "Network" / "Parameters" tabs, showing connection status and slot info
13. **Color scheme**: Dark background, orange accents (#e8772e), neutral grays, minimal color usage
14. **Header**: "TBDAudio Processing Platform v1.0.0" with [Light toggle] [Config button] [Save button]
15. **Swap icon**: Between Slot A and Slot B — allows swapping plugins between slots (↔ icon)

---

*End of plan. Implementation begins with Phase 1 on branch `feature/webui-general-ui-rework`.*
