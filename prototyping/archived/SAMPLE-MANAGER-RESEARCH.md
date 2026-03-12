# TBD-16 Sample Manager & Unified WebUI — Research Document

> **Status:** Research phase — no implementation yet.  
> **Goal:** Determine the best approach for managing samples on the TBD-16 AND define the architecture for a unified modern WebUI replacing the current Onsen UI + jQuery stack.  
> **Hard constraint:** Zero additional server-side load on ESP32-P4. All rendering, logic, and UI computation must happen client-side in the browser. The ESP32 serves only static files + JSON API responses.

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Current Device Architecture](#current-device-architecture)
3. [Reference Tools Research](#reference-tools-research)
4. [In-Browser WAV Conversion](#in-browser-wav-conversion)
5. [Device Webserver Deep Dive](#device-webserver-deep-dive)
6. [Existing WebUI Deep Analysis](#existing-webui-deep-analysis)
7. [Unified WebUI Architecture](#unified-webui-architecture)
8. [Audio Control Components](#audio-control-components)
9. [Additional Audio UI References](#additional-audio-ui-references)
10. [ESP32 File Manager Projects](#esp32-file-manager-projects)
11. [Sample Manager Building Blocks](#sample-manager-building-blocks)
12. [USB Transport — NCM Only](#usb-transport--ncm-only)
13. [Approach Comparison](#approach-comparison)
14. [Recommended Architecture](#recommended-architecture)
15. [Build Plan](#build-plan)
16. [Open Questions](#open-questions)

---

## 1. Problem Statement

Loading custom samples onto the TBD-16 currently requires:

1. Running a Python script (`wav_info_parser.py`) to convert files to 44.1 kHz / mono / 16-bit PCM
2. Opening a local HTML file (`sample_bank_manager.html`) to arrange slots and export a bank JSON
3. Powering off the device, removing the SD card, copying files, reinserting the SD card

Step 1 blocks non-technical users entirely. Step 3 requires physical access to the SD card and a power cycle.

**Ideal UX:** Connect to the device (WiFi AP, WiFi STA, or USB), open the sample manager in a browser, drag-drop audio files, and have them land on the SD card ready to play — no scripts, no card removal, no power cycle.

---

## 2. Current Device Architecture

### Hardware

| Component | Details |
|-----------|---------|
| **Main processor** | ESP32-P4, runs firmware (audio DSP, webserver, USB) |
| **Co-processor** | RP2350, communicates via SPI with ESP32-P4 |
| **PSRAM** | ~28 MB allocated for sample data (`CONFIG_MAX_ALLOC_BYTES_PSRAM_SAMPLE_DATA = 29360128`) |
| **SD card** | SDMMC 4-bit mode, slot 0, mounted at `/sdcard`, DDR50 capable |
| **USB** | TinyUSB: MIDI device + USB NCM (network over USB) |

### SD Card Layout

```
/sdcard/
  www/           ← gzipped web files served by HTTP server
  data/          ← config files (spm-config.jsn, presets, etc.)
  tbdsamples/    ← audio sample WAV files + bank JSON descriptors
  dbup/          ← backup directory
```

### Network Modes

Three connection modes exposed via `network.hpp`:
- **AP** — Device creates its own WiFi access point (default: `ctag-tbd`, IP `192.168.4.1`)
- **STA** — Device joins an existing WiFi network
- **USBNCM** — Network-over-USB, device exposes itself as a USB network adapter

All three modes serve the same WebUI via HTTP. The user connects and opens the device's IP.

### Audio Format Requirements

- 44.1 kHz sample rate
- 16-bit signed integer PCM
- Mono (1 channel)
- Standard RIFF WAV container

### Sample Bank Data Model

**Master index:** `/sdcard/tbdsamples/sample_rom.jsn`
```json
{
  "wt_banks": ["def_wt.jsn"],
  "wt_bank_names": ["Default"],
  "wt_bank_tags": [["basic", "stock"]],
  "smp_banks": ["def_smp.jsn", "a4_dub.jsn"],
  "smp_bank_names": ["Default", "A4 Dub"],
  "smp_bank_tags": [["basic", "stock"], ["analog 4", "dub", "chords", "c-minor"]],
  "active_wt_bank": 0,
  "active_smp_bank": 0
}
```

**Per-bank descriptor** (e.g. `def_smp.jsn`):
```json
[
  { "filename": "kick_001", "path": "drums", "nsamples": 13230 },
  { "filename": "snare_dp", "path": "drums", "nsamples": 17640 }
]
```

Full file paths resolve as: `/sdcard/tbdsamples/<path>/<filename>.wav`

**Constraints:**
- Max sample slots: `CONFIG_MAX_SAMPLES_IN_SAMPLE_ROM` (default 128, configurable 32–1024)
- PSRAM capacity: ~28 MB total for all loaded wavetable + sample data
- Wavetables: each split into 64 sub-slices of 256 samples each
- Filename stems: max 32 characters

### Sample Loading Flow (at runtime)

`ctagSampleRom::RefreshDataStructureFromSDCard()`:
1. Allocate one contiguous PSRAM block (`maxPSRAMSize`)
2. Read active wavetable bank → load each WAV → split into 256-sample slices
3. Read active sample bank → load each WAV → append to PSRAM buffer
4. Track `sliceOffsets[]` and `sliceSizes[]` for random access by DSP plugins

### Bank Switching (already implemented via SPI API)

`SpiAPI.cpp` already handles bank switching from the RP2350:
```
DisablePluginProcessing()  →  switch active bank index  →  RefreshDataStructure()  →  EnablePluginProcessing()
```
This same sequence can be called from an HTTP endpoint.

### Existing File Transfer Protocol (SPI)

`SpiAPI::handle_send_file()` already receives files over SPI with:
- CRC32 checksums per chunk
- 2033-byte chunks
- Target path on `/sdcard/`
- Completion callback

This proves the device can write files to SD while running. The challenge is doing it over HTTP instead of SPI.

---

## 3. Reference Tools Research

### [Kastle2 Wave Bard](https://github.com/bastl-instruments/kastle2-webapps/tree/main/wave-bard-sample-loader)

- **Stack:** React + Vite, `@dnd-kit/sortable`, `jszip`, `file-saver`
- **Approach:** Build → copy `dist/` to FTP; also runs in dev with `npm run dev`
- **What it does:** Loads audio presets, converts audio in-browser, exports a raw binary blob to device
- **Useful patterns:** Drag-to-reorder, preset system, in-browser audio processing via Web Audio API, ZIP download
- **Not applicable:** Binary blob export format (TBD-16 uses WAV + JSON); React build step

### [little-scale Simple Editor](https://github.com/little-scale/simple-editor)

- **Stack:** Vanilla HTML/CSS/JS, zero dependencies, single `index.html`
- **Approach:** Open file directly in browser
- **What it does:** Full audio editor — trim, normalize, fade, gain, reverse, undo/redo, canvas waveform, spectrum analyser, peak/LUFS metering
- **Useful patterns:** Canvas waveform renderer, trim/loop-point selection, per-file editing UX, keyboard shortcuts
- **Not applicable:** No bank/slot management concept; no batch export

### [zeptocore tool](https://zeptocore.com/tool) — [source: schollz/_core](https://github.com/schollz/_core)

- **Stack:** Go backend server (`sox` for audio conversion) + web frontend; downloadable binary
- **What it does:** Upload samples, `sox` handles conversion server-side, serial/USB communication with device
- **Not applicable:** Requires installing software; `sox` dependency; session-URL model

---

## 4. In-Browser WAV Conversion

All audio conversion the Python script does can be replicated in the browser using standard Web APIs:

```
File (WAV/MP3/AIFF/OGG/FLAC)
  → AudioContext.decodeAudioData()
      ↓  browser handles all format decoding natively
  → OfflineAudioContext(channels=1, length=frames, sampleRate=44100)
      ↓  forces mono downmix + resamples to 44.1 kHz automatically
  → offlineCtx.startRendering() → AudioBuffer (float32 samples)
      ↓
  → Int16Array  =  Float32Sample × 32767  (clamped ±1)
      ↓
  → 44-byte RIFF/WAV header  (DataView, ~25 lines of code)
      ↓
  → Blob  stored in memory, ready for upload or preview
```

Processing runs in a **Web Worker** to keep the UI responsive during batch imports.

---

## 5. Device Webserver Deep Dive

### Server Configuration

Source: `main/RestServer.cpp`

```cpp
httpd_config_t config = HTTPD_DEFAULT_CONFIG();
config.uri_match_fn = httpd_uri_match_wildcard;
config.max_uri_handlers = 20;
config.stack_size = 8192;
config.core_id = 0;          // web server on core 0
config.task_priority = tskIDLE_PRIORITY + 4;
config.recv_wait_timeout = 10;
config.send_wait_timeout = 10;
config.lru_purge_enable = true;
```

Audio DSP runs on **core 1**. No contention with HTTP serving.

### Current API Endpoints (V1)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/getPlugins` | List available plugins |
| GET | `/api/v1/getActivePlugin/:ch` | Get active plugin for channel |
| GET | `/api/v1/setActivePlugin/:ch` | Set active plugin |
| GET | `/api/v1/getPluginParams/:ch` | Get plugin parameters |
| GET | `/api/v1/setPluginParam/:ch` | Set a plugin parameter |
| GET | `/api/v1/getPresets/:ch` | List presets |
| POST | `/api/v1/savePreset/:ch` | Save preset |
| POST | `/api/v1/loadPreset/:ch` | Load preset |
| GET | `/api/v1/getConfiguration` | Get device config |
| POST | `/api/v1/setConfiguration` | Set device config |
| POST | `/api/v1/getPresetData/:ch` | Export preset data |
| POST | `/api/v1/setPresetData/:ch` | Import preset data |
| GET | `/api/v1/favorites/:ch?` | Manage favorites |
| GET | `/api/v1/reboot` | Reboot device |
| GET | `/api/v1/getIOCaps` | Get I/O capabilities |
| GET | `/*` | Serve static files from `/sdcard/www/` (gzipped) |

**No file upload/download endpoints exist currently.**

### Static File Serving

Files under `/sdcard/www/` are served with `Content-Encoding: gzip`. The build script (`create_sd_archive.sh`) pre-gzips all web assets. The wildcard `/*` handler matches any URI not claimed by API routes and maps it to files on the SD card.

### Key Capabilities for Sample Manager

From the ESP-IDF `esp_http_server` API (confirmed for ESP32-P4):

| Feature | Available | Notes |
|---------|-----------|-------|
| **File upload (POST body)** | Yes | `httpd_req_recv()` reads body in chunks; no size limit beyond RAM |
| **Chunked response** | Yes | `httpd_resp_send_chunk()` for streaming responses |
| **SSE (Server-Sent Events)** | Yes* | Use `httpd_resp_set_type("text/event-stream")` + chunked send; need to keep connection open |
| **WebSocket** | Yes | Built-in with `CONFIG_HTTPD_WS_SUPPORT` |
| **Async handlers** | Yes | `httpd_req_async_handler_begin/complete()` for long-running requests |
| **Queued work** | Yes | `httpd_queue_work()` to run functions in HTTPD context from other tasks |
| **Max URI handlers** | 20 | Currently ~16 used; 4 slots available for new endpoints |
| **Max open sockets** | 7 (default) | 3 reserved for internal use |
| **Thread safety** | No | APIs not thread-safe; caller must synchronize |

**SSE implementation note:** The server can hold a connection open and send `text/event-stream` data using `httpd_resp_send_chunk()`. However, since the server is single-threaded per connection, an SSE endpoint would tie up one of the limited socket slots for the duration. This is acceptable for a single-client sample manager session.

### File Upload Feasibility

The ESP-IDF includes an official [file_serving example](https://github.com/espressif/esp-idf/tree/97d95853/examples/protocols/http_server/file_serving) demonstrating both upload and download over HTTP. Pattern:

```c
esp_err_t upload_handler(httpd_req_t *req) {
    char buf[4096];
    int fd = open(filepath, O_WRONLY | O_CREAT | O_TRUNC);
    int remaining = req->content_len;
    while (remaining > 0) {
        int received = httpd_req_recv(req, buf, MIN(remaining, sizeof(buf)));
        write(fd, buf, received);
        remaining -= received;
    }
    close(fd);
    // respond with success
}
```

This runs on core 0 while audio DSP continues on core 1. SD card writes are blocking but the SDMMC 4-bit interface is fast (~10–25 MB/s raw). A 1 MB sample upload over WiFi would be limited by WiFi throughput (~2–5 MB/s), not SD card speed.

### Timeouts and Large Uploads

Default `recv_wait_timeout` and `send_wait_timeout` are 10 seconds. For large file uploads, these may need to be extended or the upload chunked with progress callbacks. The SPI file transfer protocol already solves this with 2033-byte chunks + CRC32 — a similar approach over HTTP would use multipart upload or chunked POST.

---

## 6. Existing WebUI Deep Analysis

### Current Stack

| Component | Library | Size (approx.) |
|-----------|---------|----------------|
| UI framework | **Onsen UI** (`onsenui.min.js` + CSS) — mobile-first component library | ~200 KB gzipped |
| DOM manipulation | **jQuery 3.4.1** | ~30 KB gzipped |
| AJAX queue | **ajaxq.js** — serializes jQuery AJAX requests | ~1 KB |
| Drag & drop | **Sortable.min.js** | ~10 KB gzipped |
| ZIP | **jszip.min.js** | ~28 KB gzipped |

### Pages and Code Volume

| File | Lines | Custom JS Lines | Purpose |
|------|-------|-----------------|---------|
| `index.html` | 43 | ~5 | SPA entry, loads Onsen UI + jQuery, `<ons-navigator>` rooted at main.html |
| `main.html` | 442 | ~350 | Main dashboard: plugin selection (ch0/ch1), favorites, config link |
| `edit.html` | ~300 | ~170 | Generic plugin parameter editor — **THE core UI pattern** |
| `config.html` | 502 | ~400 | Network/device config, backup/restore (JSZip), reboot |
| `drumrack.html` | 42 | ~5 | Shell for drumrack (standalone, NOT Onsen UI) |
| `drumrack.js` | 1,202 | 1,202 | Full DrumRack plugin UI — **largest file, already vanilla** |
| `load.html` | 48 | ~25 | Preset load (Onsen UI list) |
| `save.html` | 67 | ~40 | Preset save (Onsen UI dialog) |
| `fav.html` | 40 | ~25 | Favorites editor |
| `drumrack.css` | 370 | — | Standalone styling: grid, groups, sliders, modals, responsive |
| `sample-rom.css` | ~95 | — | Sample ROM manager styles |

**Total custom JavaScript: ~2,223 lines across all files.**

### 15 Unique API Endpoints Used

```
getPlugins, getActivePlugin, setActivePlugin, getPluginParams, setPluginParam,
getPresets, savePreset, loadPreset, getConfiguration, setConfiguration,
getPresetData, setPresetData, favorites, getIOCaps, reboot
```

### Critical UI Patterns That Must Be Replicated

1. **Dynamic parameter renderer** (`edit.html`) — recursive `renderParams()` handling types: `group`, `int` (range slider + number input), `bool` (switch). CV/TRIG routing dropdowns per parameter. Double-click to reset. Real-time parameter sending via serialized AJAX.

2. **Plugin selection with stereo/mono awareness** (`main.html`) — plugin select dropdowns that understand stereo routing (channel 0 can claim both channels).

3. **Favorites system** (`main.html`) — recall/snap/edit/export/import. Import uses `FileReader` + JSON parsing with parameter migration across firmware versions.

4. **DrumRack UI** (`drumrack.js`) — the most complex and most modern page:
   - 3→2→1 responsive grid columns
   - Collapsible parameter groups with CSS transitions
   - Inline-editable values (double-click)
   - One-shot trigger buttons
   - Shift-click automation mapping popup with red dot indicators
   - Debounced 120ms parameter sends
   - Polling every 2s for mapping updates
   - Per-model help modals with SVG diagrams

5. **Backup/Restore** (`config.html`) — downloads all plugin preset data sequentially with retry logic, creates ZIP via JSZip. Restore uploads JSON and migrates parameters between firmware versions.

6. **Config management** — daisy chain, stereo routing, codec levels, WiFi/USB NCM settings.

### Key Observations

- **DrumRack is already vanilla HTML5** — no Onsen UI, no jQuery dependency for rendering. It's the closest to what the new UI should look like.
- **`edit.html` is the critical path** — generic plugin parameter editing from JSON schema is the most reused pattern. Any new framework must handle this elegantly.
- **AJAX serialization** — `ajaxq.js` ensures requests execute in order. This prevents race conditions when rapidly adjusting parameters. A replacement must maintain this guarantee.
- **All logic is client-side already** — the server only serves static files and a JSON API. No server-side rendering. This means the fundamental architecture is already correct for our constraint.
- **Total code is manageable** — ~2,223 lines of custom JS is not massive. A full rewrite is feasible.

---

## 7. Unified WebUI Architecture

> **Decision: Datastar is NOT viable.** It shifts rendering load to the ESP32-P4 (server must generate HTML fragments). This directly violates our hard constraint: zero additional server-side load. The ESP32 must ONLY serve static files + JSON API. All rendering happens in the browser.

### Target Stack: Vanilla JS + Tailwind CSS + Web Components

This is the recommended replacement for Onsen UI + jQuery:

#### Vanilla JavaScript (ES Modules)

- **No framework runtime.** Zero KB added to bundle for a framework.
- **Native `fetch()` API** replaces jQuery AJAX. A thin wrapper with request serialization replaces `ajaxq.js`.
- **ES Modules (`import/export`)** — modern, tree-shaking-friendly code organization.
- **`CustomEvent` + `EventTarget`** for decoupled component communication.
- **Template literals** for HTML generation (already used in drumrack.js).
- **AI-friendly:** LLMs work extremely well with vanilla JS — no framework-specific patterns to hallucinate.

#### Tailwind CSS — Build-time Compiled

- **Build-time only.** Tailwind CLI scans HTML/JS files, generates a single CSS file containing only the used utility classes. This file is pre-built and served as a static `.css.gz` from the SD card.
- **Typical output size:** 5–15 KB gzipped for a project this size (vs ~200 KB for Onsen UI CSS).
- **No runtime JS.** Tailwind is pure CSS — zero impact on ESP32.
- **Standalone CLI available** — no Node.js needed during build. Binary for macOS/Linux/Windows.
- **Dark mode:** `dark:` variant built-in, respects `prefers-color-scheme`.
- **Responsive:** `sm:`, `md:`, `lg:` breakpoints built-in.

Build command:
```bash
npx @tailwindcss/cli -i ./src/input.css -o ./sdcard_image/www/css/tbd.css --minify
```

**Alternative: Pico CSS** — If a build step is undesirable, Pico CSS (~10 KB gzipped) provides classless styling with semantic HTML. No build step, no utility classes — just `<input>`, `<button>`, `<table>` styled automatically. Offers a class-less version that styles bare HTML. However, Tailwind provides more control and is more AI-tool-friendly (classes describe intent).

**Recommendation:** Tailwind CSS with build step. The `create_sd_archive.sh` already pre-gzips assets — adding a Tailwind build step is trivial.

#### Web Components (Custom Elements)

Web Components are the native browser standard for reusable UI components:

```js
class TbdKnob extends HTMLElement {
  static get observedAttributes() { return ['value', 'min', 'max', 'label']; }
  
  connectedCallback() {
    this.attachShadow({ mode: 'open' });
    this.render();
  }
  
  attributeChangedCallback(name, oldVal, newVal) {
    this.render();
  }
  
  render() {
    this.shadowRoot.innerHTML = `
      <style>/* scoped styles */</style>
      <div class="knob">...</div>
    `;
  }
}
customElements.define('tbd-knob', TbdKnob);
```

Usage in HTML:
```html
<tbd-knob value="64" min="0" max="127" label="Cutoff"></tbd-knob>
```

**Pros:**
- Native browser standard — no library needed
- Encapsulated styles via Shadow DOM
- Works anywhere HTML works
- Future-proof (browser standard, not a framework that can die)
- Each component is a self-contained file — easy to test, replace, or AI-generate

**Shadow DOM + Tailwind issue:** Tailwind utility classes don't penetrate Shadow DOM boundaries. Two solutions:
1. **Light DOM components** (no Shadow DOM) — simpler, Tailwind works normally, but styles leak
2. **Inject Tailwind into Shadow DOM** — each component imports the shared Tailwind CSS
3. **Use CSS custom properties (variables)** — define design tokens in `:root`, components use `var(--color-primary)` etc.

**Recommendation:** Use Light DOM Web Components (no Shadow DOM) for Tailwind compatibility, with CSS custom properties for theming. This is the pragmatic approach — Shadow DOM isolation isn't critical for a single-app WebUI.

#### Lit Framework (Optional Enhancement)

[Lit](https://lit.dev) (~5 KB gzipped) is a thin wrapper over Web Components by Google:
- Reactive properties (auto re-render on change)
- Declarative templates with `html` tagged template literals
- Used by Adobe, Google, IBM, Microsoft, SAP, Home Assistant
- Part of the OpenJS Foundation

```js
import { LitElement, html, css } from 'lit';

class TbdKnob extends LitElement {
  static properties = {
    value: { type: Number },
    min: { type: Number },
    max: { type: Number },
  };
  
  render() {
    return html`<div class="knob">...</div>`;
  }
}
customElements.define('tbd-knob', TbdKnob);
```

**Trade-off:** Lit adds ~5 KB but significantly reduces boilerplate for reactive components. The parameter editor (`edit.html`) with its dynamic rendering would benefit most from Lit's reactivity. However, it requires a build step (import from npm).

**Recommendation:** Start with vanilla Web Components. Evaluate Lit if the parameter editor's reactivity becomes hard to manage manually. The DrumRack page (1,202 lines of vanilla JS) already proves vanilla is viable for complex UIs.

### Architecture Summary

```
Browser (all rendering here)        ESP32-P4 (static serving only)
┌──────────────────────────┐        ┌──────────────────────┐
│  Vanilla JS (ES Modules) │◄──────►│  Static file server  │
│  Web Components          │  JSON  │  /sdcard/www/*.gz    │
│  Tailwind CSS (pre-built)│  API   │  REST API endpoints  │
│  webaudio-controls       │        │  No rendering!       │
└──────────────────────────┘        └──────────────────────┘
```

---

## 8. Audio Control Components

### webaudio-controls (g200kg)

[GitHub](https://github.com/g200kg/webaudio-controls) — 359 stars, Apache 2.0, last commit 4 months ago, actively maintained for 13 years.

A **Web Components library** providing audio-specific UI controls:

#### Components

| Component | Element | Purpose |
|-----------|---------|---------|
| Knob | `<webaudio-knob>` | Rotary control with sprite-based skins or CSS-only default |
| Slider | `<webaudio-slider>` | Linear slider (horizontal or vertical) |
| Switch | `<webaudio-switch>` | Toggle switch (on/off) or multi-position |
| Param | `<webaudio-param>` | Numeric display/input associated with a control |
| Keyboard | `<webaudio-keyboard>` | Piano keyboard with configurable range |

#### Key Attributes (shared across components)

```html
<webaudio-knob
  src="knob-sprite.png"    <!-- sprite image (optional, CSS-only default) -->
  value="64"               <!-- current value -->
  min="0" max="127"        <!-- range -->
  step="1"                 <!-- increment -->
  width="48" height="48"   <!-- dimensions -->
  sprites="100"            <!-- frames in sprite strip -->
  sensitivity="1"          <!-- drag sensitivity -->
  log="0"                  <!-- logarithmic scale -->
  valuetip="1"             <!-- show value tooltip -->
  tooltip="Cutoff"         <!-- hover tooltip text -->
  conv="instruments"       <!-- value conversion function name -->
  midilearn="1"            <!-- enable right-click MIDI learn -->
  midicc="21"              <!-- pre-assigned MIDI CC -->
  colors="#fc0;#000;#fff"  <!-- fg;bg;indicator colors for CSS-only mode -->
></webaudio-knob>
```

#### Events

- `input` — fires continuously during drag (like `<input type="range">`)
- `change` — fires on release (final value)
- `click` — button/key presses

#### Key Features

- **Single JS file** (~30 KB uncompressed) — no dependencies, no build step
- **CSS-only mode** — works without any sprite images, using `colors` attribute
- **MIDI Learn** — right-click any control to learn a MIDI CC mapping
- **Touch / Multi-touch** — full mobile support
- **Sprite-based skins** — traditional synth UI look with knob image strips
- **`conv` attribute** — custom value display conversion (e.g., note names, dB)

#### Applicability to TBD-16

| Current UI Element | webaudio-controls Replacement |
|--------------------|-----------------------------|
| `<input type="range">` in edit.html | `<webaudio-knob>` or `<webaudio-slider>` |
| `<ons-switch>` for booleans | `<webaudio-switch>` |
| DrumRack sliders | `<webaudio-slider>` with CSS styling |
| DrumRack inline values | `<webaudio-param>` linked to controls |
| Future MIDI mapping UI | Built-in MIDI learn (right-click) |

**Verdict:** webaudio-controls is an excellent fit. It's Web Components-based (aligns with our architecture), audio-specific, tiny, and the MIDI learn feature directly supports TBD-16's automation mapping. The CSS-only mode means we don't need to ship sprite images (saving SD card space).

### input-knobs (g200kg) — Lighter Alternative

[GitHub](https://github.com/g200kg/input-knobs) — 57 stars, MIT, same author as webaudio-controls.

A **simpler subset** that enhances standard `<input>` tags:

```html
<input type="range" class="input-knob" data-diameter="48" data-fgcolor="#fc0">
<input type="checkbox" class="input-switch">
```

- Replaces appearance of standard `<input>` elements (knobs, sliders, switches)
- Fires standard `input` and `change` events
- No MIDI learn, no keyboard widget, no param display
- Even lighter than webaudio-controls

**Verdict:** Too minimal for TBD-16. We want MIDI learn, param display, and the richer API of webaudio-controls.

### Recommendation

**Use webaudio-controls** directly, or create a modern fork/wrapper:

**Option A — Use as-is:** Load `webaudio-controls.js` (~30 KB) as a static file from SD card. No build step needed. Works immediately with Web Components architecture.

**Option B — Modern fork:** Fork webaudio-controls, modernize to ES Modules, add Tailwind CSS integration, keep the same public API. This is the "create a modern version" approach.

**Option C — Custom TBD components wrapping webaudio-controls:** Create `<tbd-param-knob>`, `<tbd-param-switch>` etc. that wrap webaudio-controls with TBD-specific behavior (CV/TRIG routing dropdown, double-click reset, debounced API calls).

**Recommended: Option C.** Use webaudio-controls as the rendering engine, wrap with TBD-specific Web Components that add the parameter editing behaviors currently scattered across edit.html and drumrack.js.

---

## 9. Additional Audio UI References

Research into real-world audio Web UIs, sample management tools, and headless component libraries — conducted to validate our architecture decisions and discover patterns worth adopting.

### 9.1 Stompenberg FX (Thomann)

[Thomann Product Page](https://www.thomann.de/gb/stompenberg.html) — Web Audio-based guitar pedal emulator, v3.7.1.

**What it is:** A fully browser-based guitar effects chain allowing users to plug in a guitar via an audio interface, apply modelled pedal effects in real-time, and hear the processed output. Built by Thomann (Europe's largest music retailer).

**UI Patterns Observed:**
- Skeuomorphic pedal UI with realistic rotary knobs per pedal (GAIN, TONE, LEVEL, DRIVE, BOOST, HIGH, MID, LOW)
- Toggle switches (BYPASS, BOOST) with on/off visual state
- Stomp pedal buttons with LED indicators
- Signal chain displayed as a linear pedal board
- Cabinet simulation section with Celestion IR loading (including user-uploaded IRs)
- Microphone input / audio interface routing
- Uses Web Audio API for real-time processing (low-latency)
- Requires Chrome or Firefox (Web Audio API dependency)

**Source Code:** Closed source — no public GitHub repository found. Cannot extract implementation details.

**What's useful for TBD-16:**
- Validates the pattern of sophisticated audio UI (knobs, switches, LED indicators) running entirely in the browser
- Demonstrates that skeuomorphic knob controls work well for audio parameter editing in Web UIs
- The pedal chain metaphor (linear signal routing visible to user) could inform how we display the TBD-16's sound processor chain
- Confirms that Web Audio API + custom knob UI is a proven, production-quality approach used by major industry players

**Limitations:** Closed source, so no code to reference or learn from directly. The patterns are observational only.

### 9.2 tahti.studio

[tahti.studio](https://tahti.studio) — Browser-based music creation tool.

**What it is:** A fully in-browser music-making tool. The main application is a heavy SPA (Single Page Application) that renders entirely client-side.

**Source Code:** Closed source. Only one public repository: [tahti-studio/tahti-default-library](https://github.com/tahti-studio/tahti-default-library) (42 stars) containing sample/pattern data files — no application code.

**What's useful for TBD-16:**
- Example of a professional-grade audio tool built entirely as a client-side SPA
- Validates that complex audio workflows (sequencing, sample management, pattern editing) can run well in the browser without server-side processing

**Limitations:** No source code available. The only observable detail is that it follows the SPA pattern with client-side rendering, which we already plan to use.

### 9.3 teenage.engineering EP Sample Tool

[EP Sample Tool](https://teenage.engineering/apps/ep-sample-tool) — Web-based sample management for EP-133 / EP-133 KO, v1.2.0.

**What it is:** A browser-based tool for managing samples on the EP-133 sampler. Connects to the device via **WebUSB**, allows drag & drop upload of samples, library browsing, and slot assignment.

**UI Patterns Observed:**
- **24+ numbered sample slots** arranged in a grid, each showing upload state (uploading / pending / fail)
- **Drag & drop** to upload samples and to assign samples to slots
- **Sample library browser** with categorized samples
- **Keyboard navigation**: "MOVE UP & DOWN WITH KEYBOARD ARROWS", "SPACE TO LISTEN"
- WebUSB device connection flow: "please connect! USB" → device detection → "looking for devices..."
- Tabs: IN / OUT / SOUND / EDIT / sample library
- Clean, minimal TE design language — sparse monospaced typography, generous whitespace, no gradients or shadows

**Architecture:**
- Fully client-side SPA
- WebUSB for device communication (we use USB NCM + HTTP instead — WebUSB cannot coexist with USB MIDI on our hardware)
- Real-time sample preview in browser
- Library management with drag & drop assignment

**UX Patterns directly applicable to TBD-16 Sample Manager:**

| TE Pattern | TBD-16 Adaptation |
|------------|-------------------|
| Numbered slot grid | Sample bank grid view showing all 32 slots |
| Drag & drop to upload | Drag audio files onto browser → auto-convert + upload via HTTP POST |
| Drag & drop to assign | Drag from library to slot for reordering |
| Upload state indicators | Per-slot status: empty / uploading / ready / error |
| Keyboard navigation | Arrow keys to navigate slots, Space to preview |
| Sample library browser | Browsable file listing from SD card with preview playback |
| Minimal typography focus | Aligns with our Tailwind CSS direction |

**Key insight:** The TE EP Sample Tool demonstrates that a GREAT sample management UX is possible with these core interactions: numbered slots + drag & drop + keyboard shortcuts + inline preview. No knobs or complex controls needed in the sample management view — those belong in the parameter editing view.

### 9.4 mzero/elk-herd — Elektron Device Manager

[GitHub](https://github.com/mzero/elk-herd) — 51 stars, BSD-2-Clause, v3.3.4 (7 months ago), written in Elm (94.9%).

**What it is:** A browser-based device manager for Elektron instruments (Digitakt, Digitakt II, Model:Samples, Analog Rytm MK I & II). Manages +Drive sample storage, projects, and patterns via **WebMIDI SysEx**.

**Features:**
- +Drive sample management: drag & drop to transfer files to/from computer, reorganize, rename
- Project & pattern management: transfer, reorganize, import between projects
- Sound & sample pool editing with automatic plock synchronization
- "Find unused slots" and "move free space to end" utilities
- Runs as a purely client-side static page (hosted online, or downloaded as .tgz and opened locally)
- Uses WebMIDI (Chrome) — no server needed, no install

**Architecture (from CONTRIBUTING.md — 75+ source files, 17k lines):**

```
Elm application (pure functional)
├── SysEx stack (message encoding/decoding, client, connection)
├── Elektron stack (binary struct parsing, Digitakt/Rytm support)
├── Application layer
│   ├── Samples (tree view, selection, transfer, drag ops)
│   ├── Project (banks, patterns, sounds, import)
│   └── Main (views, MIDI setup, settings)
├── UI via Bootstrap HTML (no Elm UI framework)
└── Ports → JavaScript (WebMIDI, jQuery, file download)
```

**UI Patterns Relevant to TBD-16:**
- **Tree view for samples** with drag & drop reorganization — directly applicable to SD card file browser
- **Slot/bank management** with visual grid and drag reordering
- **Transfer progress** for SysEx file transfers (analogous to HTTP upload progress)
- **"Find unused slots"** — useful utility concept for TBD-16's sample bank cleanup
- **Works offline** — static page architecture proves the "serve from SD card" model works well
- **Long file name handling** — layout fixes for very long sample names (relevant concern)

**What's NOT applicable:**
- Elm language (we use Vanilla JS)
- WebMIDI/SysEx transport (we use HTTP REST)
- jQuery/Bootstrap UI layer (we use Tailwind + Web Components)

**Key insight:** elk-herd proves that complex device management (transfers, reorganization, cross-project imports) works well as a purely client-side static page with no server processing. The tree view + drag & drop pattern for sample organization is battle-tested for music devices.

### 9.5 satelllte/react-knob-headless

[GitHub](https://github.com/satelllte/react-knob-headless) — 82 stars, MIT, v0.4.0 (Jun 2025), TypeScript (99.6%).

**What it is:** An unstyled, accessible knob primitive for React. The term "headless" means it provides behavior and accessibility but NO visual styling — you supply all CSS/SVG yourself.

**Architecture & API (highly relevant for our headless component strategy):**

| Component / Hook | Purpose |
|------------------|---------|
| `KnobHeadless` | Main knob primitive — renders a `<div>` with ARIA `slider` role |
| `KnobHeadlessLabel` | `<label>` element linked via `aria-labelledby` |
| `KnobHeadlessOutput` | `<output>` element linked via `htmlFor` |
| `useKnobKeyboardControls` | Hook for arrow key / Page Up / Page Down / Home / End |

**Key Props (KnobHeadless):**

| Prop | Type | Purpose |
|------|------|---------|
| `valueRaw` | number | Current value (unrounded) |
| `valueMin` / `valueMax` | number | Range bounds |
| `dragSensitivity` | number | Mouse/touch drag scaling (recommended: 0.006) |
| `valueRawRoundFn` | function | Rounding function |
| `valueRawDisplayFn` | function | Human-readable display formatter |
| `onValueRawChange` | function | Change callback |
| `mapTo01` / `mapFrom01` | function | Non-linear interpolation pair (e.g., logarithmic frequency) |
| `axis` | `"x"` / `"y"` / `"xy"` | Gesture direction |
| `includeIntoTabOrder` | boolean | Tab focus (default: false) |

**Gesture Support:** Mouse drag + touch, powered by `@use-gesture`. Supports Y-axis (default, natural for audio), X-axis, and XY (added in latest version).

**Non-linear Interpolation Pattern (critical for audio):**
```
mapTo01(value, min, max) → normalized [0..1]
mapFrom01(normalizedValue, min, max) → actual value
```
This pair enables logarithmic frequency knobs (where 0.5 position = ~1 kHz instead of linear midpoint ~10 kHz). TBD-16 has similar needs for frequency, time, and level parameters.

**Accessibility:** Follows ARIA Slider pattern — `role="slider"`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, `aria-orientation`.

**Key insight for TBD-16:** The headless pattern (behavior + accessibility, zero styling) is the cleanest separation of concerns for knob components. While we use Web Components instead of React, the same principle applies: our `<tbd-param-knob>` can use webaudio-controls for rendering and implement the same `mapTo01`/`mapFrom01` interpolation API and ARIA attributes. The `dragSensitivity` prop (at 0.006) is a good empirical starting point.

### 9.6 audio-ui.xyz (ouestlabs/audio-ui)

[Website](https://audio-ui.xyz) | [GitHub](https://github.com/ouestlabs/audio-ui) — 127 stars, MIT, actively maintained (commits 2 weeks ago).

**What it is:** An audio-specific UI component library built on top of **shadcn/ui** (React + Tailwind CSS). It follows the "copy & paste, own the code" philosophy — components are copied into your project, not installed as a black-box dependency.

**Stack:** React, Next.js, TypeScript, Tailwind CSS, shadcn/ui registry pattern.

**Components Available:**

| Component | Type | Description |
|-----------|------|-------------|
| Knob | UI Control | Circular rotary control with arc indicator + pointer, 4 sizes (sm/default/lg/xl) |
| Fader | UI Control | Vertical or horizontal slider with configurable thumb marks, 3 sizes |
| Slider | UI Control | Standard range slider |
| XY Pad | UI Control | 2D control surface with crosshairs and grid, for filter freq/res etc. |
| Sortable List | UI | Drag-reorderable list |
| Audio Player | Media | Playback controls + waveform |
| Audio Provider | State | React context provider for audio state |
| Audio Queue | Media | Playlist/queue management |
| Audio Track | Media | Individual track display |
| Playback Speed | Media | Speed control for audio playback |

**API Design Pattern (Knob):**
```jsx
<Knob
  value={50}              // controlled value
  defaultValue={50}       // or uncontrolled
  min={0} max={100}
  step={1}
  size="default"          // "sm" | "default" | "lg" | "xl"
  onValueChange={fn}      // during interaction
  onValueCommit={fn}      // on release (committed value)
  disabled={false}
/>
```

**Notable design decisions:**
- **`onValueChange` vs `onValueCommit`** — separates continuous feedback (for live preview) from final committed value (for saving). This is directly relevant to TBD-16 where we want real-time parameter updates during drag but only save on release.
- **Primitives from `audio-ui` npm package** → styled components in shadcn/ui registry. Two-layer architecture.
- **XY Pad** — niche but directly useful for TBD-16's filter and modulation parameters that could benefit from 2D control.

**What's useful for TBD-16:**
- The `onValueChange` / `onValueCommit` pattern should be adopted for our API design
- XY Pad component confirms this is a standard audio UI pattern worth considering
- Sortable List is exactly what we need for sample bank slot reordering
- The Fader with configurable thumb marks is a clean design for linear parameters
- Component size variants (sm/default/lg/xl) provide a sensible sizing system

**What's NOT directly applicable:**
- React dependency (we use Vanilla JS Web Components)
- shadcn/ui pattern requires a build step + copy tool
- Next.js framework dependency

**Key insight:** audio-ui.xyz validates our architectural intuitions: audio UIs need Knobs, Faders, XY Pads, and Sortable Lists as primitives. The `onValueChange`/`onValueCommit` dual-callback pattern is a best practice we should adopt. The two-layer architecture (headless primitives + styled registry) maps well to our webaudio-controls (renderer) + TBD wrappers (behavior) approach.

### 9.7 satelllte/adsr — ADSR Synthesizer

[GitHub](https://github.com/satelllte/adsr) — 26 stars, GPL-3.0, v0.5.1.

**What it is:** A simple browser-based synthesizer built with [Elementary Audio](https://www.elementary.audio/) framework. By the same author as react-knob-headless. Uses Tailwind CSS for styling.

**Architecture:** Next.js + TypeScript + Elementary Audio + Tailwind CSS.

**UI Components (from `src/components/ui/`):**

| Component | Description |
|-----------|-------------|
| `Knob.tsx` | Uses `react-knob-headless` (PR #80) — lives demonstration of the headless knob |
| `KnobAdr.tsx` | Specialized knob for Attack/Decay/Release time parameters |
| `KnobFrequency.tsx` | Frequency knob with logarithmic scaling |
| `KnobPercentage.tsx` | Percentage knob (0-100%) |
| `Button.tsx` | Standard button |
| `InteractionArea.tsx` | Touch/click interaction surface |
| `Meter.tsx` | Audio level meter |
| `Skeleton.tsx` | Loading skeleton placeholder |
| `DotStatus.tsx` | MIDI connection status indicator |

**What's useful for TBD-16:**
- Real-world example of specialized knob variants (frequency, percentage, ADR time) built on top of a headless primitive — validates our wrapping approach
- MIDI connection status indicator pattern — applicable to TBD-16's device connection status
- Shows the Tailwind + headless knob pattern working in production
- Elementary Audio integration proves that serious audio processing can run in the browser alongside custom knob UI

**Key insight:** This project demonstrates the full vertical stack: headless knob primitive → specialized typed knobs (frequency, percentage, time) → complete synth UI. Our TBD-16 parameter components should follow this same pattern: `webaudio-controls` (primitive) → `<tbd-knob-frequency>`, `<tbd-knob-percentage>`, `<tbd-knob-time>` (typed wrappers) → plugin editor page (composition).

### 9.8 @potato/root — Web Audio Component Library

[npm](https://www.npmjs.com/package/@potato/root) | [GitHub](https://github.com/liamnewmarch/root) — 1 star, MIT, v0.3.0 (alpha), TypeScript (83%).

**What it is:** A **Web Components library** for synthesized sound using the Web Audio API. Created by Potato Labs (now AKQA Leap). Designed with modularity — individual controls combine into modules, modules combine into instruments.

**Architecture: Native Web Components + Signal Routing**

```html
<!-- Declares audio routing between components -->
<root-connect>
  <root-osc id="osc-1" sendTo="filter-1"></root-osc>
  <root-filter id="filter-1" sendTo="output" receiveFrom="osc-1"></root-filter>
</root-connect>
```

**Components:**
- `<root-osc>` — Multi-wave oscillator module
- `<root-filter>` — Dual filter module
- `<root-keyboard>` — Musical keyboard
- `<root-synth>` — Complete synthesizer (composed from above)
- Signal routing via `sendTo` / `receiveFrom` HTML attributes — modular synth "virtual cable" metaphor

**Stack:** TypeScript, Storybook for documentation, `@open-wc` tooling, Web Components (custom elements).

**What's useful for TBD-16:**
- **Pure Web Components** — no React, no framework dependency. This is closest to our target architecture
- **Declarative signal routing** (`sendTo`/`receiveFrom` attributes) is an interesting pattern for expressing audio flow in HTML
- **Modular composition** — individual controls → modules → instruments maps to our components → pages architecture
- **Storybook** for component development and documentation — good practice for developing UI components in isolation

**What's NOT applicable:**
- Web Audio API synthesis (we're controlling hardware, not synthesizing in browser)
- Very low adoption (1 star, alpha quality, 3 years stale)
- The actual component implementations are audio synthesis-focused, not audio parameter control-focused

**Key insight:** Root validates that building a complete audio UI library with native Web Components is viable. The `sendTo`/`receiveFrom` declarative routing pattern is elegant but not needed for TBD-16. The main takeaway is architectural: pure Web Components + TypeScript + Storybook is a proven development stack for audio UI libraries.

### 9.9 Cross-Reference Summary

| Reference | Open Source | Tech Stack | Knobs | Faders | XY Pad | Sample Mgmt | Drag & Drop | Offline |
|-----------|------------|------------|-------|--------|--------|-------------|-------------|---------|
| **Stompenberg** | No | Web Audio | Yes (skeuomorphic) | No | No | No | No | No |
| **tahti.studio** | No | SPA | Unknown | Unknown | Unknown | Yes | Unknown | Unknown |
| **TE EP Sample Tool** | No | SPA + WebUSB | No | No | No | Yes (24 slots) | Yes | No |
| **elk-herd** | Yes (BSD-2) | Elm + Bootstrap | No | No | No | Yes (tree) | Yes | Yes |
| **react-knob-headless** | Yes (MIT) | React + TS | Yes (headless) | No | No | No | No | N/A |
| **audio-ui.xyz** | Yes (MIT) | React + Tailwind | Yes | Yes | Yes | No | Yes (sortable) | N/A |
| **satelllte/adsr** | Yes (GPL-3) | React + Elementary | Yes (headless) | No | No | No | No | No |
| **@potato/root** | Yes (MIT) | Web Components + TS | No | No | No | No | No | Yes |

### 9.10 Key Takeaways for TBD-16

1. **Headless + Styled layers is the right pattern.** react-knob-headless (behavior) → adsr specialized knobs (styled) proves the two-layer approach. Our equivalent: webaudio-controls (rendering) → `<tbd-param-*>` (TBD behavior).

2. **`onValueChange` / `onValueCommit` dual callbacks.** Adopted by audio-ui.xyz, this separates "live dragging" from "final value saved." Critical for TBD-16 where we want real-time parameter updates during drag but only POST on release.

3. **Typed knob variants.** Instead of one generic knob, create typed variants: `<tbd-knob-frequency>` (log scale), `<tbd-knob-percentage>` (0-100%), `<tbd-knob-time>` (ms/s with ADR semantics). Each knows its `mapTo01`/`mapFrom01` and display formatting.

4. **Sample management UX = slots + drag & drop + keyboard nav + preview.** TE EP Sample Tool and elk-herd both prove this minimal set of interactions is sufficient and effective.

5. **Static page architecture works.** elk-herd (51 stars, complex device manager) runs as a downloadable .tgz static page — validates our "serve from SD card" model.

6. **Web Components are viable for audio UI.** @potato/root (albeit low adoption) proves the approach. Combined with webaudio-controls (359 stars, 13 years), Web Components are a solid foundation.

7. **ARIA Slider pattern for accessibility.** react-knob-headless follows WAI-ARIA Slider pattern — our components should too: `role="slider"`, `aria-valuemin/max/now`, keyboard support (arrow keys, Page Up/Down, Home/End).

8. **`dragSensitivity` ~0.006 is the empirical sweet spot.** From react-knob-headless — a good default for vertical drag gesture knobs.

---

## 10. ESP32 File Manager Projects

### [ESPFMfGK](https://github.com/holgerlembke/ESPFMfGK) — ESP32 File Manager for Generation Klick

36 stars, v2.0.17 (March 2025), C++ (60.7%) + JavaScript (38.1%).

**What it is:** A complete web-based file manager for ESP32 supporting ALL filesystems (FFAT, SD, SD-MMC, LittleFS, SPIFFS) simultaneously.

**Features:**
- Drag & drop file upload (sequential upload with progress)
- Download files (click filename), delete, rename/move (even across devices/filesystems)
- Flat or folder view with path navigation
- Built-in text editor with windowed UI (multiple concurrent editors, draggable/resizable)
- File preview (images + text)
- "Download all files" as ZIP archive
- Client-side gzip compression of files
- Flag-based permission system per file (candownload, candelete, canrename, canedit, canpreview, cangzip)
- Authentication support
- Customizable HTML includes for extending the UI
- Background color and page title configurable from server

**Architecture analysis of `fm.js` (~800 lines):**

```
Boot → GET /b (boot info: bg color, title, filesystem info, HTML includes)
     → GET /i?fs=N&t=bool&pn=folder (file listing with flags)
     
Upload: drag & drop → sequential upload via FormData POST to /r?fs=N&fn=path
Delete: GET /job?fs=N&job=del&fn=filename
Rename: GET /job?fs=N&job=ren&fn=old&new=newname
Download: window.location.href = /job?fs=N&job=download&fn=filename
Edit: GET /job?fs=N&job=edit&fn=filename → returns textarea HTML
Save: POST multipart to /r?fs=N&fn=filename
Preview: GET with blob response → window with image or text content
Download All: window.location.href = /job?fs=N&job=dwnldll&mode=1-3&fn=dummy&folder=path
```

**UI Pattern:** Vanilla JavaScript, no frameworks, no jQuery. Uses XHR (XMLHttpRequest) for all communication. Dynamically builds HTML from server responses using string templates with `%fn%`, `%fs%` style placeholders. Draggable/resizable windows implemented with pure mouse/touch event handling.

**Code quality note:** The code is functional but uses older patterns (var, string concatenation, global state). The architecture with custom delimiters (`String.fromCharCode(3,1,2)`) for parsing server responses is fragile. However, the fundamental patterns — sequential upload, file operations via REST, windowed editor — are proven and relevant.

**What's useful for TBD-16:**
- Sequential file upload pattern (one at a time, with progress)
- Drag & drop upload handler pattern
- Flag-based file permission system concept
- Client-side gzip compression for files
- Windowed editor UX (could be useful for sample bank editing)

**What's NOT useful:**
- Server-side HTML generation (violates our client-side-only constraint)
- Custom delimiter-based response parsing (use JSON instead)
- Global mutable state architecture
- The code itself is not modern enough to reuse directly

### [ESP-IDF file_serving example](https://github.com/espressif/esp-idf/tree/master/examples/protocols/http_server/file_serving)

Official Espressif example demonstrating HTTP file serving with upload/download/delete.

**Key patterns from `file_server.c`:**

```c
// Upload handler — reads POST body in chunks, writes to file
esp_err_t upload_post_handler(httpd_req_t *req) {
    char *buf = server_data->scratch;  // 8 KB scratch buffer
    int remaining = req->content_len;
    while (remaining > 0) {
        int received = httpd_req_recv(req, buf, MIN(remaining, SCRATCH_BUFSIZE));
        if (received == HTTPD_SOCK_ERR_TIMEOUT) continue;  // retry on timeout
        fwrite(buf, 1, received, fd);
        remaining -= received;
    }
}

// Download handler — reads file in chunks, sends as HTTP response
esp_err_t download_get_handler(httpd_req_t *req) {
    char *chunk = server_data->scratch;
    size_t chunksize;
    do {
        chunksize = fread(chunk, 1, SCRATCH_BUFSIZE, fd);
        httpd_resp_send_chunk(req, chunk, chunksize);
    } while (chunksize != 0);
    httpd_resp_send_chunk(req, NULL, 0);  // end of response
}
```

**URI wildcard matching** — uses `httpd_uri_match_wildcard` to handle `/*`, `/upload/*`, `/delete/*` patterns with a single handler each.

**Directly applicable to TBD-16's sample upload/download endpoints.**

### Common Pattern Across All ESP32 File Managers

1. Register URI handlers with wildcard matching for file paths
2. Upload: read POST body in chunks (4–8 KB), write to filesystem
3. Download: read file in chunks, send as chunked HTTP response
4. Delete: `unlink()` the file
5. List: `opendir()` + `readdir()` → build response (JSON in our case)

This is exactly what TBD-16 needs for sample file management. The pattern is proven, efficient, and doesn't add server-side rendering load.

---

## 11. Sample Manager Building Blocks

### Audio Waveform Rendering — wavesurfer.js

[GitHub](https://github.com/katspaugh/wavesurfer.js) — 10.1k stars, BSD-3-Clause, v7.12.1, actively maintained, 285 contributors.

**What it is:** Interactive waveform rendering + audio playback library.

- TypeScript API, renders into Shadow DOM
- Available via CDN: `<script src="https://unpkg.com/wavesurfer.js@7"></script>`
- Or as ES Module: `import WaveSurfer from 'wavesurfer.js'`
- Plugins: Regions (markers/overlays), Timeline, Minimap, Envelope (fade in/out), Record, Spectrogram, Hover
- CSS styling via `::part()` pseudo-selector
- **Size:** ~30 KB gzipped

**Applicability:**
- Waveform preview of samples before upload
- Trim/loop point selection using Regions plugin
- Audio playback preview directly in browser
- Could replace the custom canvas waveform renderer we'd otherwise need to build

**Concern:** May be overkill for simple sample thumbnails. A lightweight custom canvas renderer (~50 lines) might suffice for the file list view, with wavesurfer.js reserved for the detailed editor view.

### File Upload — Native Drag & Drop vs. Libraries

#### Option A: Native Drag & Drop API (Recommended)

```js
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  const files = e.dataTransfer.files;
  for (const file of files) {
    uploadFile(file);
  }
});

async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch('/api/v1/samples/upload?path=drums&filename=' + file.name, {
    method: 'POST',
    body: formData,
  });
}
```

~30 lines of code. No library needed. Already proven in ESPFMfGK.

#### Option B: FilePond

[FilePond](https://pqina.nl/filepond/) — 16k+ stars. Feature-rich file upload with drag & drop, progress, image preview, client-side image optimization.

- Vanilla JS core, no framework dependency
- Plugins: image preview, image crop, image resize, file validate type/size
- **Size:** ~25 KB gzipped (core) + plugins

**Verdict:** Overkill for our use case. We're uploading WAV files to a specific REST endpoint, not building a general-purpose upload UI. Native drag & drop + fetch is sufficient and adds zero dependencies.

### ZIP Operations — JSZip

Already used in the current WebUI (`jszip.min.js`, ~28 KB gzipped). Continue using it for:
- Backup/restore (config.html pattern)
- Offline sample bank export (ZIP with WAVs + bank JSON)
- Bulk download of samples

### Drag & Drop Reordering — SortableJS

Already used in the current WebUI (`Sortable.min.js`, ~10 KB gzipped). Continue using it for:
- Reordering sample slots within a bank
- Favorites reordering

### Request Serialization — Custom Fetch Queue

Replace `ajaxq.js` (jQuery plugin) with a vanilla JS fetch queue:

```js
class FetchQueue {
  #queue = [];
  #running = false;
  
  async enqueue(url, options = {}) {
    return new Promise((resolve, reject) => {
      this.#queue.push({ url, options, resolve, reject });
      this.#process();
    });
  }
  
  async #process() {
    if (this.#running || this.#queue.length === 0) return;
    this.#running = true;
    const { url, options, resolve, reject } = this.#queue.shift();
    try {
      const response = await fetch(url, options);
      resolve(response);
    } catch (err) {
      reject(err);
    }
    this.#running = false;
    this.#process();
  }
}
```

~20 lines. Replaces the jQuery dependency of ajaxq.js entirely.

### Summary: What to Use vs. Build

| Feature | Use Existing Library | Build Custom |
|---------|---------------------|--------------|
| Audio controls (knobs/sliders/switches) | **webaudio-controls** (~30 KB) | |
| Waveform preview (thumbnails) | | **Custom canvas** (~50 lines) |
| Waveform editor (trim/loop) | **wavesurfer.js** (~30 KB, optional) | |
| File upload | | **Native drag & drop** (~30 lines) |
| ZIP export | **JSZip** (~28 KB, already used) | |
| Drag reorder | **SortableJS** (~10 KB, already used) | |
| Request queue | | **FetchQueue** (~20 lines) |
| Audio conversion | | **Web Audio API** (~100 lines) |
| CSS framework | **Tailwind CSS** (build-time, ~10 KB output) | |

**Total new library additions:** webaudio-controls (~30 KB) + optionally wavesurfer.js (~30 KB).
**Libraries we can DROP:** Onsen UI (~200 KB), jQuery (~30 KB), ajaxq.js (~1 KB).
**Net savings:** ~170+ KB gzipped.

---

## 12. USB Transport — NCM Only

> **Decision: WebUSB is NOT viable.** Tested on actual hardware: WebUSB cannot coexist with USB MIDI on the TBD-16. Since USB MIDI is a core feature, WebUSB is ruled out.

### USB NCM (Current Implementation)

USB NCM (Network Control Model) is **already implemented** in the firmware:
- Device exposes itself as a USB network adapter
- Standard TCP/IP networking over USB
- Works in **all browsers** (it's just HTTP over a network interface)
- Same WebUI served on the same port as WiFi AP and WiFi STA
- Zero additional firmware work needed

### Why Not WebUSB

| Issue | Impact |
|-------|--------|
| **Cannot coexist with USB MIDI** | Tested on hardware — fails |
| Chromium-only | No Firefox, no Safari |
| Requires custom binary protocol | Significant firmware effort |
| Permission dialog every session | Poor UX |
| USB NCM already works | No benefit over existing solution |

### Verdict

USB transport for sample management (and all WebUI) is **USB NCM**. The user plugs in USB, gets a network interface, opens a browser to the device IP. Same experience as WiFi, but wired and potentially faster.

No further USB transport research needed.

---

## 13. Approach Comparison

### Approach A: Unified Rewrite — New WebUI with Sample Manager

Replace the entire Onsen UI + jQuery WebUI with a modern Vanilla JS + Tailwind CSS + Web Components stack. Include sample manager as an integrated page.

| Pro | Con |
|-----|-----|
| One unified, modern codebase | Larger initial scope (rewrite all pages) |
| Consistent UX across all features | Must replicate all existing functionality |
| AI-friendly (vanilla JS + Tailwind) | Needs build step for Tailwind CSS |
| Drop ~230 KB of Onsen/jQuery dependencies | Learning curve for Web Components |
| Future-proof (browser standards) | Risk of regression during rewrite |
| webaudio-controls adds professional audio UX | — |
| Sample manager integrated from day one | — |

### Approach B: Incremental — Add Sample Manager to Existing UI

Add a standalone `sample-manager/` page (like DrumRack) while keeping existing Onsen UI.

| Pro | Con |
|-----|-----|
| Faster time to sample management | Two UI frameworks in one app |
| No risk to existing functionality | Inconsistent UX |
| Can use modern stack for new page | Legacy code continues to accumulate |
| DrumRack proves standalone pages work | No path to modernizing existing pages |

### Approach C: Phased Migration — New Pages First, Migrate Later

Build new pages (sample manager) in the new stack. Gradually migrate existing pages one at a time.

| Pro | Con |
|-----|-----|
| Get sample manager quickly | Temporary mixed-framework state |
| Each migrated page is independently testable | Migration takes longer overall |
| Lower risk per change | Must maintain backward compat during transition |
| Can ship updates incrementally | — |

### Approach D: Standalone HTML Tool (no device needed)

Sample manager as a standalone HTML file that works offline. ZIP export only.

| Pro | Con |
|-----|-----|
| Works offline, from `file://` | Requires SD card removal and power cycle |
| No firmware changes needed | No hot-reload; must reboot device |
| Simple deployment | Cannot browse existing samples on device |

---

## 14. Recommended Architecture

### Primary: Approach C (Phased Migration) — Recommended

Start with new pages in the modern stack, then migrate existing pages incrementally.

**Rationale:** Gets us sample management quickly while establishing the new architecture. Each page migration is a self-contained task that can be verified independently. The DrumRack page already proves the standalone page pattern works.

### Phase 1 — Foundation (new stack setup)

- [ ] Set up Tailwind CSS build in project (add to `create_sd_archive.sh`)
- [ ] Create `tbd-ui.js` — shared module with:
  - FetchQueue (request serialization)
  - Device detection (`/api/v1/getIOCaps` probe)
  - Common utilities (debounce, throttle)
- [ ] Create `tbd-nav.js` — navigation component (sidebar or header)
- [ ] Load `webaudio-controls.js` as static asset
- [ ] Create TBD-specific wrapper components:
  - `<tbd-param-knob>` — knob + value display + CV/TRIG routing + double-click reset
  - `<tbd-param-slider>` — slider variant
  - `<tbd-param-switch>` — boolean toggle
  - `<tbd-param-group>` — collapsible parameter group

### Phase 2 — Sample Manager (new page)

- [ ] `sample-manager/index.html` — standalone page (like DrumRack pattern)
- [ ] Audio conversion module (Web Audio API → 44.1kHz mono 16-bit WAV)
- [ ] Bank editor (slots, reorder, capacity tracking)
- [ ] Waveform thumbnails (custom canvas, ~50 lines)
- [ ] Drag & drop upload to device via new REST endpoints
- [ ] Offline fallback: ZIP export + manual SD card copy

### Phase 3 — Firmware Endpoints (4 new handlers)

```
POST /api/v1/samples/upload      — chunked file receive → SD card write
GET  /api/v1/samples/list        — directory listing + bank metadata JSON
DELETE /api/v1/samples/delete    — file removal
POST /api/v1/samples/setBank     — update bank JSON, trigger RefreshDataStructure()
```

Uses ~4 of the remaining URI handler slots (20 max, ~16 currently used).

### Phase 4 — Migrate DrumRack (easiest, already vanilla)

- [ ] Replace jQuery dependency with native fetch
- [ ] Replace `$.getq()` with FetchQueue
- [ ] Add Tailwind CSS classes (or keep custom CSS)
- [ ] Integrate `webaudio-controls` for knobs/sliders

### Phase 5 — Migrate Edit Page (critical path)

- [ ] Rewrite `renderParams()` using Web Components
  - `<tbd-param-knob>` replaces `<input type="range">` + `<input type="number">`
  - `<tbd-param-switch>` replaces `<ons-switch>`
  - `<tbd-param-group>` replaces Onsen lists with collapsible groups
- [ ] Remove jQuery dependency
- [ ] Same JSON API, same parameter schema

### Phase 6 — Migrate Remaining Pages

- [ ] `main.html` → plugin selection, favorites, config link
- [ ] `config.html` → network config, backup/restore
- [ ] `load.html`, `save.html`, `fav.html` → preset management
- [ ] `index.html` → new entry point (no Onsen navigator)

### Phase 7 — Remove Legacy Dependencies

- [ ] Remove `onsenui.min.js`, `onsenui.min.css`
- [ ] Remove `jquery-3.4.1.min.js`
- [ ] Remove `ajaxq.js`
- [ ] Clean up `sdcard_image/www/`

### Deployment Structure

```
sdcard_image/www/
  index.html              ← new entry point (no Onsen)
  css/
    tbd.css               ← Tailwind CSS output (pre-built, gzipped)
  js/
    tbd-ui.js             ← shared utilities, FetchQueue
    tbd-nav.js            ← navigation component
    tbd-components.js     ← TBD-specific Web Components
    webaudio-controls.js  ← audio control library
    jszip.min.js          ← ZIP operations (keep)
    sortable.min.js       ← drag reorder (keep)
  pages/
    main.html             ← plugin selection, favorites
    edit.html             ← plugin parameter editor
    config.html           ← device configuration
    presets.html           ← preset load/save/favorites
    drumrack.html         ← drum rack plugin UI
    sample-manager.html   ← NEW: sample management
```

### New API Endpoints Design

```
POST /api/v1/samples/upload
  Content-Type: multipart/form-data (or application/octet-stream)
  Query params: ?path=drums&filename=kick_001
  Body: raw WAV data (already converted client-side to 44.1kHz/mono/16-bit)
  Response: { "ok": true, "nsamples": 13230, "size": 26460 }

GET /api/v1/samples/list
  Response: {
    "banks": { ... },              // sample_rom.jsn content
    "files": [                     // directory listing of /sdcard/tbdsamples/
      { "name": "kick_001.wav", "path": "drums", "size": 26460 }
    ]
  }

DELETE /api/v1/samples/delete?path=drums&filename=kick_001
  Response: { "ok": true }

POST /api/v1/samples/setBank
  Body: { "type": "smp", "index": 0, "descriptor": [...] }
  Action: write bank JSON, update sample_rom.jsn, call RefreshDataStructure()
  Response: { "ok": true }
```

---

## 15. Build Plan

### Phase 1 — Foundation: New WebUI Stack

- [ ] Install Tailwind CSS CLI, configure build
- [ ] Add Tailwind build step to `create_sd_archive.sh`
- [ ] Create `tbd-ui.js` — FetchQueue, device detection, debounce/throttle
- [ ] Create `tbd-nav.js` — navigation sidebar/header component
- [ ] Add `webaudio-controls.js` to `/sdcard/www/js/`
- [ ] Create TBD wrapper components:
  - `<tbd-param-knob>` (wraps webaudio-knob + CV/TRIG + API integration)
  - `<tbd-param-slider>` (wraps webaudio-slider)
  - `<tbd-param-switch>` (wraps webaudio-switch)
  - `<tbd-param-group>` (collapsible parameter group)
- [ ] Create new `index.html` entry point with SPA-style client-side routing

### Phase 2 — Audio Conversion Core (client-side, no device needed)

- [ ] WAV file reader (`DataView` RIFF parser — PCM + IEEE float, any rate/channels)
- [ ] `OfflineAudioContext` pipeline: decode → resample → mono downmix
- [ ] `buildWAV(int16Array, sampleRate)` — 44-byte RIFF header writer
- [ ] Web Worker for batch processing
- [ ] Filename normaliser: 32 ASCII chars, de-duplicate suffixes

### Phase 3 — Sample Manager Page

- [ ] `sample-manager.html` — new page in modern stack
- [ ] Bank browser: list banks, switch active bank
- [ ] Sample list: grid/list view of samples in active bank
- [ ] Drag & drop file upload with progress (native drag & drop + fetch)
- [ ] Waveform thumbnails (custom canvas renderer)
- [ ] Bank editor: add/remove/reorder slots, capacity check (~28 MB)
- [ ] Offline mode: ZIP export with JSZip (same pattern as config.html backup)
- [ ] Device connectivity detection (online: direct upload, offline: ZIP export)

### Phase 4 — Firmware Endpoints (4 new handlers)

- [ ] `POST /api/v1/samples/upload` — chunked file receive → SD card write
- [ ] `GET /api/v1/samples/list` — directory listing + bank metadata
- [ ] `DELETE /api/v1/samples/delete` — file removal
- [ ] `POST /api/v1/samples/setBank` — bank JSON update + `RefreshDataStructure()`
- [ ] Handle timeouts for large uploads (extend `recv_wait_timeout` or chunk)

### Phase 5 — Migrate DrumRack

- [ ] Replace jQuery with native fetch
- [ ] Replace `$.getq()` with FetchQueue
- [ ] Integrate `webaudio-controls` for sliders
- [ ] Adopt Tailwind CSS (or keep custom drumrack.css if preferred)

### Phase 6 — Migrate Edit Page (most important)

- [ ] Rewrite `renderParams()` using `<tbd-param-knob>`, `<tbd-param-switch>`, `<tbd-param-group>`
- [ ] Remove Onsen UI dependency
- [ ] Remove jQuery dependency
- [ ] Same API, same JSON schema

### Phase 7 — Migrate Remaining Pages

- [ ] Main page (plugin selection, favorites)
- [ ] Config page (network, backup/restore)
- [ ] Preset load/save/favorites

### Phase 8 — Cleanup & Polish

- [ ] Remove Onsen UI, jQuery, ajaxq.js files
- [ ] Responsive layout verification (mobile + desktop)
- [ ] Dark/light theme (`prefers-color-scheme`)
- [ ] Keyboard shortcuts
- [ ] Documentation update

---

## 16. Open Questions

1. **Tailwind CSS vs. Pico CSS vs. Custom CSS** — Tailwind requires a build step but gives precise control and is AI-friendly. Pico CSS is zero-build-step and classless but less flexible. Custom CSS (like drumrack.css) is already proven. What's the preference?

2. **Lit framework** — Should we use Lit (~5 KB) for Web Components reactivity, or stick with vanilla CustomElements? Lit reduces boilerplate significantly for reactive components like the parameter editor. Trade-off: adds a build step and a dependency.

3. **webaudio-controls: use as-is or fork?** — The existing library works but has older code patterns. Should we use it directly (simplest), wrap it with TBD-specific components (recommended), or fork and modernize the codebase?

4. **wavesurfer.js: include or build custom?** — For sample waveform preview, wavesurfer.js (~30 KB) is feature-rich but may be overkill. A custom canvas renderer (~50 lines) handles basic thumbnails. Include wavesurfer.js for the full editor experience, or build minimal?

5. **Upload size limits** — What's the largest single sample file we should support? WiFi throughput (~2–5 MB/s) and PSRAM constraints (~28 MB total) suggest a practical per-file limit. What should it be?

6. **Concurrent access** — The HTTP server is not thread-safe. If someone uploads a file while another connection edits plugin params, what happens? May need a mutex around file operations.

7. **Bank hot-reload safety** — `DisablePluginProcessing()` stops audio output momentarily. Brief silence acceptable during bank switching, or should we warn the user?

8. **Migration strategy** — Should we migrate page by page (Approach C), or do a full rewrite (Approach A)? Page-by-page is lower risk but means a temporary mixed state. Full rewrite is cleaner but higher risk.

9. **Build tooling** — Current deployment is `create_sd_archive.sh` which gzips files. Adding Tailwind CLI is minimal. But should we also add a JS bundler (esbuild, rollup) for combining modules? Or keep individual files loaded via `<script type="module">`?

10. **Existing `sample_bank_manager.html`** — The current standalone sample bank manager HTML file in `sample_rom/` — should it be the basis for the new page, or should we start fresh with the new component architecture?
