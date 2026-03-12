# TBD-16 Unified WebUI — Design Synthesis

> **Status:** Synthesis of all prior research, the new PicoSeqRack plugin analysis, preset editor concept, Ableton Move reference, and revised constraints.  
> **Supersedes:** Decisions in [UNIFIED-WEBUI-ARCHITECTURE.md](UNIFIED-WEBUI-ARCHITECTURE.md) that conflict with this document.  
> **Companion:** [SAMPLE-MANAGER-RESEARCH.md](SAMPLE-MANAGER-RESEARCH.md) — background research.  
> **Date:** February 2026

---

## Table of Contents

1. [What Changed](#1-what-changed)
2. [PicoSeqRack — The Primary Plugin](#2-picoseqrack--the-primary-plugin)
3. [Parameter Abstraction Layer & Preset Editor](#3-parameter-abstraction-layer--preset-editor)
4. [Revised Constraints & Firm Decisions](#4-revised-constraints--firm-decisions)
5. [Hardware UI ↔ WebUI State Synchronization](#5-hardware-ui--webui-state-synchronization)
6. [Revised Plugin Parameter Rendering](#6-revised-plugin-parameter-rendering)
7. [Sample Management — Ableton Move as Reference](#7-sample-management--ableton-move-as-reference)
8. [Revised Application Layout](#8-revised-application-layout)
9. [API Evolution Strategy](#9-api-evolution-strategy)
10. [First Iteration Scope](#10-first-iteration-scope)
11. [Open Topics](#11-open-topics)

---

## 1. What Changed

Since the previous architecture document, several important inputs shifted the design:

| Input | Impact |
|-------|--------|
| **PicoSeqRack plugin analyzed** | The flagship plugin is a 16-channel rack with mixer, FX sends, master compressor. It has 300+ parameters organized in deeply nested groups. The WebUI must handle this gracefully — not as a wall of sliders. |
| **Preset editor / macro mapping concept** | The engineer's prototype decouples displayed parameters from underlying synth parameters. Output mappings combine UI macros into CC values the synth understands. This changes how the WebUI relates to plugin parameters. |
| **Hardware UI is the primary UI** | The RP2350 firmware drives the on-device buttons, encoders, and OLED. The WebUI is a *companion*, not the master. CV/TRIG routing dropdowns from the Eurorack era must be eliminated. |
| **No Alpine.js** | Confirmed. Pure vanilla JS + Web Components. |
| **No sliders-only** | Knobs must be the default for most parameters, not sliders. |
| **No special DrumRack/PicoSeqRack page** | The generic schema-driven renderer must handle PicoSeqRack (300+ params, 16 channels) without a dedicated page. |
| **APIs can change** | Backend/firmware APIs are not frozen. We can design the ideal API and implement it. |
| **Ableton Move WebUI reference** | Clean, minimal sample/preset file management. Table-based browser with upload, rename, delete, preview, folder creation. |
| **nanopb consideration** | Protocol Buffers for embedded C — could be relevant for efficient hardware ↔ ESP32 ↔ browser state sync. |
| **First iteration pragmatism** | Don't be too radical. Deliver a working unified WebUI before pursuing advanced features like browser-side DSP emulation. |

---

## 2. PicoSeqRack — The Primary Plugin

### Architecture

PicoSeqRack is a **16-channel drum machine / groove box** running as a single ESP32-P4 plugin. It's the most complex plugin in the system and the primary use case for the TBD-16.

```
┌─────────────────────────────────────────────────────────┐
│  PicoSeqRack                                            │
│                                                         │
│  CH1  Kicks      ──┬─ Machine 0: Digital Bass Drum      │
│                    └─ Machine 1: Analogue Bass Drum     │
│  CH2  Kicks 2    ──┬─ Machine 0: FM Bass Drum           │
│                    └─ Machine 1: FM Bass Drum 2         │
│  CH3  Snares     ──┬─ Machine 0: Digital Snare          │
│                    └─ Machine 1: Analogue Snare         │
│  CH4  Hihats     ──┬─ Machine 0: HiHat 1               │
│                    └─ Machine 1: HiHat 2                │
│  CH5  Rimshot    ─── Machine 0: Rim Shot                │
│  CH6  Clap       ─── Machine 0: Clap                   │
│  CH7  Sampler    ─── Machine 0: Rompler                 │
│  CH8  Sampler    ─── Machine 0: Rompler                 │
│  CH9  Bass       ─── Machine 0: TBD03                   │
│  CH10 Bass 2     ─── Machine 0: TBD03                   │
│  CH11 Synth      ─── Machine 0: Macro Oscillator        │
│  CH12 Synth      ──┬─ Machine 0: WT Oscillator          │
│                    └─ Machine 1: Macro Oscillator       │
│  CH13 Sampler    ─── Machine 0: Rompler                 │
│  CH14 Sampler    ─── Machine 0: Rompler                 │
│  CH15 Chords     ─── Machine 0: PolyPad                 │
│  CH16 Input      ─── Audio Input routing                │
│                                                         │
│  FX1  Delay      ─── Stereo delay with sync/freeze      │
│  FX2  Reverb     ─── Reverb with LP filter              │
│  Master          ─── Compressor + master levels          │
└─────────────────────────────────────────────────────────┘
```

### Key Properties

| Property | Detail |
|----------|--------|
| **Parameter count** | 300+ parameters across all channels, machines, FX, and master |
| **Schema** | `mui-PicoSeqRack.jsn` — single JSON file, deeply nested groups |
| **Preset file** | `mp-PicoSeqRack.jsn` — flat list of `{id, current, cv/trig}` per patch |
| **Channel mixer** | Every channel has: Mute, Device (machine selector), Level, Pan, FX Send 1, FX Send 2 |
| **Machine selection** | `device` parameter (0 or 1) switches which synth engine runs on a channel |
| **MIDI** | Full MIDI implementation: note on/off (per channel), CC mapping (hardcoded in `knowYourself()`), drum triggers on MIDI ch10 |
| **CC mapping** | `pMapCC` maps `(midi_channel, cc_number) → param_id`, `pMapPar` maps `param_id → setter lambda` |
| **Stereo** | Always stereo (isStereo: true). Occupies Slot A and disables Slot B. |

### What This Means for the WebUI

1. **Rendering 300+ parameters as a flat list is unusable.** The schema has two levels of grouping: channel groups (e.g., "Channel 1 - Drum group - Kicks") containing machine groups (e.g., "Channel 1 - Machine 0 - Digital Bass Drum") containing parameters. The WebUI must use **collapsible nested groups** with clear visual hierarchy.

2. **The "Device" parameter is a machine selector.** When `ch1_device = 0`, Machine 0 (Digital Bass Drum) is active. When `ch1_device = 1`, Machine 1 (Analogue Bass Drum) is active. The WebUI should hide inactive machine parameters or visually dim them — showing both machines' full parameter sets simultaneously is noise.

3. **Channel mixer parameters form a repeating strip.** Every channel has the same 6 parameters: Mute, Device, Level, Pan, FX Send 1, FX Send 2. The WebUI should render these as a consistent mixer strip at the top of each channel, visually separated from the machine-specific parameters below.

4. **PicoSeqRack is always stereo.** It takes the full plugin slot. The two-slot layout from the architecture doc (Slot A + Slot B) collapses to a single full-width view when PicoSeqRack is loaded.

5. **The generic renderer must still work.** Every parameter in `mui-PicoSeqRack.jsn` uses the same `type: "int"` / `type: "bool"` / `type: "group"` primitives as all other plugins. No special-case rendering code.

### Schema Pattern for Channels

Each channel follows a consistent pattern in the schema:

```json
{
  "id": "ch1_group",
  "name": "Channel 1 - Drum group - Kicks",
  "type": "group",
  "params": [
    { "id": "ch1_mute",   "name": "Mute",       "type": "bool" },
    { "id": "ch1_device", "name": "Device",      "type": "int", "min": 0, "max": 4095 },
    { "id": "ch1_lev",    "name": "Level",       "type": "int", "min": 0, "max": 4095 },
    { "id": "ch1_pan",    "name": "Pan",         "type": "int", "min": -4095, "max": 4095 },
    { "id": "ch1_fx1",    "name": "FX Send 1",   "type": "int", "min": 0, "max": 4095 },
    { "id": "ch1_fx2",    "name": "FX Send 2",   "type": "int", "min": 0, "max": 4095 }
  ]
}
```

Then machine groups follow as separate top-level groups (adjacent, not nested under the channel group):

```json
{
  "id": "ch1_db_group",
  "name": "Channel 1 - Machine 0 - Digital Bass Drum",
  "type": "group",
  "params": [
    { "id": "ch1_db_trigger", "name": "Trigger", "type": "bool" },
    { "id": "ch1_db_accent",  "name": "Accent",  "type": "int", "min": 0, "max": 4095 },
    ...
  ]
}
```

The WebUI can detect channel groups vs. machine groups by naming convention (`Channel N - Drum group` vs. `Channel N - Machine M`) and visually nest them. But this is a **heuristic**, not a schema feature. For the first iteration, simply rendering all groups as collapsible sections — with the first 6 collapsed by default for large plugins — is sufficient.

---

## 3. Parameter Abstraction Layer & Preset Editor

### The Engineer's Concept

The engineer working on the RP2350 firmware is building a preset editor where:

> "The parameters shown on screen are totally disconnected from the synth underneath, but there is also an 'output mapping' that takes a list of these parameters and combines them into the CC's that the synths understand. That way we can do macro mappings etc."

This introduces a **three-layer architecture**:

```
┌──────────────────────────────────────────────────────┐
│  Layer 1: User-Facing Parameters ("Macros")          │
│  What the user sees and controls.                    │
│  Example: "Cutoff" knob, range 10–90                 │
│           "Envmod" knob, range 0–127                  │
│           "Reso" knob, range 0–127                    │
├──────────────────────────────────────────────────────┤
│  Layer 2: Output Mapping (Macro → CCs)               │
│  Formulas that combine macros into synth CCs.        │
│  Example: "BD Decay = 10 + (Cutoff×50) + (Envmod×50)"│
│           "BD FQ = 127 + (Reso×50)"                   │
├──────────────────────────────────────────────────────┤
│  Layer 3: Synth Engine Parameters (CCs)              │
│  The actual DSP parameters.                          │
│  Example: ch1_db_decay, ch1_db_f0                    │
└──────────────────────────────────────────────────────┘
```

### Preset Format

From the engineer's mockup, a preset is a ~1 KB JSON file:

```json
{
  "name": "My preset",
  "machine": "db",
  "groups": [
    {
      "id": "g1",
      "name": "Group 1",
      "parameters": [
        { "id": "g1p1", "name": "Cutoff", "defaultValue": 50,
          "minValue": 10, "maxValue": 90, "resolution": 50,
          "presentation": "freq" },
        { "id": "g1p2", "name": "Reso" },
        { "id": "g1p3", "name": "Envmod", "defaultValue": 0,
          "minValue": 0, "maxValue": 0, "resolution": 0,
          "presentation": "bignum" }
      ]
    },
    {
      "id": "g2",
      "name": "Group 2",
      "parameters": [
        { "id": "g2p1", "name": "Parameter 1", "defaultValue": 0,
          "minValue": 0, "maxValue": 0, "resolution": 0 }
      ]
    }
  ]
}
```

Key features:
- **`presentation`** field — controls how the parameter is displayed (`"freq"`, `"bignum"`, etc.)
- **Groups** — arbitrary parameter grouping, unrelated to the underlying synth structure
- **Machine** — target device (e.g., `"db"` = Digital Bass Drum)
- **Output mapping section** — formulas like `BD Decay = 10 + (Cutoff×50) + (Envmod×50)`

### Implications for the WebUI

1. **Two modes of parameter display:**
   - **Raw mode** — Show all parameters from `mui-*.jsn` directly (current approach). This is what the WebUI does today in edit.html. Useful for power users, debugging, and plugins that don't have macro presets.
   - **Preset/Macro mode** — Show user-facing macro parameters from a preset JSON file. These are the "designed" control surfaces with the parameter abstraction layer. More user-friendly, fewer controls, curated experience.

2. **The WebUI should support both modes.** For the first iteration, raw mode is the baseline — it works with every plugin today. Preset/macro mode is added when the firmware preset system is ready and the preset JSON format is finalized.

3. **"Upload to device"** — The preset JSON files (~1 KB each) could be uploaded from the WebUI to the SD card, making the browser a preset editor + uploader. This aligns with the Ableton Move reference (preset management via browser).

4. **"Run TBD code in the browser"** — The engineer envisions running the DSP in the browser for sound preview without hardware. This is a future goal (Phase 3+). The simulator codebase (`simulator/`) already compiles the DSP engine for desktop — a WASM build could bring it to the browser.

### How Macro Presets Interact with the Current Parameter System

The current `mp-PicoSeqRack.jsn` stores raw parameter values:

```json
{ "id": "ch1_db_f0", "current": 370, "cv": -1 }
```

The macro preset system sits *above* this:
1. User adjusts "Cutoff" macro knob to 50
2. Output mapping computes: `BD FQ = 127 + (50 × 50) = 2627`
3. The value 2627 is sent to `ch1_db_f0` via the existing setPluginParam API

The WebUI doesn't need to know the formulas — the RP2350 firmware (or a future browser-side evaluator) handles the mapping. The WebUI just:
- Displays the macro parameters (from preset JSON)
- Sends macro values to the firmware
- The firmware applies the output mapping and sets the actual DSP parameters

---

## 4. Revised Constraints & Firm Decisions

These override or clarify decisions from the previous architecture document.

### Eliminations

| Removed | Reason |
|---------|--------|
| **CV/TRIG routing dropdowns** | These are Eurorack-era controls for the CTAG TBD module. On the TBD-16, the hardware UI (RP2350) is the primary interface for CV/TRIG routing. The WebUI should NOT render CV/TRIG dropdowns alongside every parameter. If CV routing is needed in the WebUI at all, it belongs in a dedicated configuration view — not inline with every slider/knob. |
| **Alpine.js** | Confirmed elimination. No framework runtime. Vanilla JS + Web Components + CustomEvent. |
| **Sliders as default for `int` parameters** | The previous architecture defaulted to sliders for most params, with knobs only for "pitch-like" parameters. **Reversed:** Knobs should be the default for most parameters. Sliders for parameters where a linear strip makes more sense (e.g., level faders, pan). |
| **Special DrumRack page** | Already stated, now even more important: PicoSeqRack is the primary plugin and must work perfectly in the generic renderer. Zero special-case code. |

### Confirmed Stack

| Decision | Status |
|----------|--------|
| Vanilla JS (ES Modules) | **Confirmed** |
| Tailwind CSS (pre-built) | **Confirmed** |
| Web Components (Light DOM) | **Confirmed** |
| webaudio-controls (wrapped) | **Confirmed** — wrap in `<tbd-param-*>` components |
| SPA (no pages) | **Confirmed** |
| No framework (no React, no Vue, no Svelte, no Alpine) | **Confirmed** |
| FetchQueue pattern | **Confirmed** |

### New: Knob-First Design

The default control for `type: "int"` parameters should be a **knob**, not a slider.

Rationale:
- Audio software universally uses knobs for most parameters (Ableton, VCV Rack, hardware synths)
- Knobs are more space-efficient — critical when rendering 300+ parameters
- Knobs allow horizontal layouts (rows of knobs per group) rather than stacked vertical sliders
- The PicoSeqRack has machine groups with 5–8 parameters each — a row of knobs for each group is natural

Exception list (use sliders):
- Parameters named "Level", "Volume", "Gain", "Amount" → vertical fader
- Parameters named "Pan" → horizontal slider (bipolar center)
- Parameters explicitly flagged in schema (future `"display": "slider"` field)

### New: No Inline CV/TRIG Routing

The current edit.html renders a CV dropdown next to every `int` parameter and a TRIG dropdown next to every `bool` parameter. This adds visual noise and doesn't match the TBD-16 workflow where the hardware UI handles modulation routing.

**For the WebUI:**
- Do NOT render CV/TRIG dropdowns inline with parameters
- If CV/TRIG configuration is ever needed in the WebUI, provide it as a separate "Modulation Routing" panel accessible from the config/debug area
- The `cv` and `trig` fields in the preset JSON (`mp-*.jsn`) are still stored and sent via API — they're just not exposed in the main parameter editing UI

---

## 5. Hardware UI ↔ WebUI State Synchronization

### The Problem

The TBD-16 has two control surfaces that can change the same parameter simultaneously:
1. **Hardware UI** — RP2350 firmware driving buttons, encoders, OLED → sends parameter changes to ESP32-P4 via SPI
2. **WebUI** — Browser running on a connected computer/phone → sends parameter changes to ESP32-P4 via HTTP API

If the user turns a knob on the hardware while also having the WebUI open, the WebUI's displayed value becomes stale. Worse, if the user then interacts with that stale control in the browser, they may unintentionally override the hardware-set value.

### Current State

The current WebUI has no synchronization. Values are fetched once when entering edit.html (`getPluginParams`) and never refreshed. This is functional because the old Eurorack module's knobs/CV inputs are handled at a lower level (CV routing, not parameter updates), but it breaks for the TBD-16's encoder-driven hardware UI.

### Proposed Solution: Periodic Polling

The simplest approach that requires minimal firmware changes:

```
WebUI                                    ESP32-P4
  │                                         │
  │  GET /api/v1/getPluginParams/0          │
  │────────────────────────────────────────>│
  │  { params: [...current values...] }     │
  │<────────────────────────────────────────│
  │                                         │
  │  (user adjusts knob on hardware)        │
  │                                         │
  │  (2 seconds later)                      │
  │  GET /api/v1/getPluginParams/0          │
  │────────────────────────────────────────>│
  │  { params: [...updated values...] }     │
  │<────────────────────────────────────────│
  │  (WebUI diff + update changed knobs)    │
  │                                         │
```

**Polling interval:** 1–3 seconds. Adjustable in config.

**Diff logic:** Compare incoming param values with current UI state. Only update controls the user is NOT currently interacting with (active drag → skip update for that parameter). This prevents "fighting" between hardware and WebUI.

**Cost:** One `getPluginParams` request every 1–3 seconds. The ESP32-P4 just reads the current parameter values from memory (already atomic int32s in PicoSeqRack) and serializes to JSON. The current `getPluginParams` handler already does this. For PicoSeqRack's 300+ parameters, the JSON response is ~10–15 KB — acceptable over WiFi/USB NCM.

### Alternative: nanopb / Protocol Buffers

The user asked about [nanopb](https://github.com/nanopb/nanopb) — Protocol Buffers for embedded C. This could be relevant for:

1. **SPI communication (RP2350 ↔ ESP32-P4):** Currently uses raw byte protocols defined in `SpiAPI.cpp`. Protocol Buffers would add structure, versioning, and smaller payload sizes compared to JSON for the inter-chip communication. However, this is a firmware decision, not a WebUI decision.

2. **HTTP API (ESP32-P4 ↔ Browser):** Could replace JSON with protobuf for parameter updates. A 300-parameter update in protobuf would be ~1–2 KB vs. ~10–15 KB in JSON. But:
   - Browser-side protobuf decoding requires a JS library (~15 KB for protobuf.js)
   - JSON is human-readable and debuggable
   - The bandwidth savings are marginal for 1–3 second polling
   - The ESP32-P4 already has JSON serialization via RapidJSON

**Recommendation:** nanopb is worth evaluating for the SPI link between RP2350 and ESP32-P4 (firmware team's domain). For the HTTP/WebUI layer, stay with JSON. The polling approach is simple, requires no new firmware dependencies, and the bandwidth is fine.

### Future: Server-Sent Events (SSE)

If polling proves insufficient (latency too high, bandwidth wasteful), the next step is Server-Sent Events:

```
WebUI                                    ESP32-P4
  │                                         │
  │  GET /api/v1/paramStream                │
  │────────────────────────────────────────>│
  │  (persistent connection, text/event-stream)
  │                                         │
  │  data: {"id":"ch1_db_f0","v":850}       │
  │<────────────────────────────────────────│
  │  data: {"id":"ch1_lev","v":3000}        │
  │<────────────────────────────────────────│
  │  ...                                    │
```

SSE is simpler than WebSockets (unidirectional, HTTP/1.1, no upgrade), but requires the ESP32-P4 HTTP server to support persistent connections with chunked transfer. This is a firmware-level change, so it's a Phase 2+ enhancement. Polling first.

### Design Rule: Last-Write-Wins

Both the hardware UI and WebUI can write parameters. No locking, no conflict resolution. Last value written wins. This is acceptable because:
- TBD-16 is a single-user device
- Having two people simultaneously edit parameters is an edge case, not a design scenario
- The hardware UI and WebUI are operated by the same person, who understands their intent

---

## 6. Revised Plugin Parameter Rendering

### Knob-First Layout

Instead of a vertical stack of sliders (current edit.html), the default rendering for parameter groups is a **horizontal row of knobs**:

```
┌─ PITCH ──────────────────────────────────────────────┐
│                                                      │
│    ╭───╮    ╭───╮    ╭───╮    ╭───╮                  │
│    │ ◎ │    │ ◎ │    │ ◎ │    │ ◎ │                  │
│    ╰───╯    ╰───╯    ╰───╯    ╰───╯                  │
│     630      3100     970       90                    │
│   Base Freq  Tone    Decay   Atk FM                  │
│                                                      │
│   [Trigger]  [●═══]                                  │
│                                                      │
└──────────────────────────────────────────────────────┘
```

- **Knobs** arranged in rows inside each group
- **Value displayed below** each knob (numeric)
- **Parameter name below** the value
- **Bool parameters** rendered as toggle switches, placed below or beside the knobs
- **Group headers** are collapsible — click to expand/collapse
- Collapsed groups show only the header bar

### PicoSeqRack-Specific Rendering (Still Generic)

For PicoSeqRack's 300+ parameters, the generic renderer produces something like:

```
┌─ Channel 1 - Kicks ─────────────────── ∧ ─────────┐
│ [Mute ●]  Device: [0 ▼]                           │
│                                                     │
│  ╭───╮  ╭───╮  ╭───╮  ╭───╮                        │
│  │ ◎ │  │ ◎ │  │ ◎ │  │ ◎ │                        │
│  ╰───╯  ╰───╯  ╰───╯  ╰───╯                        │
│  2047   0       0       0                           │
│  Level  Pan     FX 1    FX 2                        │
│                                                     │
├─ Machine 0 - Digital Bass Drum ──────── ∧ ─────────┤
│                                                     │
│  ╭───╮  ╭───╮  ╭───╮  ╭───╮  ╭───╮  ╭───╮  ╭───╮  │
│  │ ◎ │  │ ◎ │  │ ◎ │  │ ◎ │  │ ◎ │  │ ◎ │  │ ◎ │  │
│  ╰───╯  ╰───╯  ╰───╯  ╰───╯  ╰───╯  ╰───╯  ╰───╯  │
│  2900   370     3719    2500   644     597    82     │
│  Accnt  Freq    Tone    Decay  Dirty  FMEnv  FMDcy  │
│                                                     │
│  [Trigger]  [OFF]                                   │
│                                                     │
├─ Machine 1 - Analogue Bass Drum ──────── ∨ ────────┤
│  (collapsed — not the active device)                │
└─────────────────────────────────────────────────────┘
```

**Key rendering rules (no special-case code, all from schema + naming heuristics):**

1. **Group with "Channel N" in name** → render channel mixer strip (Mute switch + Device dropdown + Level/Pan/FX knobs) in a compact top bar
2. **Group with "Machine N" in name** → if N ≠ current device value, render collapsed by default
3. **All other groups** → render expanded by default, collapsible
4. **`type: "int"` with `min < 0`** → bipolar knob (center detent visual)
5. **`type: "int"` named "Level" / "Volume" / "Gain" / "Amount"** → vertical fader instead of knob
6. **`type: "int"` named "Pan"** → horizontal slider, center-zero
7. **`type: "int"` named "Device"** → dropdown/select, not a knob (it's a machine selector)
8. **`type: "int"` with small discrete `max` (e.g., ≤16)** → dropdown or stepped knob
9. **`type: "bool"`** → toggle switch

These are all heuristics based on parameter naming. They work for PicoSeqRack and every other existing plugin. Future schema versions can add explicit `"display"` hints.

### Interaction

| Action | Behavior |
|--------|----------|
| Drag knob | Continuous value update → API call via FetchQueue |
| Double-click knob label | Reset to default (0 or midpoint) |
| Click numeric value | Edit as text input (direct value entry) |
| Scroll on knob (mouse wheel) | Increment/decrement by step |
| Click group header | Toggle collapse/expand |
| Click "Device" dropdown | Switch active machine (hides/shows machine groups) |

---

## 7. Sample Management — Ableton Move as Reference

### Ableton Move WebUI Analysis

The Ableton Move WebUI (screenshots provided) is an excellent reference for sample and preset management on an embedded audio device. Key patterns observed:

**Navigation:**
- Top-level tabs: Sets, Recordings, **Samples**, Presets
- Settings link in top-right corner
- Language selector

**Sample Browser:**
- Clean table layout with columns: NAME, DATE (sortable ▼), SIZE, KIND
- File types: Folder, Wav
- Folder navigation: click folder name to enter, breadcrumb to go back
- Row actions (right side): Download (↓), Rename (Aa), Delete (🗑)
- Play preview: ▶ icon on each sample row
- "Upload" button (blue, top-right) with dropdown: "Upload files" / "Upload folder"
- "New Folder" button alongside Upload

**Key UX patterns:**
- Upload = simple file picker, conversion happens in the background (not user-facing)
- No waveform preview in the browser — just filename, date, size, kind
- No drag-and-drop reordering of slots — just a flat file browser
- Rename is inline (Aa button)
- Delete has confirmation
- Folders provide organization

### What to Adopt for TBD-16

| Move Pattern | TBD-16 Adaptation |
|-------------|-------------------|
| Table-based file browser | Yes — list view with Name, Size, Kind, Date columns |
| Upload button (files + folders) | Yes — with client-side conversion to 44.1kHz/mono/16-bit hidden from user |
| Play preview (▶ button per sample) | Yes — decode WAV in browser, play via Web Audio |
| Rename (Aa) | Yes — inline rename |
| Delete (🗑) | Yes — with confirmation dialog |
| New Folder | Yes — create folders on SD card for sample organization |
| Download (↓) | Yes — download individual samples from device |
| Background conversion | Yes — user drops any audio format, browser converts silently |

### What NOT to Copy

| Move Pattern | TBD-16 Difference |
|-------------|-------------------|
| Separate "Samples" page tab | TBD-16 uses the "no pages" philosophy — Samples is a **view** within the SPA, not a separate tab/page that reloads everything |
| No waveform display | TBD-16 should show a small waveform thumbnail per sample (we have more screen real estate than Move's mobile-friendly UI) |
| No drag-to-slot | TBD-16 should support drag-and-drop of samples into rompler slots (channels 7, 8, 13, 14 in PicoSeqRack reference sample banks/slices) |

### TBD-16 Sample Manager View

```
┌─────────────────────────────────────────────────────────┐
│ ← Back    Samples                                       │
│                                                         │
│ Bank: [Default ▼]   Slots: 12/128   Used: 8.2 / 28 MB  │
│                                                         │
│ ┌────────────────────────────────────────────────┐      │
│ │  Upload files  │  Upload folder  │  New Folder  │      │
│ └────────────────────────────────────────────────┘      │
│                                                         │
│ NAME                    SIZE     KIND    │              │
│ ──────────────────────────────────────────────────      │
│ 📁 Preset Samples              Folder    Aa  🗑        │
│ ▶ kick_001.wav         282 KB  Wav    ↓  Aa  🗑  ▇▅▃▁ │
│ ▶ snare_dp.wav         390 KB  Wav    ↓  Aa  🗑  ▇▆▃▁ │
│ ▶ hihat_cl.wav          98 KB  Wav    ↓  Aa  🗑  ▇▁▁▁ │
│ ▶ GLITHc 303 01.wav   31.4 MB  Wav    ↓  Aa  🗑  ▇▅▃▂ │
│ ▶ Alexanderplatz.wav   37.0 MB  Wav    ↓  Aa  🗑  ▇▆▅▃ │
│ ▶ Noidea128.wav        39.6 MB  Wav    ↓  Aa  🗑  ▇▇▅▃ │
│ ...                                                     │
│                                                         │
│ ┌──────────────────────────────────────────────────┐    │
│ │  Drag & drop audio files here                    │    │
│ │  WAV, MP3, FLAC, OGG, AIFF — auto-converts      │    │
│ └──────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

Features:
- Play preview (▶) — decodes WAV in browser via AudioContext
- Waveform thumbnail (▇▅▃▁) — rendered on load via OfflineAudioContext
- Download (↓) — fetches file from device
- Rename (Aa) — inline text edit
- Delete (🗑) — confirmation dialog
- Folder navigation — click folder to browse contents
- Upload — file picker OR drag-and-drop, with auto-conversion
- Bank selector — switches active sample bank, triggers `RefreshDataStructure()` on firmware
- Storage info — shows PSRAM usage and slot count

---

## 8. Revised Application Layout

Updates to the layout from the architecture doc, incorporating PicoSeqRack realities and the Move reference.

### Simplified Header

```
┌──────────────────────────────────────────────────────────────┐
│ TBD-16  v1.0.0  ● Connected                                 │
│ Favorites: [1][2][3][4][5][6][7][8][9][10]  🎵  ⚙  🌙  💾  │
└──────────────────────────────────────────────────────────────┘
```

- 🎵 = Samples view toggle
- ⚙ = Config view toggle
- 🌙 = Dark/light mode
- 💾 = Save preset

### When PicoSeqRack is Loaded (Full Width)

Since PicoSeqRack is stereo and takes the full plugin slot, the layout becomes:

```
┌─ Plugin Browser ─┬─ PicoSeqRack ──────────────────────────┐
│                   │                                        │
│ Search...         │ Presets  Replace  Info                  │
│ ──────────        │                                        │
│ DRUMS             │ ┌─ Channel 1 - Kicks ──────── ∧ ──┐   │
│  PicoSeqRack  ★   │ │ [Mute] Device:[0▼]              │   │
│ EFFECTS           │ │ ◎Lev ◎Pan ◎FX1 ◎FX2             │   │
│  CDelay           │ ├─ Dig Bass Drum ──────── ∧ ──────┤   │
│  CStrip           │ │ ◎Accnt ◎Freq ◎Tone ◎Decay      │   │
│ SYNTH             │ │ ◎Dirty ◎FMEnv ◎FMDcy            │   │
│  TBD03            │ │ [Trigger]                        │   │
│  WTOsc            │ ├─ Ana Bass Drum ──────── ∨ ──────┤   │
│  ...              │ │ (collapsed)                      │   │
│                   │ ├─ Channel 2 - Kicks 2 ──── ∧ ────┤   │
│                   │ │ ...                              │   │
│                   │ └──────────────────────────────────┘   │
│                   │                                        │
└───────────────────┴────────────────────────────────────────┘
```

### When a Mono Plugin is in Slot A (Dual Mono Layout)

```
┌─ Browser ─┬─ Slot A: TBD03 ──────┬─ Slot B: CDelay ──────┐
│            │                       │                        │
│ Search...  │ ┌─ Oscillator ─ ∧ ─┐ │ ┌─ Delay ───── ∧ ───┐ │
│ ────────── │ │ ◎Shape  ◎Pitch   │ │ │ ◎Time  ◎Feedback  │ │
│ ...        │ │ ◎Morph0 ◎Morph1  │ │ │ ◎Width ◎Mix       │ │
│            │ ├─ Filter ──── ∧ ──┤ │ └────────────────────┘ │
│            │ │ ◎Cutoff ◎Reso    │ │                        │
│            │ │ ◎EnvMod ◎Drive   │ │                        │
│            │ └──────────────────┘ │                        │
└────────────┴──────────────────────┴────────────────────────┘
```

### View Switching (Non-Destructive)

| Button | View | Content |
|--------|------|---------|
| (default) | Plugin Editor | Plugin browser sidebar + slot(s) with parameters |
| 🎵 | Sample Manager | File browser (Move-style table) + upload zone |
| ⚙ | Configuration | Connection, appearance, system tabs |

Switching views preserves all state. No parameters lost, no plugin unloaded.

---

## 9. API Evolution Strategy

### Phase 1: Keep Current API, Remove Unused Features from UI

The current 15 REST endpoints work. The first iteration uses them as-is, with these UI-level changes:

| API Used | UI Change |
|----------|-----------|
| `getPluginParams/:ch` | Still called, but cv/trig fields are **ignored in rendering** (no dropdowns) |
| `setPluginParamCV/:ch` | Not called from the new WebUI (cv routing managed by hardware UI) |
| `setPluginParamTRIG/:ch` | Not called from the new WebUI (trig routing managed by hardware UI) |
| `getIOCaps` | Not called (no CV/TRIG dropdowns to populate) |

### Phase 2: Add Sample Management Endpoints

New endpoints for the sample manager view:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /api/v1/samples/list?path=<dir>` | GET | List files/folders in a directory |
| `POST /api/v1/samples/upload` | POST | Upload a WAV file (multipart/form-data) |
| `GET /api/v1/samples/download?path=<file>` | GET | Download a sample file |
| `POST /api/v1/samples/rename` | POST | Rename a file or folder |
| `DELETE /api/v1/samples/delete?path=<file>` | DELETE | Delete a file or folder |
| `POST /api/v1/samples/mkdir` | POST | Create a new folder |
| `POST /api/v1/samples/setBank` | POST | Switch active sample bank + hot-reload |

### Phase 3: Add Parameter Polling Endpoint (Optimized)

If full `getPluginParams` is too heavy for 1-second polling:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /api/v1/getParamValues/:ch` | GET | Returns only `{id, current}` pairs (no schema info, no cv/trig) — smaller payload |
| `GET /api/v1/getParamVersion/:ch` | GET | Returns a version counter that increments on any parameter change — poll this first, only fetch values if version changed |

### Phase 4: Preset Editor API

When the macro preset system is ready:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /api/v1/presetEditor/list` | GET | List available preset definition files |
| `GET /api/v1/presetEditor/get/:name` | GET | Get a preset definition JSON |
| `POST /api/v1/presetEditor/save/:name` | POST | Save a preset definition JSON |
| `POST /api/v1/presetEditor/upload` | POST | Upload preset JSON to device SD card |

### Phase 5: Event Stream (Optional)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /api/v1/events` | GET (SSE) | Server-Sent Events stream for real-time parameter changes, connection status, etc. |

---

## 10. First Iteration Scope

### Philosophy: Ship Something Useful, Then Iterate

The first iteration replaces the current 8-page Onsen UI WebUI with a working SPA. It does NOT need to include every feature envisioned in the architecture documents. The goal is:

1. **Works with PicoSeqRack** — the primary plugin, with 300+ parameters rendered cleanly
2. **Works with all other plugins** — generic schema-driven rendering
3. **No pages** — single-page app with views
4. **Knob-first** — audio-appropriate controls
5. **No CV/TRIG dropdowns** — clean interface
6. **Sample management** — basic file browser with upload (Move-inspired)

### Phase 1 Deliverables

| Component | What It Does | Scope |
|-----------|-------------|-------|
| `index.html` | SPA entry point | Single file, loads JS modules |
| `tbd-app-shell` | Layout: header + sidebar + main area + status bar | CSS grid/flexbox with Tailwind |
| `tbd-plugin-browser` | Sidebar: search + plugin list | Categories optional in Phase 1, flat alphabetical list is fine |
| `tbd-slot` | Plugin container: name, presets button, parameter area | Handles both stereo (full-width) and mono (half-width) |
| `tbd-param-knob` | Knob control | Wraps webaudio-knob, fires API calls, shows value below |
| `tbd-param-slider` | Slider control (for Level/Pan/Amount) | Wraps webaudio-slider or native range |
| `tbd-param-switch` | Toggle switch for booleans | Wraps webaudio-switch |
| `tbd-param-group` | Collapsible parameter group | Header with name + chevron, renders children |
| `tbd-favorites-bar` | 10 favorite slots in header | Recall on click, save on long-press |
| `tbd-preset-panel` | Preset load/save | Modal or sidebar, uses existing getPresets/loadPreset/savePreset API |
| `tbd-config-view` | Device configuration | Connection info, WiFi settings, backup/restore, reboot |
| `tbd-sample-manager` | Sample file browser | Table view, upload, rename, delete, preview, bank selection |
| `state.js` | Global state store | EventTarget-based, no framework |
| `fetch-queue.js` | Request serialization | 20 lines of vanilla JS |
| `midi.js` | Web MIDI probe | Detect MIDI availability, display in status bar |

### Phase 1 Does NOT Include

| Feature | When |
|---------|------|
| Preset/macro editor | Phase 2+ (when firmware API is finalized) |
| MIDI CC mapping dialog | Phase 2+ (when firmware mapping API exists) |
| Parameter polling / sync | Phase 2 (but design for it — component architecture makes it easy to add) |
| Browser-side DSP emulation | Phase 3+ (requires WASM build of simulator) |
| SSE / real-time events | Phase 3+ (requires firmware HTTP stack changes) |
| Custom themes / color palettes | Phase 2 (dark/light toggle in Phase 1 is sufficient) |
| Debug panel | Phase 2 (nice-to-have, not essential for v1) |
| Responsive mobile layout | Phase 2 (desktop-first for v1, basic usability on tablet) |
| Plugin categories in sidebar | Phase 2 (requires schema extension or lookup table) |
| Keyboard shortcuts | Phase 2 |

### Implementation Order

```
1. Scaffold          →  index.html + app.js + state.js + fetch-queue.js + Tailwind setup
2. App shell         →  tbd-app-shell with header, sidebar, main area
3. Plugin browser    →  tbd-plugin-browser (flat list, load on click)
4. Parameter knobs   →  tbd-param-knob + tbd-param-slider + tbd-param-switch + tbd-param-group
5. Slot container    →  tbd-slot with recursive renderParams()
6. Presets           →  tbd-preset-panel (load/save)
7. Favorites         →  tbd-favorites-bar (recall/save)
8. Config            →  tbd-config-view (WiFi, backup, reboot)
9. Sample manager    →  tbd-sample-manager (file browser + upload)
10. Polish           →  dark/light mode, status bar, error handling
```

Steps 1–5 deliver a functional plugin editor. Steps 6–7 restore current WebUI parity. Steps 8–9 add new capabilities. Step 10 polishes.

---

## 11. Open Topics

### 1. Device Selector ("Device" Parameter)

The `device` parameter in PicoSeqRack selects which machine runs on a channel (e.g., Device 0 = Digital Bass Drum, Device 1 = Analogue Bass Drum). Currently it's a raw int 0–4095, but the actual valid values are typically 0 or 1.

**Question:** Should the WebUI render this as a dropdown with human-readable names ("Digital Bass Drum" / "Analogue Bass Drum"), or just as a 0/1 selector?

**Answer depends on:** Whether the schema can include device names. Currently the names are only in the group names ("Channel 1 - Machine 0 - Digital Bass Drum"), not in the `device` parameter's metadata. The WebUI could parse the group names to extract device labels — a heuristic but workable.

### 2. Macro Preset JSON Format

The engineer's mockup shows a preliminary format. Questions:
- Is `"presentation"` a fixed enum (`"freq"`, `"bignum"`, etc.) or extensible?
- How are output mapping formulas evaluated? JS `eval()` is a security concern — a restricted expression evaluator is safer.
- Can presets reference multiple machines (cross-channel macros)?
- Will presets be stored on SD card or sent via MIDI SysEx?

These will solidify once the firmware implementation progresses.

### 3. Channel Mixer as Persistent Strip

For PicoSeqRack, should the 16 channel mixer strips (Level/Pan/FX Sends) be shown as a persistent mixer view at the bottom or side of the screen, separate from the per-channel parameter groups? Like a DAW mixer view?

**For Phase 1:** Keep it simple — mixer params are inside each channel's collapsible group, as the schema defines them.

**For Phase 2+:** A dedicated "Mixer" view that shows all 16 channels' Level/Pan/FX Sends as horizontal fader strips would be excellent UX. This is pure frontend — no API changes needed. The data is already in the plugin params.

### 4. Waveform Rendering Performance

Rendering waveform thumbnails for 128 sample slots on page load could be slow. Options:
- Render on-demand (lazy load — render when scrolled into view)
- Cache rendered thumbnails in localStorage as data URLs
- Skip thumbnails in Phase 1, add in Phase 2

### 5. Large Plugin Scroll Performance

PicoSeqRack with all groups expanded would be 300+ knobs on screen. Even with collapsible groups, expanding several channels creates a very long scroll area. Consider:
- Virtual scrolling (only render visible groups)
- Tab-based channel navigation (Channel 1 | Channel 2 | ... | FX | Master)
- "Focus mode" — click a channel to zoom into it, hiding others

**For Phase 1:** Collapsible groups with all but the first two collapsed by default. Good enough.

### 6. Offline / Disconnected Mode

Should the WebUI work without a device connection? Use cases:
- Browse presets locally
- Edit preset JSON files locally
- Prepare sample banks for later upload

**For Phase 1:** No. The WebUI requires a device connection.
**For Phase 2+:** Consider offline preset editing + export as JSON files for manual SD card copy.

### 7. Browser-Side DSP Testing

The engineer envisions "running TBD code in the browser to test sounds without a device." The simulator (`simulator/tbd-sim.cpp`) already compiles the DSP engine for desktop. A WASM build of this could run in the browser.

**Feasibility:** The DSP code uses standard C++ (Mutable Instruments Plaits, custom filters, etc.). Most of it should compile to WASM via Emscripten. The main challenge is the sample ROM (PSRAM access) — could use a local sample bank loaded via File API.

**Priority:** Phase 3+. Useful for sound design and testing, but the physical device is the primary target.

### 8. How to Handle Enum-Like Parameters

Several PicoSeqRack parameters are integers but represent discrete choices:
- `ch9_tbd03_shape` (0–46) — oscillator shape names
- `ch9_tbd03_filter_type` (0–4) — "Off", "LP", "BP", "HP", "Notch"
- `ch12_wtosc_fmode` (0–3) — "Off", "LP", "BP", "HP"
- `ch15_pp_chord` (0–17) — chord type names
- `ch15_pp_q_scale` (0–47) — quantizer scale names

These should render as dropdowns with human-readable labels, not as knobs with numbers.

**Options:**
- Add `"labels"` array to schema: `"labels": ["Off", "LP", "BP", "HP"]`
- Client-side lookup table for known enums
- Heuristic: if `max` is small (≤48) and `step` is 1, render as dropdown

**Phase 1 recommendation:** Render as stepped knob (rotary selector). Phase 2: add labels.
