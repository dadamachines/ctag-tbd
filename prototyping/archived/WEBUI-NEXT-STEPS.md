# TBD-16 Unified WebUI — Status & Next Steps

```
Version  : 2.0
Date     : 2026-02-28
Status   : Active — Phases 1–6 complete, Phase 7 (Ship) remaining
License  : LGPL 3.0 (dadamachines additions)
Copyright: (c) 2014-2026 Johannes Elias Lohbihler for dadamachines
Reference: prototyping/WEBUI-UNIFIED-IMPLEMENTATION-PLAN.md (original plan)
```

---

## Table of Contents

1.  [Implementation Status Overview](#1-implementation-status-overview)
2.  [Completed Work — Summary](#2-completed-work--summary)
3.  [Open Tasks — By Priority](#3-open-tasks--by-priority)
4.  [Phase 7: Cleanup & Ship (Next)](#4-phase-7-cleanup--ship-next)
5.  [Phase 8: Advanced Features (Future)](#5-phase-8-advanced-features-future)
6.  [Phase 9: Firmware Integration](#6-phase-9-firmware-integration)
7.  [Design Decisions Made](#7-design-decisions-made)
8.  [Open Questions](#8-open-questions)
9.  [File Inventory](#9-file-inventory)

---

## 1. Implementation Status Overview

### Phase Completion Map

| Phase | Description | Status |
|:---:|---|:---:|
| **1** | App Shell + Plugin Sidebar | ✅ Complete |
| **2** | Parameter Renderer | ✅ Complete (sliders, no knobs) |
| **3** | Presets | ✅ Complete |
| **4** | System Config + Favorites | ✅ Complete |
| **5** | Sample Manager Integration | ✅ Complete |
| **6** | Polish & UX | ✅ Complete |
| **7** | Cleanup & Ship | ⚠️ Not started |

### What's Working Right Now

The unified WebUI is **functional end-to-end** for the primary workflow:

**Plugin Management View:**
- Plugin sidebar — searchable, categorized (6 categories), Mono/Stereo badges, Dual Mono / Stereo filter tabs
- Dual-slot plugin management — load, clear, smart slot assignment, both-occupied dialog
- Swap slots A ↔ B button (in Slot A title bar, hidden in stereo mode)
- Stereo mode — Slot B auto-locked when Slot A has stereo plugin, full-width layout
- Plugin info bar — Mono/Stereo badge, category badge, description
- Empty slot CTA — "+" icon, "No Plugin Loaded", "Add Plugin" button
- Parameter editing — sliders + boolean switches, two-column layout, serialized via FetchQueue
- Collapsible parameter groups with chevron indicators
- Presets — inline select dropdown per slot, save dialog with 20 named slots (0–19)
- Favorites — 10 numbered buttons in header with popover (Recall / Store Current actions)

**Sample Manager View:**
- File browser with folder navigation, upload, rename, delete
- Kit editor — banked view (8 banks × 32 slots) and flat view (with color-coded bank badges)
- Drag-and-drop sample assignment
- Bank management — rename, recolor, add/remove banks
- Audio preview, transfer queue, SD storage indicator

**Shared Infrastructure:**
- Single-page app with tab navigation (Plugins / Samples)
- Header: TBD-16 → Nav tabs → Favorites → Storage → Config + Theme
- Dark/light theme toggle
- Color palette system (3 Dieter Rams palettes: Warm, Contrast, Muted)
- Connection monitor with auto-reconnect
- Tabbed config dialog (Connection / Appearance / System)
- Debug panel (App State / Network / Parameters — 3 tabs with API call tracking)
- Dev server mocking all API endpoints with 57 real plugin schemas

---

## 2. Completed Work — Summary

### Features Completed Across All Sessions

| Feature | Session | Notes |
|---|---|---|
| App shell + view routing | Phase 1 | `index-new.html` + `app.js` + `shared.js` |
| Plugin sidebar (search, categories) | Phase 1 | Heuristic categorization from `hint` field |
| Schema-driven param renderer | Phase 2 | Inline in `plugin-manager.js`, ~200 lines |
| Preset load/save | Phase 3 | In-slot controls, 20 named slots |
| Config dialog (3 tabs) | Phase 4 | Connection, Appearance, System |
| Favorites (10 slots) | Phase 4 | Popover UX with Recall / Store Current |
| Sample Manager integration | Phase 5 | Full SM in `#view-samples`, lazy-init |
| Stereo plugin handling | Phase 6 | Slot B lockout, full-width layout |
| Swap slots A ↔ B | Phase 6 | Button in Slot A title bar |
| Empty slot CTA | Phase 6 | "Add Plugin" opens sidebar |
| Plugin info bar | Phase 6 | Badges + description |
| Dual Mono / Stereo filter | Phase 6 | Plugin sidebar filter tabs |
| Two-column param layout | Phase 6 | `flex-wrap: wrap`, 50% width per param |
| Icon bundle (29 icons) | Fix round 1 | Inline SVGs in Shoelace bundle Map, cache buster v=3 |
| Synthetic param group wrapping | Fix round 2 | Ungrouped params wrapped into "Parameters" group |
| Slot boundary borders | Fix round 2 | `.slot-panel + .slot-panel { border-left }` |
| Preset sidebar removal | Fix round 2 | Replaced with in-slot preset controls only |
| Favorites popover UX | Fix round 2 | Replaced shift+click with Recall/Store popover |
| Param styling contrast | Fix round 3 | White scroll bg, grey groups, neutral-200 headers |
| Search icon alignment | Fix round 3 | `::part(prefix)` Shoelace input styling |
| Design polish (hover, subheaders) | Fix round 3 | Param row hover, preset subheader, cleanup |
| MIDI mappings removal | Fix round 3 | Non-functional placeholder removed (~80 lines) |
| Header layout reorder | Fix round 4 | Favorites left-aligned after tabs, storage+config right |
| Debug panel overhaul | Fix round 4 | API tracking, 3 tabs with rich data, param change log |
| Kit editor bank badges (flat view) | Fix round 4 | Color-coded bank name badges per sample slot |

---

## 3. Open Tasks — By Priority

### Priority 1 — Must-Have Before Ship

| # | Task | Effort | Details |
|---|---|:---:|---|
| 1 | **Remove old Onsen UI files** | Small | 18 legacy files to delete (see §4.1) |
| 2 | **Rename `index-new.html` → `index.html`** | Trivial | Update dev server route mapping |
| 3 | **Gzip build for production** | Small | ESP32 serves `.gz` files; build script needed |
| 4 | **Update `create_sd_archive.sh`** | Small | Include new files, exclude legacy files |
| 5 | **Update dev server default route** | Trivial | Map `/` → `/index.html` instead of `/index-new.html` |
| 6 | **Test on real ESP32-P4 hardware** | Medium | Verify all APIs work against `RestServer.cpp` |

### Priority 2 — Should-Have

| # | Task | Effort | Details |
|---|---|:---:|---|
| 7 | **Loading spinner during plugin switch** | Small | `<sl-spinner>` overlay while `setActivePlugin` is in flight |
| 8 | **Backup / Restore (JSZip)** | Medium | Download/upload all preset data as ZIP (§5.1) |
| 9 | **Favorites rename/edit** | Small | Allow naming favorites beyond "Favorite 1–10" |
| 10 | **Enum-style `<sl-select>` for small ranges** | Small | Params with ≤16 values render as dropdowns (§5.2) |
| 11 | **Keyboard shortcuts** | Small | Save preset, switch views, search focus (§5.3) |

### Priority 3 — Nice-to-Have / Future

| # | Task | Effort | Details |
|---|---|:---:|---|
| 12 | **Mobile / tablet responsive polish** | Medium | Stack slots vertically ≤768px, tab switch ≤480px |
| 13 | **Knobs (`webaudio-controls`)** | Medium | Alternative to sliders for dense param layouts |
| 14 | **Slot focus system** | Small | Status bar slot tabs to determine sidebar target |
| 15 | **PicoSeqRack optimizations** | Medium | Channel mixer strips, machine selector hide/show |
| 16 | **Parameter polling (HW ↔ WebUI sync)** | Medium | Periodic `getPluginParams` refresh (§6.2) |
| 17 | **Full Audio/Network config** | Medium | Daisy chain, stereo, levels, WiFi, mDNS (§6.3) |
| 18 | **Macro preset editor** | Large | Layer 1–3 parameter abstraction (§6.4) |
| 19 | **CPU/Memory in footer** | N/A | Requires firmware API endpoint |
| 20 | **MIDI status display** | N/A | Requires firmware API endpoint |

---

## 4. Phase 7: Cleanup & Ship (Next)

This is the immediate next phase. All items are small and well-defined.

### 4.1 Remove Old UI Files

18 legacy files to delete from `sdcard_image/www/`:

**HTML pages (10):**
```
index.html          ← old Onsen shell (will be replaced by renamed index-new.html)
main.html           ← old Onsen dashboard
edit.html           ← old Onsen param editor  
load.html           ← old Onsen preset loader
save.html           ← old Onsen preset saver
config.html         ← old Onsen config page
fav.html            ← old Onsen favorite editor
drumrack.html       ← old jQuery DrumRack page
samples.html        ← standalone Sample Manager (now integrated)
samples.html.gz     ← gzipped version of standalone SM
```

**JavaScript (4):**
```
js/drumrack.js      ← old jQuery DrumRack logic (1,202 lines)
js/onsenui.min.js   ← Onsen UI runtime
js/jquery-3.4.1.min.js ← jQuery
js/ajaxq.js         ← jQuery AJAX queue plugin
```

**CSS (4):**
```
css/onsen-css-c.min.css  ← Onsen CSS
css/onsenui-cr.min.css   ← Onsen UI custom CSS
css/drumrack.css         ← DrumRack styles
css/sample-rom.css       ← old sample ROM styles
```

**Keep:** `js/jszip.min.js` (needed for future Backup/Restore feature), `js/sample-manager.js.gz` (update after gzip build).

### 4.2 Rename Entry Point

```bash
mv index-new.html index.html
```

Update `tools/dev-server.js`:
- Change the `/` route to serve `index.html` (remove `index-new.html` mapping)

### 4.3 Gzip Build

ESP32 serves `.gz` files when available. Create a build script:

```bash
#!/bin/bash
cd sdcard_image/www
for f in index.html js/app.js js/shared.js js/plugin-manager.js js/sample-manager.js js/shoelace-bundle.js; do
  gzip -k -9 "$f"
  echo "Compressed: $f → $f.gz ($(stat -f%z "$f.gz") bytes)"
done
```

### 4.4 Update `create_sd_archive.sh`

- Include: `index.html`, `js/app.js`, `js/shared.js`, `js/plugin-manager.js`, `js/sample-manager.js`, `js/shoelace-bundle.js`, `js/Sortable.min.js`, `js/jszip.min.js`, `shoelace/` directory
- Exclude: all files listed in §4.1
- Include `.gz` versions of all JS/HTML files

### 4.5 Remove Vestigial Comments

Three "removed" comments to clean up:
- `index-new.html` line ~480: `/* MIDI Mappings — removed */`
- `index-new.html` line ~653: `/* Presets Sidebar — removed */`
- `plugin-manager.js` lines ~677, ~971: sidebar preset removal notes

### 4.6 Hardware Testing Checklist

Test against real ESP32-P4 with `RestServer.cpp`:

| Endpoint | Test |
|---|---|
| `GET /api/v1/getPlugins` | Plugin list loads correctly |
| `GET /api/v1/getActivePlugin/{0,1}` | Active plugins display on load |
| `GET /api/v1/getPluginParams/{0,1}` | Parameters render correctly |
| `GET /api/v1/setActivePlugin/{ch}?id={id}` | Plugin switching works |
| `GET /api/v1/setPluginParam/{ch}?...` | Parameter changes apply |
| `GET /api/v1/getPresets/{id}` | Presets load for active plugin |
| `GET /api/v1/loadPreset/{ch}?num={n}` | Preset recall works |
| `GET /api/v1/savePreset/{ch}?num={n}&name={n}` | Preset save works |
| `POST /api/v1/favorites/*` | Favorites store/recall works |
| `GET /api/v1/getConfiguration` | Config dialog populates |
| `GET /api/v1/getIOCaps` | Connection monitor works |
| `GET /api/v1/samples/*` | Sample browser works |
| `POST /api/v1/samples/*` | Upload/manage samples works |

---

## 5. Phase 8: Advanced Features (Future)

These improve the UX but are not blockers for shipping.

### 5.1 Backup / Restore

**Status:** Not implemented. `js/jszip.min.js` is available on disk.

**Implementation:**
- **Download Backup:** Fetch all preset data via `GET /getPresetData/<pluginId>` for each plugin, bundle into ZIP using JSZip (lazy-loaded), trigger browser download
- **Upload Backup:** File picker for `.zip`, extract, call `POST /setPresetData/<pluginId>` for each plugin
- Add UI to the System tab of the config dialog

**Files:** `app.js` (backup/restore logic), `js/jszip.min.js` (existing)

### 5.2 Enum-style Selects for Small Int Ranges

**Status:** All `int` parameters render as sliders regardless of range.

**Implementation:**
- In `renderSliderParam()`: check if `(max - min) <= 16`
- If so, render `<sl-select>` with option labels
- Useful for: `LfoType`, `device`, `WaveformSelect`, `FilterType`

**Files:** `plugin-manager.js` (render logic)

### 5.3 Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + S` | Save current preset |
| `Cmd/Ctrl + 1` | Switch to Plugins view |
| `Cmd/Ctrl + 2` | Switch to Samples view |
| `Escape` | Close any open dialog |
| `/` | Focus plugin search input |

**Files:** `app.js` (global keydown listener)

### 5.4 Loading Spinner During Plugin Switch

**Status:** No visual feedback during plugin load.

**Implementation:**
- Show `<sl-spinner>` overlay on the slot panel while `setActivePlugin` + `loadSlotData` are in flight
- Add/remove `.loading` class on `.slot-panel` during the async operation

**Files:** `plugin-manager.js`, `index-new.html` (CSS for spinner overlay)

### 5.5 Mobile / Tablet Responsive

**Status:** Basic responsive rules exist (sidebar shrinks at narrow widths).

**Needed:**
- Test at 768px, 1024px breakpoints
- At ≤768px: stack slot panels vertically
- At ≤480px: full-screen slot panel with tab switching
- Touch-friendly slider sizing (larger hit targets)

**Files:** `index-new.html` (media queries)

### 5.6 Knobs vs. Sliders

**Status:** Using native `<input type="range">` sliders. Plan specified `webaudio-controls.js` knobs.

**Assessment:**
- Sliders work and are lightweight (zero extra dependencies)
- Knobs would add ~30 KB and a new library
- Knobs are better for dense parameter layouts (less horizontal space)
- Consider: hybrid toggle between knob/slider view

**Recommendation:** Keep sliders for now. Revisit if user feedback indicates density is a problem.

---

## 6. Phase 9: Firmware Integration

These features require firmware changes or API additions and are tracked for coordination with the firmware team.

### 6.1 Verify `getConfiguration` Response

**Status:** Config dialog UI is built, but the real firmware response structure needs verification.

The dev server mock returns:
```json
{
  "firmwareVersion": "1.0.0-dev",
  "codec": "WM8978",
  "midi_enabled": false,
  "midi_channel": 1
}
```

The real `RestServer.cpp` + `SPManagerDataModel.cpp` may return different fields. The config dialog should be updated once the actual response is documented.

### 6.2 Parameter Polling (Hardware ↔ WebUI Sync)

**Status:** Not implemented.

The TBD-16 has two control surfaces (hardware encoders + WebUI). When the user changes a parameter via hardware, the WebUI display becomes stale.

**Proposed approach:** Periodic polling via `getPluginParams` every 1–3 seconds. Diff incoming values against UI state; skip updates for params the user is actively dragging.

**Alternative:** Server-Sent Events (SSE) — lower latency but requires firmware HTTP server changes.

### 6.3 Full Audio/Network Configuration

**Status:** Config dialog has stubs but not connected to real firmware API.

**Missing firmware API fields:**
- Audio: daisy chain enable, stereo mode, clip indicator, output levels, input gain
- Network: WiFi mode (AP/STA), SSID, password, mDNS hostname
- System: CPU usage, memory usage, uptime

### 6.4 Macro Preset Editor

**Status:** Not started. Designed in `WEBUI-SYNTHESIS.md` §3.

The RP2350 firmware engineer is building a preset system with three layers:
1. User-facing macro parameters
2. Output mapping (macro → CCs)
3. Underlying DSP engine parameters

The WebUI would need a "Preset Editor" mode that displays macro knobs instead of raw parameters. This depends on the firmware preset format being finalized.

### 6.5 CPU/Memory/MIDI Status

**Status:** No firmware API endpoint exists for these.

The plan showed CPU%, memory usage, and MIDI status in the footer. These require new firmware endpoints (or extending `getConfiguration` / `getIOCaps`).

---

## 7. Design Decisions Made

Decisions made during implementation that differ from the original plan:

| Plan Specified | Decision Made | Rationale |
|---|---|---|
| `webaudio-controls.js` knobs | **Native `<input type="range">` sliders** | Zero extra dependencies, works everywhere, good enough for companion UI |
| Separate `param-renderer.js` module | **Inline in `plugin-manager.js`** | Simpler, all plugin logic in one file, ~200 lines |
| ES modules (`import/export`) | **IIFE pattern with `window.TBD` namespace** | More reliable on ESP32 static serving, no module resolution needed |
| Status indicator in header | **Moved to footer only** | Cleaner header, footer is the natural place for status |
| Favorites: click=recall, shift+click=store | **Popover with Recall / Store Current buttons** | More discoverable, no hidden modifier-key UX |
| Plugin categories from firmware `hint` | **Heuristic JS classification** | Categories not in API, JS classifies effectively using hint + id |
| `<sl-details>` for param groups | **Custom collapsible divs** | Simpler, more control over styling |
| Preset sidebar (always visible, right) | **Removed — in-slot preset controls only** | Cleaner layout, presets managed via dropdown + save button per slot |
| MIDI mappings section below params | **Removed** | Non-functional placeholder added no value |
| `<sl-drawer>` for config | **`<sl-dialog>` with tabs** | Already in Shoelace bundle, tabbed layout for organized settings |

---

## 8. Open Questions

| # | Question | Status | Notes |
|---|---|:---:|---|
| 1 | What does `getConfiguration` actually return on real hardware? | **Open** | Need to verify firmware response structure before building full config UI |
| 2 | Does firmware expose CPU/Memory stats via API? | **Open** | Plan showed these in footer but no endpoint identified |
| 3 | Does firmware support MIDI status reporting? | **Open** | Would enable MIDI active indicator in UI |
| 4 | JSZip for backup — load lazily or bundle? | **Open** | File exists on disk; plan is lazy-load on demand |
| 5 | Should `getIOCaps` remain the health-check endpoint? | **Open** | Currently used by connection monitor; `/getPlugins` may be more relevant |
| 6 | When will the macro preset format be finalized? | **Open** | Blocks macro preset editor feature |
| 7 | Should the old `index.html` / Onsen UI be kept as fallback? | **Open** | Recommend removing in Phase 7, but firmware team may want it during transition |

---

## 9. File Inventory

### Active Files (current implementation)

| File | Lines | Purpose |
|---|---:|---|
| `sdcard_image/www/index-new.html` | 1,729 | Unified app shell (HTML + inline CSS) |
| `sdcard_image/www/js/app.js` | 521 | App shell, routing, config dialog, debug panel, API tracking |
| `sdcard_image/www/js/shared.js` | 309 | Shared utilities, FetchQueue, toast, theme, connection monitor |
| `sdcard_image/www/js/plugin-manager.js` | 1,049 | Plugin view — sidebar, params, presets, favorites, stereo, swap |
| `sdcard_image/www/js/sample-manager.js` | 2,617 | Sample Manager view — browser, kit editor, banks, transfers |
| `sdcard_image/www/js/shoelace-bundle.js` | — | Shoelace Web Components (custom bundle, 29 inline icons) |
| `sdcard_image/www/js/Sortable.min.js` | — | Drag-and-drop library |
| `sdcard_image/www/js/jszip.min.js` | — | JSZip (for future backup/restore) |
| `tools/dev-server.js` | 813 | Dev server with full API mocking (57 plugins, 5 presets each) |
| **Total active JS/HTML** | **7,038** | |

### Legacy Files (to be removed in Phase 7)

| File | Type | Notes |
|---|---|---|
| `index.html` | HTML | Old Onsen shell → replaced by `index-new.html` |
| `main.html` | HTML | Old Onsen dashboard |
| `edit.html` | HTML | Old Onsen param editor |
| `load.html` | HTML | Old Onsen preset loader |
| `save.html` | HTML | Old Onsen preset saver |
| `config.html` | HTML | Old Onsen config page |
| `fav.html` | HTML | Old Onsen favorite editor |
| `drumrack.html` | HTML | Old jQuery DrumRack page |
| `samples.html` | HTML | Standalone Sample Manager (now integrated) |
| `samples.html.gz` | Gzip | Gzipped standalone SM |
| `js/drumrack.js` | JS | Old jQuery DrumRack (1,202 lines) |
| `js/onsenui.min.js` | JS | Onsen UI runtime |
| `js/jquery-3.4.1.min.js` | JS | jQuery |
| `js/ajaxq.js` | JS | jQuery AJAX queue plugin |
| `js/sample-manager.js.gz` | Gzip | Outdated gzip (rebuild after cleanup) |
| `css/onsen-css-c.min.css` | CSS | Onsen CSS |
| `css/onsenui-cr.min.css` | CSS | Onsen UI custom CSS |
| `css/drumrack.css` | CSS | DrumRack styles |
| `css/sample-rom.css` | CSS | Old sample ROM styles |

### Files NOT Created (plan vs. reality)

| Planned File | Status | Rationale |
|---|---|---|
| `js/param-renderer.js` | **Skipped** | Inline in `plugin-manager.js` — simpler |
| `js/webaudio-controls.js` | **Skipped** | Using native sliders — zero dependencies |

---

*Updated 2026-02-28. Next action: Phase 7 — Cleanup & Ship (remove 18+ legacy files, rename entry point, gzip build).*
