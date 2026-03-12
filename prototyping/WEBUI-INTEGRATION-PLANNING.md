# WebUI Integration Planning: `www-prototype/` → `www/`

**Source:** `sdcard_image/www-prototype/` (Preset & Macro Manager — performer/designer prototype)  
**Target:** `sdcard_image/www/` (Production WebUI — Plugin & Sample Manager)

**Goal:** Integrate the prototype into `www/` as a second HTML page (`preset-macro-manager.html`) that works alongside the existing `index.html`. Both pages share common JS/CSS and are fully functional on the ESP32.

**Summary of scale:**  
- `www/` production: 2,494-line index.html + 6,211 lines of JS across 6 files  
- `www-prototype/`: 263-line index.html + 4,384 lines of JS across 5 files + 2,081-line CSS  
- Shared modules diverged: `shared.js` (489 vs 970 lines), `shoelace-bundle.js` (4 extra icons in prototype)  
- 3 vendor files are identical: `Sortable.min.js`, `webaudio-controls.js`, `display-hints.js`

---

## 0. ESP32 Deployment Constraints ⚠️ CRITICAL CONTEXT

These constraints **must** guide every decision below. They are embedded deep in firmware and build tooling.

### Gzip-only serving
The ESP32 `RestServer.cpp` (lines 137/155) **unconditionally** appends `.gz` to every requested file path and sets `Content-Encoding: gzip`. There is no fallback to uncompressed files. Every file in `www/` must have a `.gz` counterpart on the SD card.

### Socket limit
ESP32 httpd has 7 sockets; ~4 are usable after internal overhead. The current `index.html` reduces HTTP requests to:
1. `index.html.gz` (HTML + all CSS inline)
2. `js/app-bundle.js.gz` (6 JS files concatenated into 1)
3. `js/shoelace-bundle.js.gz` (cached after first load)
4. `shoelace/themes/dark.css.gz` (cached)

This totals 2 non-cached + 2 cached = peak 4 concurrent requests. **Each new HTML page must follow a similar bundle strategy.**

### Build pipeline
1. **`www/build-webui.sh`** — local dev: concatenates JS source files → `app-bundle.js`, gzips production assets
2. **`create_sd_archive.sh`** — production: auto-gzips *everything* in `www/` (recursively), outputs `tbd-sd-card.zip` for SD card

Source files live uncompressed in `www/`. The build pipeline creates `.gz` versions.

### File path routing
`rest_common_get_handler` strips `?query` params, maps `/` → `/index.html`, and serves from the SD card `www/` root. Any `.html`, `.js`, `.css`, `.svg`, `.ico` file placed in `www/` (with a `.gz` counterpart) is automatically servable.

---

## 1. Identical Files — No Action Needed

These files are **byte-identical** in both folders:

| File | Lines | Status |
|------|-------|--------|
| `js/Sortable.min.js` | 1 (minified) | ✅ Identical |
| `js/webaudio-controls.js` | 2,007 | ✅ Identical |
| `js/display-hints.js` | 470 | ✅ Identical |
| `favicon.ico` | (binary) | ✅ Identical |
| `img/*.svg` | 5 files | ✅ Identical |

**Decision:** No changes needed.

---

## 2. `js/shoelace-bundle.js` — Near-Identical ⚠️ MINOR DIFF

**Status:** 1 line differs (line 3299). The prototype version has **7 additional icon SVGs** in its inline icon registry:
- `check2-circle`, `exclamation-triangle`, `exclamation-octagon`, `table` (used by designer.js)
- Duplicate entries for `wifi`, `sliders`, `download`, `upload` (harmless)

The `www/` version lacks these icons. The designer's macro builder will show empty icon slots without them.

**Decision needed:**
- [x] **Use prototype's `shoelace-bundle.js`** — it is a strict superset; all existing icons remain, new ones added. No risk to `index.html` functionality
- [ ] Keep www's version and add missing icons separately

---

## 3. `js/shared.js` — KEY CONFLICT ⚠️ MAJOR

This is the most important file to reconcile. Both pages depend on it.

### Core section (lines 1–450): Nearly identical

3 small differences in `applyTheme()`:

| Aspect | `www/` version | `prototype/` version |
|--------|----------------|----------------------|
| Sun icon (light mode) | `btn.name = ''; btn.src = 'data:image/svg+xml,...'` workaround (3 lines) | `btn.name = 'sun-fill'` simple (1 line) |
| Moon icon (dark mode) | `btn.src = ''; btn.name = 'moon-fill'` (3 lines) | `btn.name = 'moon-fill'` (1 line) |
| CSS theme file swap | `document.querySelector('link[href*="/shoelace/themes/"]').href = ...` (dynamic swap) | Removed — both themes pre-loaded via `<link>`, class toggle suffices |

**Why `www/` uses the `btn.src` hack:** The www's `shoelace-bundle.js` doesn't include `sun-fill` in its icon registry, so `btn.name = 'sun-fill'` renders nothing. The `btn.src` data-URI is a workaround. If we use the prototype's `shoelace-bundle.js` (which *does* include `sun-fill`), the hack is unnecessary.

**Why `www/` swaps the CSS `<link>`:** `index.html` only loads `dark.css`. When switching to light theme, it dynamically changes the `<link href>`. The prototype loads both `dark.css` and `light.css` in `<head>` and just toggles the `sl-theme-*` class.

**Connection probe:** Both versions use `/getIOCaps` (line 339 in www, line 332 in prototype). ✅ No conflict here.

**`loadWebAudioControls()`:** Present in **both** versions (www line 452, prototype line 445). ✅ No conflict.

### Extension section (lines 450–970): Prototype-only additions

The prototype adds **520 lines** of new functionality after the core:

| Function | Lines | Purpose |
|----------|-------|---------|
| `renderKnobSVG(opts)` | ~90 | Pure SVG rotary knob with 4 color schemes (normal/macro/mix/default) |
| `analyzeMappings(def)` | ~30 | Identify which knobs are "macro" (control 2+ DSP params) |
| `isMacroKnob(analysis, idx)` | ~5 | Check if a specific knob is a macro knob |
| `computeMappingOutputs(def, idx, value)` | ~20 | Calculate real CC output for a knob value |
| `resolveCCName(machineId, ctrl)` | ~15 | CC number → human param name lookup via synth defs |
| `renderKnobGroups(def, vals, opts)` | ~180 | Full knob group renderer with target panels, MACRO badges, range bars |
| `sharedData` store + loaders | ~80 | `synthDefs`, `tracks`, `machines`, `macroDefs`, `soundPresets` |
| `loadSharedData()`, `reloadMacroData()` | ~40 | Fetch from `/api/v1/samples` and `/api/v1/macroapi` |
| Track overview strip | ~60 | `renderTrackOverview()`, `setupTrackOverviewEvents()`, `selectTrack()` |
| Tab state management | ~10 | `setActiveTab()`, `getActiveTab()` |

### Exports comparison

`www/shared.js` exports 30 functions on `window.TBD.shared`.  
`prototype/shared.js` exports the same 30 + **15 additional** ones.

The prototype is a **strict superset** — all 30 original exports are present with identical names and behavior.

**Decision needed:**
- [x] **Replace `www/js/shared.js` with prototype's version** — strict superset, all existing exports preserved. Additional functions simply won't be called by plugin-manager/sample-manager/app.js
- [ ] Keep www's version and maintain two separate shared.js files

**If we take prototype's shared.js, one adaptation is needed in `www/index.html`:**
- [ ] `index.html` currently links only `dark.css`. Either: (a) also add `light.css` `<link>` so the class-toggle approach works, OR (b) patch shared.js `applyTheme()` to support both patterns (check for `<link>` and swap if present, no-op for class toggle)

---

## 4. `js/app.js` — COMPLETELY DIFFERENT ⚠️ NO MERGE POSSIBLE

These are **entirely different applications** — they share the file name but have zero overlapping logic.

### `www/js/app.js` (876 lines) — Plugin & Sample Manager shell
- Configuration dialog (Connection, MIDI, WiFi AP/STA/USB-NCM, Audio codec, Appearance)
- Debug panel with API call logging
- View switching: Plugins ↔ Samples tabs
- Backup/restore (exports config + favorites + all preset data as JSON)
- Control mode toggle (Config sliders ↔ Control knobs)
- 3 Rams-inspired color palettes
- Favorites bar (8 slots)

### `www-prototype/js/app.js` (293 lines) — Preset & Macro Manager shell
- Sidebar tabs (Presets | Macros) with center panel sub-tabs (Knob Preview | Macro Builder)
- Boot sequence: theme → settings → connection monitor → load shared data → init performer/designer
- Quick Start guide dialog with first-visit detection
- Separate connection monitor polling `/api/v1/health` (⚠️ endpoint doesn't exist in firmware!)
- Keyboard shortcuts (Ctrl+1/2 for tab switching)

**Decision needed:**
- [x] **Keep both as separate files** — `www/js/app.js` stays for `index.html`, prototype's `app.js` gets renamed to `preset-macro-app.js` for the new page
- [ ] Attempt to merge into a single app.js (not recommended — fundamentally different UIs)

**Known issue in prototype's app.js:**  
The connection monitor at line 86 pings `/api/v1/health` — this endpoint **does not exist** in the firmware `RestServer.cpp`. The shared.js `startConnectionMonitor()` (which uses `/getIOCaps`) is the correct approach. This should be fixed to use the shared connection monitor instead of the custom one.

---

## 5. `js/performer.js` — PROTOTYPE-ONLY (NEW)

**Status:** Only exists in `www-prototype/`. Not in `www/`. No conflict.

**Content:** 999 lines — the Presets (Performer) mode of the macro manager.

| Feature | Details |
|---------|---------|
| Track info bar | CH badge, track name, machine dropdown, macro dropdown |
| Knob controls | SVG knob groups via `S.renderKnobGroups()` with drag interaction |
| Preset browser | Grouped by category, search filtering, macro filter with dismissible chip |
| Quick actions | Randomize, Init (reset values), Save Preset dialog |
| Machine switching | Auto-selects "allparams" macro definition for new machine |
| Export/Import | JSON export/import of all macroDefs + soundPresets |

**Depends on:** `window.TBD.shared` (all macro data + rendering functions from the extension section)

**API endpoints used:**
- `POST /api/v1/macroapi?action=update_track` — set track machine/macro/params
- `POST /api/v1/samples?action=uploadconfig&path=...` — save preset JSON files

**Decision:**
- [x] **Copy to `www/js/performer.js`** — no conflict, needed by the new page

---

## 6. `js/designer.js` — PROTOTYPE-ONLY (NEW)

**Status:** Only exists in `www-prototype/`. Not in `www/`. No conflict.

**Content:** 1,652 lines — the Macros (Designer) mode of the macro manager.

| Feature | Details |
|---------|---------|
| Macro definition editor | Up to 6 pages × 4 knobs, CC parameter mappings |
| DSP reference panel | All machine CC params with "mapped" indicators |
| Knob cards | Name, SVG preview, properties (def/min/max/res/ui), CC mapping rows |
| CC mapping rows | Range track with draggable thumbs, curve select (linear/log/exp/scurve), 14-bit toggle |
| Constants | Locked CC values not controlled by knobs |
| Sound presets section | Create/save/delete presets per definition |
| 1:1 Map All | Auto-generates passthrough mapping for all machine CCs |
| Live preview | Knob drag updates CC value dots in real time |

**Depends on:** `window.TBD.shared`, `Sortable.min.js` (drag-reorder knob cards)

**API endpoints used:**
- `POST /api/v1/samples?action=uploadconfig&path=macrodefinitions/...` — save definition JSON
- `POST /api/v1/samples?action=manage` — delete definition files
- `GET /api/v1/macroapi/definitions` — reload definitions
- `GET /api/v1/macroapi/soundpresets` — reload sound presets

**Decision:**
- [x] **Copy to `www/js/designer.js`** — no conflict, needed by the new page

---

## 7. `js/plugin-manager.js` — PRODUCTION-ONLY

**Status:** Only exists in `www/`. Not in `www-prototype/`. No conflict.

**Content:** 1,726 lines — dual-slot DSP plugin selection, parameter rendering, CV/TRIG routing, presets.

**Decision:**
- [x] **Keep in `www/js/`** — used only by `index.html` via `app-bundle.js`

---

## 8. `js/sample-manager.js` — PRODUCTION-ONLY

**Status:** Only exists in `www/`. Not in `www-prototype/`. No conflict.

**Content:** 2,650 lines — SD card file browser, WAV upload/transcode, Kit/Bank system with 32×8 slots.

**Decision:**
- [x] **Keep in `www/js/`** — used only by `index.html` via `app-bundle.js`

---

## 9. `css/app.css` — PROTOTYPE-ONLY (NEW)

**Status:** Only exists in `www-prototype/css/`. The `www/` folder has no `css/` directory — `index.html` has all its CSS inline (~1,650 lines within `<style>` tags).

**Content:** 2,081 lines of external CSS for the Preset & Macro Manager layout:
- App shell: flex column 100vh, 48px header, sidebar (260px) + center panel
- Track overview strip with horizontal scroll, FX/Master color variants
- Sidebar: two-tab layout, search, preset list with category headers
- Macro knob groups: collapsible cards, MACRO badges, range bars
- Mix page: dark inversion (slate-800 bg, light knobs)
- Loading overlay, toast stack, connection pill
- Quick Start guide dialog styling

**Decision:**
- [x] **Copy `www-prototype/css/app.css` → `www/css/app.css`** — no conflict, only the new page uses it
- [ ] Note: this CSS file will be auto-gzipped by `create_sd_archive.sh`

---

## 10. `shoelace/themes/light.css` — MISSING FROM PRODUCTION ⚠️

**Status:** `www/shoelace/themes/` has only `dark.css` + `dark.css.gz`.  
`www-prototype/shoelace/themes/` has `dark.css` + `dark.css.gz` + `light.css`.

The prototype's `index.html` loads **both** theme CSS files:
```html
<link rel="stylesheet" href="shoelace/themes/light.css?v=3">
<link rel="stylesheet" href="shoelace/themes/dark.css?v=3">
```

Without `light.css`, the light theme toggle renders a broken/unstyled page.

**Decision needed:**
- [x] **Copy `light.css` to `www/shoelace/themes/`** — needed for theme toggle on the new page
- [ ] **Also update `index.html`?** — Currently `index.html` only loads `dark.css` and dynamically swaps the URL. If we unify shared.js, we may need to add a `light.css` `<link>` to `index.html` too, or keep the dynamic URL swap as a fallback
Comment: The simplest safe approach is to add `light.css` to `www/` (so it's available), and in the unified shared.js, make `applyTheme()` handle both patterns: pages with pre-loaded themes just toggle classes, pages with single `<link>` swap the URL.

---

## 11. `preset-macro-manager.html` — NEW PAGE TO CREATE ⚠️ MAJOR

**Status:** This file does not exist yet. It must be created from `www-prototype/index.html`.

### Source: `www-prototype/index.html` (263 lines)
- Loads: `shoelace/themes/light.css`, `shoelace/themes/dark.css`, `js/shoelace-bundle.js`, `css/app.css`
- Scripts (bottom of body, **6 separate** `<script>` tags):
  ```html
  <script src="js/Sortable.min.js"></script>
  <script src="js/shared.js?v=10"></script>
  <script src="js/display-hints.js?v=6"></script>
  <script src="js/performer.js?v=9"></script>
  <script src="js/designer.js?v=9"></script>
  <script src="js/app.js?v=1"></script>
  ```
- 6 separate script tags = 6 HTTP requests = **too many for ESP32** (socket exhaustion)
- Contains Quick Start Guide dialog, sidebar tabs, track overview strip, center panel

### Required adaptations for production deployment

| Change | Reason |
|--------|--------|
| Rename to `preset-macro-manager.html` | Run alongside `index.html` |
| Replace 6 `<script>` tags with single `macro-bundle.js` | ESP32 socket limit |
| Fix asset paths | Ensure consistent `/` prefixes matching RestServer |
| Add navigation back to main UI | Users need to switch between pages |
| Fix connection monitor | Prototype's app.js pings nonexistent `/api/v1/health` — use shared.js `startConnectionMonitor()` |

**Decision needed:**
- [x] **Create `www/preset-macro-manager.html`** from prototype's `index.html` with the adaptations above
- [x] **Create `macro-bundle.js`** concatenating: `Sortable.min.js` + `shared.js` + `display-hints.js` + `performer.js` + `designer.js` + `preset-macro-app.js`
- [x] HTML should load: `shoelace-bundle.js` (cached) + `macro-bundle.js` (1 request) + `dark.css` (cached) + `light.css` (cached) + `css/app.css` = max 3 non-cached requests on first visit

---

## 12. `index.html` — ADD NAVIGATION ⚠️ IMPORTANT

**Status:** The existing `index.html` has no way to reach the new Preset & Macro Manager page.

### Current nav tabs in `index.html`:
```html
<button class="nav-tab active" id="nav-plugins">
  <sl-icon name="hdd"></sl-icon> Plugins
</button>
<button class="nav-tab" id="nav-samples">
  <sl-icon name="file-earmark-music"></sl-icon> Samples
</button>
```

**Decision needed:**
- [x] **Add a third nav tab** linking to `preset-macro-manager.html`:
  ```html
  <a class="nav-tab" href="/preset-macro-manager.html">
    <sl-icon name="sliders"></sl-icon> Macros
  </a>
  ```
  Use `<a>` instead of `<button>` since it navigates to a different page
- [ ] Similarly, add a "← Plugins & Samples" link in `preset-macro-manager.html`'s header back to `index.html`

---

## 13. `build-webui.sh` — UPDATE FOR TWO BUNDLES ⚠️ HIGH

**Current:** Builds a single `app-bundle.js` from 6 source files and gzips 4 production assets.

**Needed:** Build **two** bundles, gzip **all** production assets.

### Current bundle
```bash
# app-bundle.js (for index.html):
BUNDLE_SOURCES=(
  js/Sortable.min.js
  js/webaudio-controls.js
  js/shared.js
  js/display-hints.js
  js/plugin-manager.js
  js/sample-manager.js
  js/app.js
)
```

### New bundle to add
```bash
# macro-bundle.js (for preset-macro-manager.html):
MACRO_BUNDLE_SOURCES=(
  js/Sortable.min.js
  js/shared.js
  js/display-hints.js
  js/performer.js
  js/designer.js
  js/preset-macro-app.js
)
```

### Gzip list to update
```bash
GZIP_FILES=(
  index.html
  preset-macro-manager.html    # NEW
  js/app-bundle.js
  js/macro-bundle.js            # NEW
  js/shoelace-bundle.js
  shoelace/themes/dark.css
  shoelace/themes/light.css     # NEW
  css/app.css                   # NEW
)
```

**Decision:**
- [x] **Update `build-webui.sh`** with second bundle + expanded gzip list
- [ ] Note: `create_sd_archive.sh` doesn't need changes — it already auto-gzips everything

---

## 14. Prototype-Only Ancillary Files

### `www-prototype/tools/dev-server.js` (403 lines)
Node.js development server that mocks the ESP32 API endpoints. Serves macro API from local `sdcard_image/data/` files.

**Decision:**
- [x] **Move to `www/tools/dev-server.js`** — useful for local development of both pages
- [ ] Keep in `www-prototype/tools/` (prototype folder may eventually be removed)
Comment: This dev server would need updating to also serve `index.html` and its bundle. Could be done later.

### Backup files (`*.bak`)
`www-prototype/` contains 4 `.bak` files: `index.html.bak`, `app-persona.js.bak`, `performer.js.bak`, `designer.js.bak`. These are historical snapshots.

**Decision:**
- [x] **Do NOT copy `.bak` files to `www/`** — they are development artifacts
- [ ] Optionally clean them up from `www-prototype/` later

### `www/.version` file
Contains hash `7e22b6589508c4be32741bd9e968943d`. Used for cache-busting or version tracking.

**Decision:**
- [x] **Keep as-is** — update after integration if needed

---

## 15. Future Cleanup — `www-prototype/` Folder

Once integration is complete and `preset-macro-manager.html` works in `www/`, the `www-prototype/` folder becomes redundant.

**Decision needed:**
- [ ] **Keep `www-prototype/` for now** — reference/comparison during integration testing
- [x] **Delete after verification** — all active code will live in `www/`
- [ ] Move `tools/dev-server.js` to `www/tools/` before deleting

---

## Summary Table

| Area | Action | Priority |
|------|--------|----------|
| `js/Sortable.min.js` | No change (identical) | — |
| `js/webaudio-controls.js` | No change (identical) | — |
| `js/display-hints.js` | No change (identical) | — |
| `js/shoelace-bundle.js` | **Replace with prototype's superset** | High |
| `js/shared.js` | **Replace with prototype's superset** (strict superset — all 30 original exports preserved + 15 new) | Critical |
| `js/app.js` | **Keep unchanged** (production page shell) | — |
| `js/plugin-manager.js` | **Keep unchanged** (production only) | — |
| `js/sample-manager.js` | **Keep unchanged** (production only) | — |
| `js/performer.js` | **Copy from prototype** (new) | Critical |
| `js/designer.js` | **Copy from prototype** (new) | Critical |
| `js/preset-macro-app.js` | **Copy + rename** from prototype's `app.js` | Critical |
| `css/app.css` | **Copy from prototype** (new directory + file) | Critical |
| `shoelace/themes/light.css` | **Copy from prototype** (missing from www) | High |
| `preset-macro-manager.html` | **Create** from prototype's `index.html` + adaptations | Critical |
| `index.html` | **Add nav link** to macro manager page | High |
| `build-webui.sh` | **Update** — add `macro-bundle.js` build + expanded gzip list | High |
| `app-bundle.js` | **Rebuild** (with unified shared.js) | High |
| `img/`, `favicon.ico` | No change (identical) | — |
| `.bak` files | Do NOT copy | — |
| `tools/dev-server.js` | Decide later | Low |
| `www-prototype/` folder | Keep for now, delete after verification | Low |

---

## Suggested Implementation Order

1. **Copy new files** into `www/`:
   - `js/performer.js`, `js/designer.js`
   - `js/preset-macro-app.js` (renamed from prototype's `app.js`)
   - `css/app.css`
   - `shoelace/themes/light.css`

2. **Replace shared files** with prototype's supersets:
   - `js/shared.js` ← prototype's version (may need `applyTheme()` adaptation for `index.html` compatibility)
   - `js/shoelace-bundle.js` ← prototype's version

3. **Adapt `preset-macro-app.js`**:
   - Fix connection monitor to use `S.startConnectionMonitor()` instead of custom `/api/v1/health` polling
   - Add navigation link back to `index.html`

4. **Create `preset-macro-manager.html`**:
   - Based on prototype's `index.html`
   - Single `<script defer src="js/macro-bundle.js">` instead of 6 script tags
   - Add navigation link to `index.html`

5. **Update `index.html`**:
   - If `shared.js` changed theme behavior: add `light.css` `<link>` to `<head>`
   - Add "Macros" nav tab linking to `preset-macro-manager.html`

6. **Update `build-webui.sh`**:
   - Add `macro-bundle.js` build step
   - Expand gzip list

7. **Test `index.html`**:
   - Verify plugin manager, sample manager, config dialog, favorites all still work
   - Verify theme toggle works with unified `shared.js`

8. **Test `preset-macro-manager.html`**:
   - Verify preset browser, knob controls, macro designer render correctly
   - Verify connection monitor works
   - Verify navigation between pages works

9. **Run build pipeline**:
   - `cd www && ./build-webui.sh` — verify both bundles build
   - `bash create_sd_archive.sh` — verify all files end up gzipped in the archive

---

## Key Risk: `shared.js` Theme Toggle Compatibility

The most delicate change is replacing `shared.js`. The theme toggle works differently:

| Pattern | `index.html` (current) | `preset-macro-manager.html` (new) |
|---------|------------------------|-------------------------------------|
| Theme CSS loading | Single `<link>` for `dark.css`, dynamically swapped to `light.css` | Both `<link>`s pre-loaded, class toggle only |
| Icon toggle | `btn.src = data:image/svg+xml,...` (SUN_FILL_SVG constant) | `btn.name = 'sun-fill'` (resolved by shoelace-bundle icon registry) |

**Recommended resolution:** In the unified `shared.js`, make `applyTheme()` handle both:
1. Always set `btn.name` (works when shoelace-bundle has `sun-fill` — which it will after we use prototype's bundle)
2. Check for a single-link page and swap its URL if found, skip if both themes are pre-loaded
3. Remove the `btn.src` data-URI hack (no longer needed with the new shoelace-bundle)

This way both pages work correctly with the same `shared.js`.

---

*Generated: 2026-03-04 | Integration planning: `www-prototype/` → `www/`*
