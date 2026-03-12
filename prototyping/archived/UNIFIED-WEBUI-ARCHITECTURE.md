# TBD Audio Processing Platform — Unified WebUI Architecture

> **Status:** Design specification — informed by research, prototype screenshots, and seed text iterations.  
> **Companion:** [SAMPLE-MANAGER-RESEARCH.md](SAMPLE-MANAGER-RESEARCH.md) — detailed research backing the decisions here.  
> **Hard constraint:** Zero server-side rendering. ESP32-P4 serves only static files + JSON API. All UI logic runs in the browser.

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [What's Wrong with the Current WebUI](#2-whats-wrong-with-the-current-webui)
3. [Target Architecture](#3-target-architecture)
4. [Application Layout](#4-application-layout)
5. [Plugin System & Schema-Driven UI](#5-plugin-system--schema-driven-ui)
6. [Component Library](#6-component-library)
7. [State Management](#7-state-management)
8. [API Layer](#8-api-layer)
9. [Sample Management Integration](#9-sample-management-integration)
10. [MIDI Integration](#10-midi-integration)
11. [Theming & Appearance](#11-theming--appearance)
12. [Build & Deployment](#12-build--deployment)
13. [Migration Path](#13-migration-path)
14. [Open Decisions](#14-open-decisions)

---

## 1. Design Philosophy

### One UI for All Plugins

The WebUI must be **generic**. It serves every plugin in the firmware — 56 plugins today, more tomorrow — through a single, schema-driven interface. No plugin-specific pages. No `drumrack.html`. No special-casing. If a plugin has parameters described by its `mui-*.jsn` schema, the UI renders it automatically.

### No Pages

The current WebUI is built as a **stack of pages** with an Onsen UI navigator pushing/popping HTML fragments:

```
index.html → main.html → edit.html (channel params)
                        → load.html (load preset)
                        → save.html (save preset)
                        → fav.html  (edit favorites)
                        → config.html (device config)
```

Every navigation is a full page transition. Context is lost. The user can't see both plugin slots at once while editing. They can't glance at favorites while adjusting parameters. They can't monitor MIDI status while loading presets.

**The new UI is a single-page application.** Everything is visible or one click/tap away. No page transitions. No "back" button navigation. Panels slide, modals overlay, sections collapse — but the core layout never tears down and rebuilds.

### Direct Manipulation

- See both slots. Edit both slots. No "enter/exit editing mode."
- Drag a plugin from the browser sidebar onto a slot to load it.
- Click a favorite number to recall instantly.
- Adjust a parameter and see the value update in real-time — no save button for parameter changes.

### Design References

- **Teenage Engineering** — minimal, expressive, monospaced data display
- **Dieter Rams** — clarity, honesty, "less but better"
- **VCV Rack** — modular audio DSP interface patterns

---

## 2. What's Wrong with the Current WebUI

### Page Navigation Model

| Current Flow | Problem |
|-------------|---------|
| main.html → "Edit channel 0" → pushes edit.html | Leaves main page entirely. Can't see slot 1, favorites, or config. |
| main.html → "Load preset" → pushes load.html | Separate page just to pick a preset from a dropdown. |
| main.html → "Save preset" → pushes save.html | Separate page just to enter a name and confirm. |
| main.html → "Edit" favorites → pushes fav.html | Separate page for favorite editing. |
| main.html → "Edit configuration" → pushes config.html | Another separate page. |
| drumrack.html is standalone | Entirely separate app. Not navigable from main UI. |

**Total: 8 HTML files** for what should be a single screen with panels.

### Technology Debt

| Component | Issue |
|-----------|-------|
| Onsen UI (~200 KB) | Mobile-first framework adding weight for components we barely use (`<ons-list>`, `<ons-switch>`, `<ons-button>`) |
| jQuery 3.4.1 (~87 KB) | Used only for AJAX (`$.getq`) and trivial DOM queries that `document.querySelector` handles natively |
| ajaxq.js | Request queue library — replaceable with ~20 lines of vanilla JS |
| `<ons-navigator>` page stack | The root of the "pages" problem. Forces page-based mental model. |

### Missing Features

- **No sample management** — users must use Python scripts + physical SD card access
- **No MIDI mapping UI** in the current shipped WebUI (only in prototypes)
- **No dark mode**
- **No theming / color customization**
- **No connection status indicator**
- **No plugin search or categorization** — just a flat dropdown sorted alphabetically
- **No keyboard shortcuts**
- **No responsive layout** — Onsen UI handles mobile but desktop is wasted space
- **No parameter groups collapsibility** — a plugin with 40+ params is a wall of sliders

### What Works (Keep These)

- **Schema-driven parameter rendering** — `renderParams()` in edit.html dynamically builds UI from JSON. This pattern is correct and must be preserved.
- **Request serialization** — `ajaxq.js` ensures ordered API calls. Keep the pattern, rewrite the implementation.
- **CV/TRIG routing dropdowns** alongside parameters — unique to hardware synth UIs, essential for TBD.
- **Double-click to reset** parameter to 0/min — good UX, keep it.
- **Favorites model** — plugin A + preset A + plugin B + preset B = one favorite slot. Simple, effective.

---

## 3. Target Architecture

### Stack

```
┌─────────────────────────────────────────────────────────┐
│  Browser (all rendering + logic)                        │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Vanilla JS   │  │ Tailwind CSS │  │ Web Components│  │
│  │ ES Modules   │  │ (pre-built)  │  │ (Light DOM)   │  │
│  └──────┬──────┘  └──────────────┘  └───────┬───────┘  │
│         │                                    │          │
│  ┌──────┴────────────────────────────────────┴──────┐   │
│  │              webaudio-controls.js                 │   │
│  │              (~30 KB, knobs/sliders/switches)     │   │
│  └──────────────────────┬────────────────────────────┘  │
│                         │                               │
│  ┌──────────────────────┴───────────────────────────┐   │
│  │         FetchQueue  (request serialization)       │   │
│  │         + Web MIDI API (parameter control)        │   │
│  └──────────────────────┬───────────────────────────┘   │
└─────────────────────────┼───────────────────────────────┘
                          │ HTTP / JSON
┌─────────────────────────┼───────────────────────────────┐
│  ESP32-P4               │                               │
│  ┌──────────────────────┴───────────────────────────┐   │
│  │  Static file server  (/sdcard/www/*.gz)           │   │
│  │  REST API endpoints  (JSON only, no rendering)    │   │
│  └───────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Why This Stack

| Choice | Rationale |
|--------|-----------|
| **Vanilla JS (ES Modules)** | Zero framework runtime. LLM-friendly. No build step required for JS itself. `import/export` for clean code organization. |
| **Tailwind CSS (pre-built)** | Utility-first, 5–15 KB output. Build step runs once during `create_sd_archive.sh`. Dark mode built-in. Responsive built-in. |
| **Web Components (Light DOM)** | Browser-native component model. No Shadow DOM → Tailwind classes work directly. Future-proof (W3C standard). |
| **webaudio-controls** | 13-year-old, 359-star Web Components library for audio knobs/sliders/switches. Single 30 KB file. MIDI learn. CSS-only mode. |
| **No Alpine.js** | Evaluated in prototype iterations. Adds reactive scoping but is a runtime dependency. Vanilla JS with `CustomEvent` achieves the same for our use case without a framework. |
| **No React** | Ruled out by ESP32 constraint — not the rendering load, but the bundle size (~40 KB min) and build complexity for a static-file-served embedded device UI. |

### File Structure

```
sdcard_image/www/
├── index.html                    ← Single entry point (SPA)
├── favicon.ico
├── css/
│   └── tbd.css                   ← Tailwind CSS output (pre-built, gzipped ~10 KB)
├── js/
│   ├── app.js                    ← Application entry, routing, initialization
│   ├── fetch-queue.js            ← Request serialization (~20 lines)
│   ├── state.js                  ← Global state store (reactive, event-based)
│   ├── midi.js                   ← Web MIDI API integration
│   ├── components/
│   │   ├── tbd-app-shell.js      ← Top-level layout (header, sidebar, main, status bar)
│   │   ├── tbd-plugin-browser.js ← Searchable, categorized plugin list
│   │   ├── tbd-slot.js           ← Plugin slot container (header + params + presets)
│   │   ├── tbd-param-knob.js     ← Knob control (wraps webaudio-knob)
│   │   ├── tbd-param-slider.js   ← Slider control (wraps webaudio-slider)
│   │   ├── tbd-param-switch.js   ← Boolean toggle (wraps webaudio-switch)
│   │   ├── tbd-param-group.js    ← Collapsible parameter group
│   │   ├── tbd-favorites-bar.js  ← Favorites 1–10 in header
│   │   ├── tbd-preset-panel.js   ← Preset load/save sidebar
│   │   ├── tbd-midi-mapper.js    ← MIDI CC mapping dialog
│   │   ├── tbd-config-view.js    ← System configuration (connection, appearance, system tabs)
│   │   ├── tbd-sample-manager.js ← Sample bank management view
│   │   ├── tbd-status-bar.js     ← Connection, MIDI, CPU/memory
│   │   └── tbd-debug-panel.js    ← Collapsible debug/diagnostics
│   └── lib/
│       ├── webaudio-controls.js  ← Audio control Web Components
│       ├── jszip.min.js          ← ZIP for backup/export
│       └── sortable.min.js       ← Drag reorder for sample slots
└── img/
    └── ...                        ← Icons (SVG, minimal set)
```

---

## 4. Application Layout

### Overview

The UI is a **persistent shell** with interchangeable content panels. Nothing tears down. Everything is show/hide, slide in/out, or overlay.

```
┌──────────────────────────────────────────────────────────────────────┐
│ HEADER                                                               │
│ TBDAudio  Processing Platform v1.0.0  ● Connected                   │
│                                                                      │
│ Favorites: [1][2][3][4][5][6][7][8][9][10]    🌙  ⚙ Config  💾 Save │
├──────────┬───────────────────────────┬───────────────────────────────┤
│ SIDEBAR  │  SLOT A                   │  SLOT B                       │
│          │  ┌───────────────────┐    │  ┌───────────────────────┐    │
│ Plugin   │  │ Subbotnik         │    │  │ TBD Deep              │    │
│ Browser  │  │ Mono  Synth_voice │    │  │ Mono  Synth_voice     │    │
│          │  │ Presets  Replace   │    │  │ Presets  Replace      │    │
│ ──────── │  ├───────────────────┤    │  ├───────────────────────┤    │
│ Search   │  │ Plugin Parameters │    │  │ Plugin Parameters     │    │
│ ──────── │  │                   │    │  │                       │    │
│ EFFECTS  │  │ PITCH             │    │  │ ENVELOPE              │    │
│  Antique │  │ ◎ ◎ ◎ ◎          │    │  │ Eg Attack  ═══════   │    │
│  CDelay  │  │ PitA TunA PitB   │    │  │ Eg Decay   ═══════   │    │
│  CStrip  │  │                   │    │  │ Eg Trigger  [ON]     │    │
│ OSCILLAT │  │ MODULATION        │    │  │ Eg Loop     [OFF]    │    │
│  TBD03   │  │ LfoDest  ═══     │    │  │                       │    │
│  WTOsc   │  │ LfoType  ═══     │    │  │ MIDI MAPPINGS         │    │
│ UTILITY  │  │ LfoSpeed ═══     │    │  │ + Add Mapping         │    │
│  Void    │  │ LfoAmnt  ═══     │    │  │                       │    │
│          │  └───────────────────┘    │  └───────────────────────┘    │
├──────────┴───────────────────────────┴───────────────────────────────┤
│ STATUS BAR                                                           │
│ ● Connected  API: http://ctag-tbd.local  ● MIDI connected           │
├──────────────────────────────────────────────────────────────────────┤
│ ▲ Debug Panel (collapsible)                                          │
│   App State | Network | Parameters                                   │
└──────────────────────────────────────────────────────────────────────┘
```

### Layout Zones

| Zone | Content | Behavior |
|------|---------|----------|
| **Header** | App title, firmware version, connection status, Favorites 1–10 slots, dark/light toggle, Config button, Save button | Always visible. Fixed at top. |
| **Plugin Browser (sidebar)** | Searchable list of all 56+ plugins, grouped by category (DRUMS, EFFECTS, OSCILLATORS, PHYSICAL, SEQUENCER, SYNTH VOICES, UTILITY), each tagged Mono (blue) or Stereo (red) | Collapsible. Click plugin name or drag to slot to load. |
| **Slot A** | Active plugin name, type tags, Presets/Replace buttons, auto-generated parameter controls, MIDI mappings section | Always visible when a plugin is loaded. Shows "No Plugin Loaded" empty state with + button if empty. |
| **Slot B** | Same structure as Slot A | Disabled/hidden when Slot A has a stereo plugin. |
| **Preset Panel (optional sidebar)** | Preset list for selected slot, save/load/rename | Slides in from right on "Presets" click. |
| **Status Bar** | API connection status, API URL, MIDI connection status, optional CPU/memory | Always visible. Fixed at bottom. |
| **Debug Panel** | Collapsible. Tabs: App State, Network, Parameters. Shows raw API traffic, plugin state, MIDI events. | Hidden by default. Toggle via status bar or keyboard shortcut. |

### Dual Mono vs. Stereo Mode

A toggle in the header switches between:

- **Dual Mono** — Slot A (50%) + Slot B (50%) side by side. Both independently load mono plugins.
- **Stereo** — Slot A takes full width. Slot B is disabled/hidden. Only stereo-capable plugins shown in browser.

When a stereo plugin is loaded into Slot A, Slot B is automatically disabled. The prototype screenshots show this clearly with the modal: "Note: This is a stereo plugin and can only be loaded in Slot A. Loading it will disable Slot B."

### Empty Slot State

When no plugin is loaded in a slot:
```
┌─────────────────────────┐
│ SLOT B                   │
│                          │
│        ╭──────╮          │
│        │  +   │          │
│        ╰──────╯          │
│                          │
│   No Plugin Loaded       │
│   Select an audio plugin │
│   from the browser to    │
│   load in this slot.     │
│                          │
│     [ Add Plugin ]       │
│                          │
└─────────────────────────┘
```

### Responsive Behavior

| Viewport | Layout |
|----------|--------|
| Desktop (>1024px) | Full layout: sidebar + Slot A + Slot B side by side |
| Tablet (768–1024px) | Sidebar collapses to icon rail. Slots stack or reduce. |
| Mobile (<768px) | Sidebar becomes bottom sheet. One slot visible at a time with tab switching. |

### Views (Not Pages)

The main content area switches between **views** without page navigation:

| View | Trigger | Content |
|------|---------|---------|
| **Plugin Editor** (default) | Always shown on load. Clicking a slot, loading a plugin. | Dual-slot parameter editing as shown above |
| **System Configuration** | Click ⚙ Config in header | Overlays/replaces main area. Tabs: Connection, Appearance, System. "← Back" returns to editor view. |
| **Sample Manager** | Click 🎵 Samples (new header button) or via sidebar | Replaces main area with sample bank grid, drag & drop upload, waveform previews. "← Back" returns. |

No view transition destroys state. Going to Config and back preserves all parameter values and slot states.

---

## 5. Plugin System & Schema-Driven UI

### Plugin Schema (existing `mui-*.jsn` format)

Every plugin is described by a JSON schema file. The UI reads this schema and auto-generates all controls. **No plugin-specific code in the WebUI.**

```json
{
  "id": "Bjorklund",
  "isStereo": true,
  "name": "Bjorklund",
  "hint": "Combining Patterns based on Bjorklund's implementation of Euclidian rhythms",
  "params": [
    {
      "id": "Global",
      "name": "Global (Quantizer relative to Master Tune!)",
      "type": "group",
      "params": [
        { "id": "Trigger", "name": "Trigger/Clock", "type": "bool" },
        { "id": "BeatDivider", "name": "Beat Divider", "type": "int", "min": 1, "max": 32, "step": 1 },
        { "id": "ClockSpeed", "type": "int", "name": "Clock Speed", "min": 0, "max": 4095, "step": 1 },
        { "id": "Volume", "name": "Master Volume", "type": "int", "min": 0, "max": 4095, "step": 1 }
      ]
    },
    {
      "id": "Oscillators",
      "name": "Oscillators",
      "type": "group",
      "params": [
        { "id": "SawPitch", "type": "int", "name": "Saw Pitch", "min": -48, "max": 48, "step": 1 },
        { "id": "PWMon", "name": "PWM n/y", "type": "bool" }
      ]
    }
  ]
}
```

### Parameter Types → UI Components

| Schema `type` | Component | Rendering |
|---------------|-----------|-----------|
| `"int"` | `<tbd-param-slider>` or `<tbd-param-knob>` | Slider with numeric display. Knob for "pitch-like" params (small range, bipolar). Heuristic or explicit `"display": "knob"` hint in schema. |
| `"bool"` | `<tbd-param-switch>` | Toggle switch with ON/OFF label |
| `"group"` | `<tbd-param-group>` | Collapsible section with colored header. Recursively renders child params. |
| `"float"` (API docs mention it) | `<tbd-param-slider>` | Same as int but with decimal step |

### Rendering Pipeline

```
GET /api/v1/getPluginParams/{ch}
        │
        ▼
┌──────────────────────────┐
│  JSON Schema             │
│  { params: [...] }       │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  Recursive renderer      │
│  renderParams(ch, data)  │
│                          │
│  for each param:         │
│    group → <tbd-param-   │
│             group>       │
│    int   → <tbd-param-   │
│             slider>      │
│    bool  → <tbd-param-   │
│             switch>      │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  Web Components render   │
│  into the slot's DOM     │
│  with Tailwind classes   │
└──────────────────────────┘
```

This is the **exact same pattern** as the current `renderParams()` in edit.html (lines 12–189), but using Web Components instead of `<ons-range>` + `<ons-switch>` + jQuery event handlers.

### CV/TRIG Routing

Each `int` parameter can have a `"cv"` field. Each `bool` parameter can have a `"trig"` field. These map hardware CV/TRIG inputs to parameters. The UI renders a dropdown next to each routable parameter:

```
LfoSpeed 1  ═══════════════════  13  [CV0 ▼]
Trigger      [ON]                    [TRIG0 ▼]
```

Available CV/TRIG options come from `GET /api/v1/getIOCaps`:
```json
{ "t": ["TRIG0", "TRIG1"], "cv": ["CV0", "CV1", "POT0", "POT1"] }
```

### Knob vs. Slider Heuristic

The prototypes show **knobs** for Pitch/Tune parameters and **sliders** for everything else. A heuristic:

| Condition | Control |
|-----------|---------|
| Range ≤ 100 AND name contains "pitch", "tune", "frequency", "cutoff", "resonance" | Knob |
| Bipolar (min < 0) AND range ≤ 200 | Knob |
| Explicitly marked `"display": "knob"` in schema | Knob |
| Everything else | Slider |

Alternatively, the schema could be extended with an optional `"display"` field, but the heuristic covers 90% of cases without schema changes.

### Plugin Categories

The prototype screenshots show categorized plugin lists. Currently, schemas have no `category` field. Options:

1. **Schema extension** — Add `"category": "effect"` to each `mui-*.jsn`. Cleanest but requires updating 56 files.
2. **Client-side mapping** — A lookup table in the UI maps plugin IDs to categories. Decoupled but needs manual maintenance.
3. **Heuristic** — Parse the `hint` field for keywords like "filter", "delay", "oscillator". Fragile.

**Recommended: Schema extension.** Add `"category"` to each `mui-*.jsn` with values like `"drums"`, `"effects"`, `"oscillator"`, `"physical"`, `"sequencer"`, `"synth_voice"`, `"utility"`. The `getPlugins` API already returns the full schema — the category field would be included automatically.

---

## 6. Component Library

### Wrapper Architecture

Two layers, following the pattern validated by react-knob-headless → adsr (see §9 of research doc):

```
Layer 1: webaudio-controls.js  (rendering primitive — knob/slider/switch visuals + gesture handling)
                │
                ▼
Layer 2: <tbd-param-*>         (TBD behavior — API calls, CV/TRIG routing, value display, reset, MIDI learn)
```

### `<tbd-param-slider>`

The primary control for most parameters. Wraps a slider with:

```html
<tbd-param-slider
  param-id="LfoSpeed"
  channel="0"
  name="LFO Speed"
  value="13"
  min="0"
  max="4095"
  step="1"
  cv="-1"
  hint="Modulation rate"
>
</tbd-param-slider>
```

**Renders as:**
```
┌─────────────────────────────────────────────────┐
│  LFO Speed                              13      │
│  ════════════════════●══════════════════════     │
│  MIN                                    MAX     │
│                                     [CV0  ▼]    │
└─────────────────────────────────────────────────┘
```

**Behavior:**
- Dragging slider → fires `onValueChange` continuously → sends `GET /api/v1/setPluginParam/{ch}?id=LfoSpeed&current=13` via FetchQueue
- Release → fires `onValueCommit` (same API for now, but separates the events for future optimization)
- Double-click label → reset to 0 or min (preserved from current UI)
- Numeric value is editable by clicking
- CV dropdown changes → sends `GET /api/v1/setPluginParamCV/{ch}?id=LfoSpeed&cv=0`
- Color coding: colored bar from min to current value (as shown in prototypes — orange/green/red based on parameter group colors)

### `<tbd-param-knob>`

For pitch, tune, frequency, and other parameters better represented by rotary controls:

```html
<tbd-param-knob
  param-id="PitchA"
  channel="0"
  name="Pitch A"
  value="64000"
  min="0"
  max="64000"
  step="1"
  cv="-1"
>
</tbd-param-knob>
```

**Renders as:**
```
    ╭───╮
    │ ◎ │
    ╰───╯
   64000
  Pitch A
```

**Internal implementation:** Uses `<webaudio-knob>` with CSS-only mode (colors attribute). Wrapped in a `<tbd-param-knob>` custom element that handles:
- Value change → API call via FetchQueue
- `mapTo01` / `mapFrom01` for non-linear params (future: log frequency knobs)
- ARIA Slider role with `aria-valuemin/max/now`
- Drag sensitivity: 0.006 (empirical default from react-knob-headless research)

### `<tbd-param-switch>`

For boolean parameters:

```html
<tbd-param-switch
  param-id="Trigger"
  channel="0"
  name="Trigger/Clock"
  value="1"
  trig="-1"
>
</tbd-param-switch>
```

**Renders as:**
```
┌─────────────────────────────────────────────┐
│  Trigger       TRIG  [●═══]    [TRIG0  ▼]  │
└─────────────────────────────────────────────┘
```

### `<tbd-param-group>`

Collapsible section for parameter groups:

```html
<tbd-param-group name="PITCH" color="orange" collapsed="false">
  <!-- child param components rendered here -->
</tbd-param-group>
```

**Renders as:**
```
┌─ PITCH ──────────────────────────────── ∧ ─┐
│  (child parameters)                        │
└────────────────────────────────────────────┘
```

Clicking the header or chevron collapses/expands. Group name is rendered in the accent color. Collapse state is preserved per plugin instance (stored in memory, not persisted).

### `<tbd-slot>`

The container for a plugin slot. Manages:
- Slot header (plugin name, type tags, Presets/Replace/Mute/Info/Close buttons)
- Parameter container (filled by recursive `renderParams()`)
- MIDI Mappings section
- Empty state ("No Plugin Loaded")

```html
<tbd-slot channel="0" mode="dual-mono">
  <!-- dynamically filled when a plugin is loaded -->
</tbd-slot>
```

### `<tbd-plugin-browser>`

Sidebar component:
- Search input at top (filters by name, hint, category)
- Grouped list: DRUMS, EFFECTS, OSCILLATOR, PHYSICAL, SEQUENCER, SYNTH VOICES, UTILITY
- Each plugin shows: name + Mono (blue badge) or Stereo (red badge)
- Click or drag-to-slot to load
- When Stereo mode is active, only stereo plugins shown (or mono plugins are grayed out — depending on UX preference)
- Collapsible via chevron in sidebar header

### `<tbd-favorites-bar>`

10 numbered slots in the header:

```
Favorites: [1] [2] [3] [4] [5] [6] [7] [8] [9] [10]
```

- **Click** a numbered slot → Recall that favorite (loads plugins + presets into both slots)
- **Long-press / right-click** → Save current state into that slot (with name prompt)
- Visual indicator: filled dot if favorite has content, empty if vacant
- Tooltip on hover: shows favorite name + plugin names

### `<tbd-midi-mapper>`

MIDI mapping UI shown at the bottom of each slot:

```
MIDI MAPPINGS
Associate hardware MIDI controllers with plugin parameters.
                                              [ + Add Mapping ]

No MIDI mappings configured. Use the "Add Mapping" button to
assign hardware controllers to parameters.
```

Clicking "+ Add Mapping" opens a modal dialog (as shown in prototype screenshots):

```
┌─────────── Create MIDI Mapping ───────────┐
│                                           │
│  Parameter to Control                     │
│  ┌──────────────────────────────────┐     │
│  │ Select a parameter...        ▼  │     │
│  └──────────────────────────────────┘     │
│                                           │
│  MIDI CONTROLLER ASSIGNMENT               │
│  MIDI Channel        CC Number            │
│  ┌──────────┐       ┌──────────┐          │
│  │ Channel 1 ▼│    │ CC 1    ▼│          │
│  └──────────┘       └──────────┘          │
│                                           │
│  [ Cancel ]              [ + Create ]     │
└───────────────────────────────────────────┘
```

**Note:** The new MIDI parameter API is still in development. The UI should be built with the dialog structure ready, but the actual MIDI CC assignment calls will be wired when the firmware API is available.

---

## 7. State Management

### No Framework, Just Events

Global state is managed by a simple reactive store using `EventTarget`:

```js
// state.js
class AppState extends EventTarget {
  #state = {
    connection: { status: 'disconnected', apiUrl: '' },
    plugins: [],           // All available plugins from /api/v1/getPlugins
    ioCaps: {},            // CV/TRIG capabilities from /api/v1/getIOCaps
    slotA: { pluginId: null, params: [], presets: [] },
    slotB: { pluginId: null, params: [], presets: [] },
    favorites: [],         // 10 favorites from /api/v1/favorites/getAll
    mode: 'dual-mono',     // 'dual-mono' | 'stereo'
    midi: { supported: false, connected: false, devices: [] },
    theme: 'light',        // 'light' | 'dark'
    accentColor: { h: 29, s: 65, l: 46 },  // Dieter Rams Warm default
    view: 'editor',        // 'editor' | 'config' | 'samples'
  };

  get(key) { return this.#state[key]; }

  set(key, value) {
    this.#state[key] = value;
    this.dispatchEvent(new CustomEvent('state-change', {
      detail: { key, value }
    }));
  }
}

export const state = new AppState();
```

Components subscribe to state changes:
```js
state.addEventListener('state-change', (e) => {
  if (e.detail.key === 'slotA') this.renderParams();
});
```

### What's NOT in Global State

- Individual parameter values during drag — these are local to each `<tbd-param-*>` component. Only committed values propagate via API.
- UI-only state like collapse/expand of groups, sidebar width — component-local.

### Initialization Flow

```
1. Load index.html + all JS modules
2. state.set('apiUrl', detect from URL or localStorage)
3. GET /api/v1/getPlugins → state.set('plugins', data)
4. GET /api/v1/getIOCaps → state.set('ioCaps', data)
5. GET /api/v1/getActivePlugin/0 → state.set('slotA', ...)
6. GET /api/v1/getActivePlugin/1 → state.set('slotB', ...)
7. GET /api/v1/getPluginParams/0 → render Slot A params
8. GET /api/v1/getPluginParams/1 → render Slot B params
9. POST /api/v1/favorites/getAll → state.set('favorites', data)
10. GET /api/v1/getConfiguration → state.set('config', data)
11. Probe Web MIDI API → state.set('midi', ...)
```

All via FetchQueue to ensure ordering. Steps 3–10 can be parallelized in two batches (independent GETs).

---

## 8. API Layer

### Current API Surface

The firmware exposes 15 endpoints (documented in `readme-api.md`):

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/getPlugins` | GET | List all available plugins |
| `/api/v1/getActivePlugin/:ch` | GET | Current plugin on channel |
| `/api/v1/setActivePlugin/:ch` | GET* | Load plugin onto channel |
| `/api/v1/getPluginParams/:ch` | GET | Get all params for active plugin |
| `/api/v1/setPluginParam/:ch` | GET* | Set one parameter value |
| `/api/v1/setPluginParamCV/:ch` | GET* | Set CV routing for param |
| `/api/v1/setPluginParamTRIG/:ch` | GET* | Set TRIG routing for param |
| `/api/v1/getPresets/:ch` | GET | List presets for active plugin |
| `/api/v1/getPresetData/:pluginId` | GET | Get all preset data for plugin |
| `/api/v1/setPresetData/:pluginId` | POST | Save all preset data |
| `/api/v1/loadPreset/:ch` | GET | Load a preset by number |
| `/api/v1/savePreset/:ch` | GET | Save current state as preset |
| `/api/v1/favorites/getAll` | POST | Get all 10 favorites |
| `/api/v1/favorites/store/:id` | POST | Save a favorite |
| `/api/v1/favorites/recall/:id` | POST | Recall a favorite |
| `/api/v1/getConfiguration` | GET | Get device config |
| `/api/v1/setConfiguration` | POST | Set device config |
| `/api/v1/reboot` | GET/POST | Reboot device |
| `/api/v1/getIOCaps` | GET | Get CV/TRIG capabilities |

\* *These use GET with query strings for mutations — not RESTful, but it's the existing API.*

### FetchQueue

Replaces `ajaxq.js` + jQuery AJAX:

```js
// fetch-queue.js
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
      const res = await fetch(url, options);
      const data = await res.json();
      resolve(data);
    } catch (err) {
      reject(err);
    } finally {
      this.#running = false;
      this.#process();
    }
  }
}

export const api = new FetchQueue();
```

### New Endpoints Needed

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `POST /api/v1/samples/upload` | POST | Upload sample WAV to SD card |
| `GET /api/v1/samples/list` | GET | List samples + bank metadata |
| `DELETE /api/v1/samples/delete` | DELETE/GET | Delete a sample file |
| `POST /api/v1/samples/setBank` | POST | Update bank JSON + hot-reload |

*(Detailed in §14 of research doc)*

### Future: MIDI Parameter API

The new MIDI API for parameter control is under development. When available, it will enable:
- `POST /api/v1/midi/mapping/create` — Create CC-to-parameter mapping
- `GET /api/v1/midi/mapping/list/:ch` — List mappings for a slot
- `DELETE /api/v1/midi/mapping/delete` — Remove a mapping

The `<tbd-midi-mapper>` component's dialog UI is ready; it just needs these endpoints wired.

---

## 9. Sample Management Integration

### How It Fits

Sample management is a **view** within the unified UI, not a separate application. Access via a "Samples" button in the header or a navigation element.

```
┌──────────────────────────────────────────────────────────────────────┐
│ HEADER                                                               │
│ TBDAudio  v1.0.0  ● Connected                                      │
│ Favorites: [1]...[10]    [Samples]  🌙  ⚙ Config  💾 Save          │
├──────────────────────────────────────────────────────────────────────┤
│ ← Back    Sample Manager                                            │
│                                                                      │
│  Bank: [Default Sample Bank  ▼]    Slots: 12/128    PSRAM: 8.2/28 MB│
│                                                                      │
│ ┌────┬──────────────────────────────────────────────────────────────┐│
│ │ 01 │ kick_001.wav     drums     13230 samples   0.30s   ▉▊▌▍▏  ││
│ │ 02 │ snare_dp.wav     drums     17640 samples   0.40s   ▊▌▍▏▎  ││
│ │ 03 │ hihat_cl.wav     drums      4410 samples   0.10s   ▉▍▏    ││
│ │ 04 │ (empty)                                                     ││
│ │ .. │                                                              ││
│ └────┴──────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ┌──────────────────────────────────────────┐                        │
│  │  Drag & drop audio files here to upload  │                        │
│  │  Supported: WAV, MP3, FLAC, OGG, AIFF   │                        │
│  │  Auto-converts to 44.1kHz mono 16-bit    │                        │
│  └──────────────────────────────────────────┘                        │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Core Interactions

| Action | UX |
|--------|----|
| **Upload samples** | Drag & drop audio files onto drop zone. Client-side conversion to 44.1kHz/mono/16-bit via `OfflineAudioContext`. Upload via `POST /api/v1/samples/upload`. Progress bar per file. |
| **Browse bank** | Grid or list view of all slots. Waveform thumbnail per sample. Playback preview (browser-local, decode the WAV). |
| **Reorder slots** | Drag & drop to reorder. Uses `sortable.min.js` (already in project). |
| **Delete sample** | Click delete icon → confirm → `DELETE /api/v1/samples/delete`. |
| **Switch bank** | Dropdown selector. Triggers `POST /api/v1/samples/setBank` → firmware calls `RefreshDataStructure()` (brief audio silence). |
| **Offline mode** | If no device connected, export bank as ZIP with JSZip for manual SD card copy. |
| **Keyboard navigation** | Arrow keys to navigate slots, Space to preview, Delete to remove (TE EP Sample Tool pattern). |

### No Separate Page

The sample manager is a `<tbd-sample-manager>` Web Component that renders into the main content area when the "Samples" view is active. Same component system, same state store, same API layer.

---

## 10. MIDI Integration

### Web MIDI API

The Web MIDI API (Chrome/Edge) enables browser-to-hardware MIDI communication:

```js
// midi.js
export async function initMidi() {
  if (!navigator.requestMIDIAccess) {
    state.set('midi', { supported: false });
    return;
  }
  const access = await navigator.requestMIDIAccess({ sysex: false });
  const inputs = [...access.inputs.values()];
  const outputs = [...access.outputs.values()];
  state.set('midi', {
    supported: true,
    connected: inputs.length > 0,
    devices: inputs.map(d => ({ name: d.name, manufacturer: d.manufacturer, type: 'input' }))
      .concat(outputs.map(d => ({ name: d.name, manufacturer: d.manufacturer, type: 'output' })))
  });
}
```

### MIDI CC → Parameter Control

When the MIDI parameter API is available:
1. User creates a mapping (CC 21 → LfoSpeed on Slot A)
2. MIDI CC messages received in browser → `setPluginParam` API call
3. UI updates in real-time (slider/knob moves to reflect the received value)

### MIDI Learn (Future)

webaudio-controls has built-in MIDI learn (right-click any control → move a CC → mapped). This could be wired to the firmware mapping API when available.

---

## 11. Theming & Appearance

### Color System

Based on the prototype screenshots, using Dieter Rams-inspired palettes:

```css
:root {
  /* Dieter Rams Warm (default) */
  --accent-h: 29;
  --accent-s: 65%;
  --accent-l: 46%;
  --accent: hsl(var(--accent-h), var(--accent-s), var(--accent-l));

  /* Surface colors */
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f5;
  --bg-card: #ffffff;
  --text-primary: #1a1a1a;
  --text-secondary: #6b7280;
  --border: #e5e7eb;

  /* Parameter group accent colors */
  --group-color-1: var(--accent);      /* PITCH, ENVELOPE */
  --group-color-2: #ef4444;            /* Critical/Warning */
  --group-color-3: #3b82f6;            /* Info/Mono badge */
}

[data-theme="dark"] {
  --bg-primary: #1a1a1a;
  --bg-secondary: #2d2d2d;
  --bg-card: #2d2d2d;
  --text-primary: #f5f5f5;
  --text-secondary: #9ca3af;
  --border: #404040;
}
```

### Palette Presets (from prototypes)

| Palette | Colors | Accent |
|---------|--------|--------|
| **Dieter Rams Warm** | Bronze, olive, dark gray, light gray | hsl(29, 65%, 46%) |
| **Dieter Rams Contrast** | Coral red, blue, near-black, dark purple, light gray | hsl(0, 70%, 55%) |
| **Dieter Rams Muted** | Burnt orange, dark brown, olive gray, tan, light gray | hsl(15, 50%, 40%) |

### Fine-Tune Color

HSL sliders (as shown in prototype) let the user adjust:
- Hue (0°–360°)
- Saturation (0%–100%)
- Lightness (0%–100%)

The accent color cascades through `var(--accent)` to all UI elements: group headers, active tabs, buttons, slider fill colors, knob arcs.

### Dark/Light Toggle

Header toggle (🌙/☀) switches `data-theme` attribute on `<html>`. Preference saved to `localStorage`. Respects `prefers-color-scheme` as default.

### Typography

- **IBM Plex Mono** — for technical/data values (parameter numbers, API URLs, firmware version)
- **IBM Plex Sans** — for UI labels, headings, descriptions
- Fallback: system monospace / system sans-serif (to avoid large font file downloads on embedded)

**Trade-off:** Loading custom fonts means ~50–100 KB extra. For an embedded device serving from SD card, system fonts may be more practical. Decision: use system fonts by default, offer IBM Plex as optional download.

---

## 12. Build & Deployment

### Build Pipeline

```bash
# In create_sd_archive.sh (or a dedicated build script)

# 1. Build Tailwind CSS
npx @tailwindcss/cli -i ./src/input.css -o ./sdcard_image/www/css/tbd.css --minify

# 2. Gzip all web assets
cd sdcard_image/www
find . -type f \( -name "*.html" -o -name "*.css" -o -name "*.js" -o -name "*.svg" \) \
  -exec gzip -9 -k {} \;

# 3. Package for SD card
# (existing create_sd_archive.sh logic)
```

### No JS Bundler (Default)

ES Modules with `<script type="module">` and `import`/`export` work natively in all modern browsers. No bundler needed. Each component is a separate `.js` file loaded on demand.

**If bundling becomes desirable** (to reduce HTTP requests over slow WiFi):
```bash
npx esbuild js/app.js --bundle --minify --outfile=sdcard_image/www/js/app.bundle.js
```

esbuild is a single binary, zero dependencies, produces output in <100ms. But this is optional — the unbundled approach works fine with HTTP/1.1 keep-alive.

### Development Workflow

For local development without hardware:

```bash
# Serve the www/ directory locally
npx serve sdcard_image/www

# Or use the existing simulator
cd simulator && cmake --build . && ./tbd-sim
```

The simulator (`SimSPManager`, `SimDataModel`) provides a mock REST API on localhost. The web UI connects to `http://localhost:8000` (as shown in the prototype API Connection card).

---

## 13. Migration Path

### Strategy: Incremental Replacement

The new UI replaces the old one **completely** once ready. There is no intermediate mixed state. However, development proceeds incrementally:

### Phase 1 — Shell & Components

1. Create `index.html` (new SPA entry point)
2. Implement `<tbd-app-shell>` (header, sidebar, main, status bar layout)
3. Implement `<tbd-plugin-browser>` (sidebar with search and categories)
4. Implement `<tbd-favorites-bar>` (10 slots in header)
5. Build `FetchQueue`, `state.js`, `midi.js` infrastructure
6. Set up Tailwind CSS build

**Deliverable:** App shell renders, connects to device, shows plugin list. No parameter editing yet.

### Phase 2 — Parameter Components

1. Implement `<tbd-param-slider>` (wrapping webaudio-slider or native range)
2. Implement `<tbd-param-knob>` (wrapping webaudio-knob)
3. Implement `<tbd-param-switch>` (toggle)
4. Implement `<tbd-param-group>` (collapsible section)
5. Implement `renderParams()` v2 — recursive renderer using new components
6. Implement `<tbd-slot>` — full slot container with header + params + empty state

**Deliverable:** Load plugins, see all parameters, adjust values in real-time. Core functionality parity with current edit.html.

### Phase 3 — Presets & Favorites

1. Implement `<tbd-preset-panel>` (load/save/rename presets per slot)
2. Wire favorites recall/snap/store to `<tbd-favorites-bar>`
3. Implement favorite export/import (JSON file download/upload)

**Deliverable:** Full preset + favorites workflow. Feature parity with current main.html + load.html + save.html + fav.html.

### Phase 4 — Configuration

1. Implement `<tbd-config-view>` with tabs: Connection, Appearance, System
2. Wire WiFi config, codec levels, daisy chain, CV mode settings
3. Implement backup/restore with JSZip
4. Implement theming (palettes, HSL sliders, dark/light toggle)
5. Implement reboot/factory reset with confirmation

**Deliverable:** Full config parity with current config.html + new theming/appearance features.

### Phase 5 — Sample Manager

1. Implement `<tbd-sample-manager>` view
2. Client-side audio conversion (WAV/MP3/FLAC/OGG → 44.1kHz mono 16-bit)
3. Drag & drop upload with progress
4. Bank browsing, slot reordering
5. Waveform thumbnails + preview playback
6. Firmware endpoints (4 new handlers)

**Deliverable:** Sample management without SD card removal.

### Phase 6 — MIDI Mapping

1. Implement `<tbd-midi-mapper>` dialog
2. Wire to new MIDI parameter API (when firmware API is ready)
3. MIDI learn integration with webaudio-controls

**Deliverable:** MIDI CC mapping from browser.

### Phase 7 — Polish & Ship

1. Responsive layout verification (mobile/tablet/desktop)
2. Keyboard shortcuts (documented in help/about)
3. Debug panel implementation
4. Performance testing on device (WiFi AP, STA, USB NCM)
5. Remove old Onsen UI / jQuery files
6. Update documentation

---

## 14. Open Decisions

### 1. Alpine.js: Yes or No?

The prototype specs mention Alpine.js for reactive scoping. Alpine adds ~15 KB but provides:
- `x-data` reactive scopes on HTML elements
- `x-bind`, `x-on`, `x-show` directives
- `Alpine.store()` for global state

Vanilla JS with `CustomEvent` + `EventTarget` achieves the same without a dependency. **Current recommendation: No Alpine.js.** Revisit if vanilla state management becomes unwieldy.

### 2. Knob vs. Slider Default

Should all `int` params default to sliders (current behavior), or should we use the heuristic to show knobs for appropriate params? The prototypes show both patterns. The schema could gain an optional `"display": "knob"` field.

### 3. Plugin Category Source

Add `"category"` field to `mui-*.jsn` schemas (requires firmware-side schema update for 56 plugins), or maintain a client-side mapping table?

### 4. System Fonts vs. Custom Fonts

IBM Plex Mono + Sans look great in prototypes but add ~50–100 KB. System fonts (monospace, sans-serif) save bandwidth on the embedded device. Option: ship fonts as optional, use system fonts by default.

### 5. JS Bundling

Keep ES Modules (no bundler, simpler, each file loaded separately) or bundle with esbuild (one HTTP request, smaller total transfer)? WiFi can be slow (~2–5 MB/s) — bundling might matter for first load. But gzipped individual files with keep-alive are fine.

### 6. webaudio-controls: Use As-Is, Wrap, or Fork?

- **As-is:** Load the 30 KB file, use `<webaudio-knob>` directly. Simplest.
- **Wrap (recommended):** Use internally inside `<tbd-param-*>` components. Users never see `webaudio-knob` — they see `<tbd-param-slider>`.
- **Fork:** Modernize to ES Modules, clean up code. Most work, best long-term.

### 7. DrumRack: Merge or Keep Special?

The current `drumrack.html` is a standalone page with its own CSS (drumrack.css, ~300 lines) and JS (drumrack.js, ~1,200 lines). In the unified UI:
- **Option A:** DrumRack's specialized UI (grid of drum voices) is rendered by the generic `renderParams()` — its schema already describes all params as groups of int/bool. The visual layout is just parameter groups rendered as cards.
- **Option B:** Keep DrumRack as a "template" that the generic renderer uses when it detects `id === "DrumRack"`. This violates the "no plugin-specific code" rule.
- **Recommendation: Option A.** The generic renderer with collapsible `<tbd-param-group>` sections already produces an equivalent layout. The drum voice groups (Analogue Bass Drum, Digital Bass Drum, etc.) become collapsible sections. The specialized grid layout of the standalone drumrack.html is nice but not essential.

### 8. Connection Discovery

How does the UI know the API URL?
- **Same-origin (default):** When served from the device, API is at the same host. `fetch('/api/v1/...')` works.
- **Configurable endpoint:** For development or when UI is served from a different host (localhost dev server), the user sets the API URL in Config → Connection. Stored in `localStorage`.
- **mDNS:** `http://ctag-tbd.local` as default fallback. Works on most platforms.

### 9. Concurrent User Safety

The HTTP server has no session awareness. Two browsers open simultaneously could conflict (both set the same parameter). Options:
- **Last-write-wins** (current behavior, acceptable)
- **Optimistic locking** (version counter per plugin state) — overkill for this use case
- **WebSocket notifications** for state changes — would require firmware changes

**Recommendation:** Last-write-wins. Single-user use case is dominant for hardware synth modules.

### 10. Refresh/Loss of Connection Handling

What happens when the user refreshes the page or briefly loses WiFi?
- On page load, the full initialization flow (§7) runs and restores the current device state.
- No unsaved state is lost — all parameter changes are immediately sent to firmware.
- Add a "reconnecting..." overlay when consecutive API calls fail, with auto-retry.
