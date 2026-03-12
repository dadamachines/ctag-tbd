# TBD-16 — Control Surface & Kit Architecture

> **Status:** Third synthesis document — rethinks the parameter control problem from first principles, and defines the Kit/Preset architecture for saving, sharing, and loading complete plugin states.
> **Supersedes:** The `tbd-display.json` approach from the previous version of this document. Also supersedes WEBUI-HARDWARE-UI-SYNTHESIS.md §5 (Parameter Type System) and Appendix A.
> **Prerequisites:** Read [WEBUI-SYNTHESIS.md](WEBUI-SYNTHESIS.md) §3 (Parameter Abstraction Layer) and [WEBUI-HARDWARE-UI-SYNTHESIS.md](WEBUI-HARDWARE-UI-SYNTHESIS.md) §2 (RP2350 PARAMTYPE).
> **Date:** February 2026

---

## Table of Contents

1. [The Real Problem — Not Display, but Control](#1-the-real-problem--not-display-but-control)
2. [Five Stakeholders, One Solution](#2-five-stakeholders-one-solution)
3. [The Three-Layer Architecture](#3-the-three-layer-architecture)
4. [Layer 1 — DSP Parameters (Plugin Code)](#4-layer-1--dsp-parameters-plugin-code)
5. [Layer 2 — Control Surface Definitions](#5-layer-2--control-surface-definitions)
6. [Layer 3 — User State (Presets & Kits)](#6-layer-3--user-state-presets--kits)
7. [How the Control Surface Drives Everything](#7-how-the-control-surface-drives-everything)
8. [The Control Surface File Format](#8-the-control-surface-file-format)
9. [Factory vs. Third-Party vs. User](#9-factory-vs-third-party-vs-user)
10. [API & Firmware Evolution](#10-api--firmware-evolution)
11. [Parameter Unit Type System](#11-parameter-unit-type-system)
12. [Concrete Example — Digital Bass Drum](#12-concrete-example--digital-bass-drum)
13. [The Kit & Preset Architecture](#13-the-kit--preset-architecture)
14. [What This Replaces](#14-what-this-replaces)
15. [Implementation Path](#15-implementation-path)

---

## 1. The Real Problem — Not Display, but Control

### What Version 1 of This Document Got Wrong

The previous version proposed `tbd-display.json` — a WebUI-side file that maps raw param IDs to display metadata (units, conv formulas, scaling). That approach had five fatal flaws:

1. **WebUI-only.** The hardware UI (OLED + 4 knobs + RP2350) would still show raw 0–4095 values. The user experience would diverge between hardware and browser.

2. **Still exposes 388 raw parameters.** Putting "Hz" labels on raw params doesn't solve the usability problem. A Digital Bass Drum has 8 raw DSP parameters that interact in complex ways. A musician doesn't want to think about those — they want "Punch", "Tone", "Body".

3. **Duplicates knowledge.** Every conversion formula has to be manually extracted from C++ source and pasted into a JSON file. When the DSP code changes, the JSON silently goes stale.

4. **Sound designers can't use it.** `tbd-display.json` is a developer artifact. It can't be created or edited without reading C++ source. It can't be shared between users.

5. **No macros.** A single knob can't drive multiple DSP parameters. The developer's preset prototype showed exactly this use case: `BD Decay = 10 + (Cutoff×50) + (Envmod×50)`.

### The Actual Problem Statement

We need **a single portable artifact** that:

- Defines what knobs/controls the user sees (names, ranges, behavior)
- Maps those controls to underlying DSP parameters (possibly many-to-many)
- Works identically on hardware UI, WebUI, and MIDI controllers
- Can be created by sound designers without touching C++
- Can be shared as small files (~1 KB each)
- Ships with factory defaults but allows third-party customization
- Doesn't require changing the plugin C++ code to improve the control experience

This artifact is a **Control Surface Definition**.

---

## 2. Five Stakeholders, One Solution

| Stakeholder | What they need | How the Control Surface helps |
|-------------|---------------|-------------------------------|
| **Firmware developer** | Stable DSP parameter API. Don't break plugins when UX changes. | Plugin C++ only defines raw DSP params + their physical ranges. Control surface is a separate layer. |
| **Plugin developer** | Define DSP behavior. Ship a sane default control layout. Don't maintain UI code. | Plugin ships with a factory control surface JSON. Done. |
| **Sound designer** | Craft curated sound experiences. Create macro mappings. Restrict ranges for musical results. | Edit/create control surface JSONs. One knob → multiple DSP params. Custom ranges. No C++ needed. |
| **WebUI developer** | Render controls generically from data. Don't hardcode plugin-specific layouts. | Control surface JSON is the single rendering schema. Same file drives parameterization everywhere. |
| **End user** | Meaningful controls with real units. "Decay 120ms" not "2048". Same experience on hardware and browser. | Control surface defines display type, unit, range. Hardware UI and WebUI both read it. |

### The Key Insight

The developer's preset editor prototype showed the right shape:

> *"The parameters shown on screen are totally disconnected from the synth underneath, but there is also an 'output mapping' that takes a list of these parameters and combines them into the CC's that the synths understand."*

This isn't just a preset format — it's a **control surface definition format.** The preset (saved values) and the control surface (what's controllable, how) are two different things that share a file.

---

## 3. The Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                   │
│   Layer 3: User State (Presets & Kits)                           │
│   Machine Preset: saved values for one control surface (~100 B)  │
│   Kit: complete plugin snapshot — all 388 params (~20–40 KB)     │
│   File: .kit.jsn files on SD card (factory / artist / user)      │
│   Owner: End user / Artist                                       │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│   Layer 2: Control Surface Definitions                           │
│   What knobs exist, their ranges, units, mapping to DSP params   │
│   File: control surface JSONs on SD card                         │
│   Owner: Plugin developer (factory) / Sound designer (custom)    │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│   Layer 1: DSP Parameters (Plugin C++ Code)                      │
│   Raw atomic<int32_t> values 0–4095, conversion macros           │
│   File: mui-*.jsn (auto-generated schema) + mp-*.jsn (state)    │
│   Owner: Firmware/plugin developer                               │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

**Data flow (user turns a knob):**
```
User turns "Punch" knob (Layer 2 control, range 0–100)
  → Control Surface evaluates output mapping:
      ch1_db_accent  = Punch * 0.8      (DSP param, 0–4095)
      ch1_db_decay   = 10 + Punch * 0.3 (DSP param, 0–4095)
      ch1_db_fm_env  = Punch * 0.5      (DSP param, 0–4095)
  → Firmware receives 3 raw param updates
  → DSP processes them with its own conversion macros
```

**Data flow (hardware UI / WebUI rendering):**
```
Load control surface JSON for current machine
  → Render pages of controls (4 per page for hardware, flexible for WebUI)
  → Each control knows its name, range, unit, display type
  → User manipulates control → output mapping → raw DSP param updates
```

---

## 4. Layer 1 — DSP Parameters (Plugin Code)

### What Exists Today (No Change Required)

Every plugin already has:

| Component | File | Contents |
|-----------|------|----------|
| Schema | `mui-PicoSeqRack.jsn` | Groups, param IDs, names, types, min/max |
| State | `mp-PicoSeqRack.jsn` | Preset slots with current values + CV/trig routing |
| C++ code | `ctagSoundProcessorPicoSeqRack.cpp` | Conversion macros `MK_FLT_PAR_ABS_MIN_MAX_NOCV(...)` |

**This layer stays as-is.** The plugin developer defines DSP parameters in C++. The `knowYourself()` method generates the `mui` schema. The `mp` file stores raw values. This is stable and works.

### What We Should Add to This Layer (Small Firmware Change)

The `mui-*.jsn` schema already has `id`, `name`, `type`, `min`, `max`. We should add **one new optional field** per parameter: the physical range and scale. This is metadata the C++ code already knows (it's in the `MK_FLT_PAR_*` macros):

```json
{
  "id": "ch1_db_f0",
  "name": "Base Frequency",
  "type": "int",
  "min": 0,
  "max": 4095,
  "physMin": 20.0,
  "physMax": 1000.0,
  "scale": "linear"
}
```

This is a **small, additive change** to `knowYourself()`. Existing code ignores unknown JSON fields, so backward compatibility is preserved. The information is already in the C++ macros — we're just emitting it.

```cpp
// Today:
pMapPar.emplace("ch1_db_f0", [&](const int val){ ch1_db_f0 = val; });

// Proposed (add physical range metadata to schema generation):
pMapParMeta.emplace("ch1_db_f0", ParamMeta{20.f, 1000.f, "linear", "Hz"});
```

**Why this matters:** Once the plugin code declares its physical ranges, control surface definitions can reference them. A sound designer creating a "Cutoff" macro that maps to `ch1_db_f0` automatically knows the range is 20–1000 Hz. They can decide to restrict it to 50–500 Hz for their preset without guessing.

**When to do this:** Not a blocker for v1. The control surface format works without it (the sound designer manually enters the range). But it should happen early because it eliminates the manual extraction problem and makes the C++ code self-documenting.

---

## 5. Layer 2 — Control Surface Definitions

### What Is a Control Surface?

A control surface definition is a JSON file that describes:

1. **What controls the user sees** — names, grouping into pages
2. **How each control behaves** — range, resolution, display type, unit
3. **How controls map to DSP parameters** — the output mapping formulas

It is **not** a preset (saved values). It is the **shape** of the control experience. Multiple presets can exist for one control surface.

### Relationship to the Developer's Prototype

The developer's mockup (from the screenshot) showed:

```
Left panel: Preset configuration
  - Preset name: "My preset"
  - Machine: "db" (Digital Bass Drum)
  - JSON with groups → parameters
  - Output mapping: "BD Decay = 10+(Cutoff*50)+(Envmod*50)"

Right panel: Audio parameters
  - Pages with 4 params each
  - Per-param: Default, Range, Resolution
```

This is almost exactly what we need. The difference is structural: we separate the **control surface definition** (the shape) from the **preset** (the saved values). The prototype combined them in one JSON.

### Why Separate?

| Combined (prototype) | Separated (proposed) |
|----------------------|----------------------|
| One file per preset (~1 KB) | Control surface (~1 KB) + preset (~200 bytes) |
| Changing a knob range requires editing every preset that uses it | Change the control surface once; all presets using it are updated |
| Sound designer workflow: edit preset → change mappings → test → repeat | Sound designer workflow: design control surface → create multiple presets → share all |
| Machine selector baked into preset | Control surface targets a machine generically; presets are just values |

### But Also: Combined Is Simpler

The developer's instinct to combine them has merit — fewer files. We should support **both modes**:

1. **Standalone control surface** — lives as a file. Multiple presets reference it. For power users and sound designers.
2. **Inline control surface + preset** — a single "patch" file that contains both the control layout and saved values. For sharing, importing, "this is my complete sound." This is what the developer's prototype produces.

The runtime doesn't care — it parses the same control surface structure whether it comes from a standalone file or is embedded in a preset.

---

## 6. Layer 3 — User State (Presets & Kits)

### Two Levels of Saved State

The previous version of this section defined presets only as ~200-byte value stubs for individual control surfaces. That missed the most important use case: **end users want to save and share the complete state of the entire plugin** — every channel's knob position, every sample selection, every mixer setting, every FX parameter. All of it.

This leads to two distinct but complementary concepts:

| Concept | Scope | What it contains | Who creates it | Analogy |
|---------|-------|-------------------|----------------|---------|
| **Machine Preset** | One machine (e.g., Digital Bass Drum on Ch 1) | Values for the controls of one control surface | Sound designer or end user | Elektron "Sound" |
| **Kit** | Entire plugin (all 16 channels + mixer + FX + master) | All 388 param values — the complete plugin state | Artist or end user | Elektron "Kit", TE "Project" |

**The Kit is the primary shareable unit.** When Stimming creates a PicoSeqRack configuration and shares it, they share a Kit — not 16 individual machine presets.

### What's a Machine Preset?

A machine preset is saved values for the controls of **one** control surface on **one** channel. It's what §12.4 shows:

```json
{
  "name": "Deep House Kick",
  "surface": "808_punchy",
  "values": { "punch": 45, "pitch": 52, "length": 80, "click": 15 }
}
```

~100 bytes. Useful for quickly switching between kick sounds within a session. But this is NOT what users share — it's too narrow.

### What's a Kit?

A Kit is the **complete snapshot of the entire PicoSeqRack plugin**. It contains:

- All 388 DSP parameter values across all 16 channels
- Which machine type is loaded on each channel (Digital Bass Drum, Rompler, TBD03, etc.)
- Which sample kit/pack is selected on each Rompler channel
- Which bank and slice is active on each Rompler channel
- Mixer levels, pans, sends for all channels
- FX settings (delay time, feedback, reverb size, etc.)
- Master settings (volume, compressor, etc.)
- Metadata: name, author, genre, description, tags

A Kit is what an artist like **Stimming** would create — his complete drum machine setup for a particular genre or track. "Stimming's Deep Techno Kit" contains: kick frequency/decay/tone, snare tightness, hihat openness, rompler sample selections, mixer balance, FX sends, reverb tail — everything.

### Kit Format

```json
{
  "format": "tbd16-kit",
  "version": 1,
  "plugin": "PicoSeqRack",
  
  "name": "Deep Techno Kit",
  "author": "Stimming",
  "description": "Dark, minimal techno kit. Punchy 909-style kick, tight snare, closed hats. Delay on channel 5, long reverb tail.",
  "genre": "Techno",
  "tags": ["techno", "minimal", "dark", "909"],
  "created": "2026-03-15",
  
  "channels": {
    "ch1": { "machine": "db",   "patchName": "909 Kick" },
    "ch2": { "machine": "ds",   "patchName": "Tight Snare" },
    "ch3": { "machine": "hh1",  "patchName": "Closed Hat" },
    "ch4": { "machine": "hh2",  "patchName": "Open Hat" },
    "ch5": { "machine": "smp",  "patchName": "Perc Loop",  "sampleKit": "drums/808_kit", "bank": 0, "slice": 3 },
    "ch6": { "machine": "smp",  "patchName": "Stab",       "sampleKit": "other/stabs",   "bank": 1, "slice": 7 }
  },

  "params": [
    { "id": "ch1_db_f0",      "current": 1200 },
    { "id": "ch1_db_decay",   "current": 2800 },
    { "id": "ch1_db_tone",    "current": 1600 },
    { "id": "ch1_db_accent",  "current": 3200 },
    { "id": "ch1_db_dirty",   "current": 0 },
    { "id": "ch1_db_fm_env",  "current": 800 },
    { "id": "ch1_db_fm_dcy",  "current": 600 },
    { "id": "ch2_ds_f0",      "current": 2048 },
    { "id": "ch1_vol",        "current": 3200 },
    { "id": "ch1_pan",        "current": 2048 },
    { "id": "ch1_send1",      "current": 0 },
    { "id": "ch1_send2",      "current": 1024 },
    { "id": "fx1_delay_time", "current": 1500 },
    { "id": "fx1_delay_fb",   "current": 2000 },
    { "id": "fx2_reverb_size","current": 3400 },
    { "id": "c_master_vol",   "current": 3800 }
  ]
}
```

**Key properties of this format:**

1. **`params` is a flat array of ALL raw DSP parameter values** — exactly what today's `mp-PicoSeqRack.jsn` already stores in each patch. The existing system works at the right granularity.

2. **`channels` is metadata** — it records which machine is loaded on each channel and which samples are selected. This is the information needed to reconstruct the plugin state from scratch (e.g., on a different device or after a factory reset).

3. **The Kit does NOT contain control surface definitions.** It stores raw DSP param values (Layer 1). A Kit works regardless of which control surface the user has active. Stimming's Kit sounds the same whether the user has the factory surface or a custom macro surface loaded.

4. **CV/trig routing is optional.** The existing `mp-*.jsn` stores `cv` and `trig` assignments per param. For sharing, these are typically omitted (hardware-specific). For local save/restore, they're included.

### How This Maps to the Existing Codebase

The existing preset system is **already almost a Kit system**:

| Existing concept | Kit concept | What needs to change |
|-----------------|-------------|---------------------|
| `mp-PicoSeqRack.jsn` → `patches[n]` | One Kit | Already stores all 388 params as flat array |
| `patches[n].name` | `kit.name` | Add richer metadata (author, genre, description, tags) |
| `patches[n].params` | `kit.params` | Same format — `{id, current}` pairs |
| `activePatch` | Active Kit | Same concept |
| `GetCStrJSONAllPresetData()` | Export Kit | Already exports the full mp file |
| `SetActivePluginParameters()` | Import Kit | Already imports a complete param set |
| `LoadPreset(n)` / `SavePreset(name, n)` | Load/Save Kit | Same operation |
| (missing) | `kit.channels` | New: record machine assignments per channel |
| (missing) | `kit.author`, `kit.genre`, etc. | New: metadata for sharing |
| `favs.jsn` | (related but different) | Favorites store plugin ID + preset number per channel; Kits store full state |

**The existing `mp-*.jsn` system is the foundation.** The upgrade path is:
1. Add metadata fields to each patch entry
2. Add channel machine assignments to each patch
3. Add sample selection info to each patch
4. Create an export format that wraps a single patch + metadata into a shareable Kit file

### Why the Kit Format Uses Raw Params (Not Control Surface Values)

A Kit stores `ch1_db_f0 = 1200` (raw DSP param), not `freq = 350` (control surface value). This is intentional:

1. **Independence from Control Surfaces.** A Kit shared by Stimming works whether the recipient has the factory surface, a custom macro surface, or no surface at all. The DSP doesn't care about control surfaces.

2. **No re-evaluation needed.** When loading a Kit, the firmware writes raw values directly to the DSP. No mapping expressions to evaluate. Instant recall.

3. **Round-trip fidelity.** Raw values are what the DSP actually processes. Storing control surface values and re-mapping them could introduce rounding errors, especially with many-to-one macros.

4. **Backward compatibility.** This is exactly what `mp-*.jsn` already does.

When a Kit is loaded and the user has a control surface active, the WebUI/hardware reverse-maps the raw DSP values back to control positions for display. This is a UI concern, not a storage concern.

### What's a Patch? (Combined Mode — Control Surface + Kit)

A patch is a **control surface + saved values** in one file. This is what the developer's prototype produces:

```json
{
  "name": "Techno Kick 808",
  "machine": "db",
  "version": 1,
  "pages": [
    {
      "name": "Sound",
      "controls": [
        {
          "id": "punch",
          "name": "Punch",
          "type": "knob",
          "min": 0,
          "max": 100,
          "default": 50,
          "resolution": 50,
          "display": "percent",
          "value": 72
        },
        {
          "id": "tone",
          "name": "Tone",
          "type": "knob",
          "min": 20,
          "max": 800,
          "default": 200,
          "display": "freq_hz",
          "value": 350
        },
        {
          "id": "body",
          "name": "Body",
          "type": "knob",
          "min": 0,
          "max": 100,
          "default": 50,
          "display": "percent",
          "value": 60
        },
        {
          "id": "attack",
          "name": "Attack",
          "type": "knob",
          "min": 0,
          "max": 100,
          "default": 30,
          "display": "percent",
          "value": 12
        }
      ]
    },
    {
      "name": "Character",
      "controls": [
        {
          "id": "decay",
          "name": "Decay",
          "type": "knob",
          "min": 10,
          "max": 500,
          "default": 120,
          "display": "time_ms",
          "value": 250
        },
        {
          "id": "dirt",
          "name": "Dirt",
          "type": "knob",
          "min": 0,
          "max": 100,
          "default": 0,
          "display": "percent",
          "value": 33
        },
        {
          "id": "fm_amount",
          "name": "FM Amount",
          "type": "knob",
          "min": 0,
          "max": 100,
          "default": 20,
          "display": "percent",
          "value": 45
        },
        {
          "id": "fm_decay",
          "name": "FM Decay",
          "type": "knob",
          "min": 5,
          "max": 200,
          "default": 50,
          "display": "time_ms",
          "value": 80
        }
      ]
    }
  ],
  "mapping": [
    { "target": "ch1_db_f0",      "expr": "tone" },
    { "target": "ch1_db_tone",    "expr": "body * 40.95" },
    { "target": "ch1_db_decay",   "expr": "decay / 500 * 4095" },
    { "target": "ch1_db_dirty",   "expr": "dirt * 40.95" },
    { "target": "ch1_db_fm_env",  "expr": "fm_amount * 40.95" },
    { "target": "ch1_db_fm_dcy",  "expr": "fm_decay / 200 * 4095" },
    { "target": "ch1_db_accent",  "expr": "punch * 40.95" },
    { "target": "ch1_db_trigger", "expr": "0" }
  ]
}
```

**~1 KB.** Shareable. Contains everything needed to recreate the sound and the control experience.

---

## 7. How the Control Surface Drives Everything

### 7.1 Hardware UI (RP2350)

The RP2350 firmware's PARAMTYPE system already supports structured parameter pages:

```cpp
struct AUDIOPARAMGROUP {
    uint8_t numPages;
    struct AUDIOPARAM param[MAX_AUDIOPARAMS]; // params[0..3] = page 0, etc.
};
```

The control surface JSON maps directly to this:
- Each `page` in the JSON → one page in `AUDIOPARAMGROUP`
- Each `control` → one `AUDIOPARAM`
- The `display` field → `PARAMTYPE` enum value
- The `min`/`max` fields → param range constraints
- 4 controls per page → 4 physical knobs

**When a control surface is loaded on the hardware:**
1. RP2350 parses the JSON (or receives a binary representation from ESP32)
2. Populates `AUDIOPARAMGROUP` with the control definitions
3. OLED shows page names and control labels
4. Knob values are shown in the correct units (Hz, ms, %, etc.)
5. On knob change → evaluate output mapping → send raw param values to ESP32

### 7.2 WebUI (Browser)

The WebUI receives the same control surface JSON (via API) and renders it:
- Each `page` → a 4-knob row (or a section with knobs/switches)
- Each `control` → a `<webaudio-knob>` or `<webaudio-switch>` with the correct `conv`, `min`, `max`, `log`
- `display` type drives formatting (Hz, ms, dB, %)
- On knob change → evaluate output mapping → send raw param values via REST API

### 7.3 MIDI Controller

A MIDI controller sends CC values. The control surface maps CCs to controls:
- CC 1 → "punch" control (0–127 maps to 0–100 in control range)
- CC 2 → "tone" control
- The output mapping evaluates → raw DSP param updates

### 7.4 The Output Mapping Is the Key

The output mapping is what makes this architecture powerful:

```json
{
  "mapping": [
    { "target": "ch1_db_accent", "expr": "punch * 0.6 + attack * 0.4" },
    { "target": "ch1_db_decay",  "expr": "decay / 500 * 4095" },
    { "target": "ch1_db_f0",     "expr": "tone / 800 * 4095" }
  ]
}
```

- **One-to-one:** "tone" → `ch1_db_f0` (simple scaling)
- **Many-to-one:** "punch" + "attack" → `ch1_db_accent` (macro combination)
- **One-to-many:** "punch" → `ch1_db_accent` AND `ch1_db_fm_env` (one knob, multiple DSP effects)
- **Constant:** `ch1_db_trigger` → always 0 (parameter locked by the sound designer)
- **Conditional (future):** IF mode == 1 THEN use mapping A ELSE mapping B

The expression language is intentionally simple — basic math operations on control IDs. This can run on the RP2350 (integer arithmetic), in the browser (JavaScript `eval`-like), or be pre-compiled.

---

## 8. The Control Surface File Format

### 8.1 Top-Level Structure

```json
{
  "version": 1,
  "name": "Punchy Digital Kick",
  "author": "Factory",
  "machine": "db",
  "description": "Tight, punchy digital bass drum with FM control",
  "tags": ["kick", "808", "digital", "punchy"],
  
  "pages": [ ... ],
  "mapping": [ ... ],
  
  "values": { ... }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `version` | Yes | Format version (currently 1) |
| `name` | Yes | Human-readable name |
| `author` | No | Creator name (for sharing) |
| `machine` | Yes | Target DSP machine ID (e.g., `"db"`, `"ab"`, `"tbd03"`) |
| `description` | No | Short description |
| `tags` | No | Searchable tags |
| `pages` | Yes | Array of parameter pages (see §8.2) |
| `mapping` | Yes | Array of output mappings (see §8.3) |
| `values` | No | Saved control values (if this is a combined patch file). If absent, defaults from control definitions are used. |

### 8.2 Pages & Controls

```json
{
  "pages": [
    {
      "name": "Sound",
      "controls": [
        {
          "id": "punch",
          "name": "Punch",
          "shortname": "PUNCH",
          "type": "knob",
          "display": "percent",
          "min": 0,
          "max": 100,
          "default": 50,
          "resolution": 100
        },
        {
          "id": "ftype",
          "name": "Filter Type",
          "shortname": "FTYPE",
          "type": "select",
          "display": "select",
          "options": ["LP", "HP", "BP", "Notch"],
          "default": 0
        },
        {
          "id": "freeze",
          "name": "Freeze",
          "shortname": "FREEZ",
          "type": "toggle",
          "display": "toggle",
          "default": false
        }
      ]
    }
  ]
}
```

**Control types:**

| type | display options | Widget (WebUI) | Widget (HW) |
|------|----------------|----------------|--------------|
| `knob` | `percent`, `freq_hz`, `time_ms`, `db`, `pan`, `ratio`, `semitones`, `cents`, `degrees`, `amount`, `normalized`, `int_count`, ... | `<webaudio-knob>` | Endless encoder + value display |
| `toggle` | `toggle` | `<webaudio-switch>` | Push-button toggle or encoder detent |
| `select` | `select` | `<sl-select>` / radio group | Encoder-stepped through option list |

**Control fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique within this control surface. Used in mapping expressions. |
| `name` | string | Yes | Full display name for WebUI |
| `shortname` | string | No | ≤6 chars for OLED. Auto-derived from `name` if absent. |
| `type` | enum | Yes | `"knob"`, `"toggle"`, `"select"` |
| `display` | string | Yes | Display type (see §11 for full list) |
| `min` | number | For knob | Minimum value in physical units |
| `max` | number | For knob | Maximum value in physical units |
| `default` | number/bool | Yes | Default value |
| `resolution` | number | No | Steps (0 = continuous; n = n steps) |
| `options` | string[] | For select | Option labels |
| `page` | — | — | Implicit: controls are grouped into pages of exactly 4 for hardware compatibility |

### 8.3 Output Mapping

```json
{
  "mapping": [
    {
      "target": "ch1_db_f0",
      "expr": "tone / 800 * 4095"
    },
    {
      "target": "ch1_db_decay",
      "expr": "decay / 500 * 4095"
    },
    {
      "target": "ch1_db_accent",
      "expr": "punch * 0.6 * 40.95 + attack * 0.4 * 40.95"
    },
    {
      "target": "ch1_db_dirty",
      "expr": "dirt * 40.95"
    }
  ]
}
```

**Expression language:**
- Variables: control IDs (`punch`, `tone`, `decay`, etc.)
- Operators: `+ - * /` and parentheses
- Constants: numeric literals
- Functions (v2): `min()`, `max()`, `clamp()`, `lerp()`
- **No ternary, no conditionals in v1** — keep it evaluable on RP2350

**The expression evaluator** needs three implementations:
1. **RP2350 (C):** Integer/fixed-point arithmetic. ~100 lines of tokenizer + stack evaluator. Runs per-knob-change.
2. **ESP32-P4 (C++):** Same evaluator, or `sscanf`-based. Runs when WebUI sends mapped params.
3. **Browser (JS):** Trivial — `new Function('punch', 'tone', ..., 'return ' + expr)`.

Alternatively, the mapping can be evaluated **only in one place** (e.g., the RP2350 or the browser) and the raw results sent to the ESP32 DSP. The ESP32 doesn't need to understand the mapping — it just receives raw param values.

### 8.4 Machine Targeting

The `machine` field connects a control surface to a specific DSP engine. Machine IDs correspond to the group prefixes in the `mui` schema:

| Machine ID | mui group(s) | DSP Class |
|------------|-------------|-----------|
| `db` | `ch*_db_group` | Digital Bass Drum (RackDBD) |
| `ab` | `ch*_ab_group` | Analogue Bass Drum (RackABD) |
| `ds` | `ch*_ds_group` | Digital Snare (RackDSD) |
| `as` | `ch*_as_group` | Analogue Snare (RackASD) |
| `hh1` | `ch*_hh1_group` | HiHat 1 (RackHH1) |
| `hh2` | `ch*_hh2_group` | HiHat 2 (RackHH2) |
| `fmb` | `ch*_fmb*_group` | FM Bass Drum (RackFMB) |
| `rs` | `ch*_rs_group` | Rimshot (RackRimshot) |
| `cl` | `ch*_cl_group` | Clap (RackClap) |
| `smp` | `ch*_smp_group` | Rompler (RackRompler) |
| `tbd03` | `ch*_tbd03_group` | TBD03 Bass Synth (RackTBD03) |
| `mo` | `ch*_mo_group` | Macro Oscillator (RackMO) |
| `wtosc` | `ch*_wtosc_group` | WT Oscillator (RackWTOsc) |
| `pp` | `ch*_pp_group` | PolyPad (RackPolyPad) |
| `mixer` | `ch*_group` | Channel mixer strip (RackChannelMixer) |
| `fx_delay` | `fx1_group` | FX1 Delay (RackFxDelay) |
| `fx_reverb` | `fx2_group` | FX2 Reverb (RackFxReverb) |
| `master` | `c_group` + `sum` | Master (RackFxMaster) |

When a control surface targets machine `"db"` and is loaded on channel 1, the mapping's `target` field resolves `ch1_db_f0`, `ch1_db_decay`, etc. On channel 3, the same surface resolves `ch3_db_f0`, `ch3_db_decay` — same machine, different channel. The channel prefix is resolved at load time.

This means **one control surface definition works for any channel** running that machine.

---

## 9. Factory vs. Third-Party vs. User

### 9.1 SD Card Layout

```
/sdcard/data/
  sp/
    mui-PicoSeqRack.jsn          ← Plugin schema (firmware-generated, don't touch)
    mp-PicoSeqRack.jsn           ← Plugin state/presets (firmware-managed)
  surfaces/
    factory/
      db_default.jsn              ← Factory control surface for Digital Bass Drum
      db_punchy.jsn               ← Factory variant: punchy 808 style
      ab_default.jsn              ← Factory control surface for Analogue Bass Drum
      tbd03_default.jsn           ← Factory control surface for TBD03
      mixer_default.jsn           ← Factory mixer strip surface
      fx_delay_default.jsn        ← Factory delay surface  
      fx_reverb_default.jsn       ← Factory reverb surface
      master_default.jsn          ← Factory master surface
      ...
    user/
      my_kick_v2.jsn              ← User-created control surface
      minimal_techno_kit.jsn      ← Third-party downloaded surface
```

### 9.2 The Factory Control Surface *Is* the Product Default

When the TBD-16 ships, `factory/db_default.jsn` defines the default experience for every Digital Bass Drum channel. This is the file that a firmware developer creates when they build a new synth engine. It replaces the role of hardcoded parameter pages in the RP2350 firmware.

**Today:** The RP2350 firmware has statically compiled `AUDIOPARAMGROUP` arrays that define which params go on which page. Changing them requires a firmware rebuild.

**Tomorrow:** The RP2350 loads `factory/db_default.jsn` from SD card. A firmware update ships new control surfaces. A sound designer overrides them by placing files in `user/`.

### 9.3 Control Surface Selection Per Channel

Each channel in PicoSeqRack can have its own active control surface. The mapping:

```
Channel 1 (Kicks, Machine 0: Digital Bass Drum)
  → Active surface: "factory/db_default" (or "user/my_kick_v2")
  → Surface targets machine "db"
  → Mapping references ch1_db_* params
```

The channel ↔ surface association is stored as part of the device state (new field in `mp-*.jsn` or a separate config).

### 9.4 Third-Party Sound Design Workflow

1. Sound designer opens the WebUI **Patch Editor** (or a standalone tool)
2. Selects target machine (e.g., "Digital Bass Drum")
3. Creates control pages: drags/adds knobs, names them, sets ranges
4. Defines output mappings: "Punch → accent * 0.8 + fm_env * 0.3"
5. Dials in values: creates multiple variations (presets)
6. Exports as `.jsn` file(s) (~1 KB each)
7. Shares via web, Discord, email — just a JSON file
8. User drops the file into `/sdcard/data/surfaces/user/` or uploads via WebUI
9. Selects the new surface for their channel → done

**No firmware update, no C++ knowledge, no build tools.**

---

## 10. API & Firmware Evolution

### 10.1 New API Endpoints Needed

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v2/surfaces` | GET | List available control surfaces (factory + user) |
| `/api/v2/surfaces/:id` | GET | Get a specific control surface JSON |
| `/api/v2/surfaces` | POST | Upload new control surface |
| `/api/v2/surfaces/:id` | DELETE | Delete user control surface |
| `/api/v2/channels/:ch/surface` | GET | Get active surface for channel |
| `/api/v2/channels/:ch/surface` | PUT | Set active surface for channel |
| `/api/v2/params/:ch` | POST | Batch set multiple raw params (for mapping output) |
| `/api/v2/params/:ch` | GET | Get current raw param values (same as v1 merged schema) |

### 10.2 Where Does the Mapping Execute?

Three options for where the output mapping (control value → raw DSP params) runs:

| Location | Pros | Cons |
|----------|------|------|
| **Browser (WebUI)** | JS eval is trivial. Zero firmware work. | Only works when WebUI is connected. |
| **RP2350 (hardware UI)** | Works without WiFi. Hardware knobs directly produce mapped values. | Needs expression evaluator in C. ~100 lines. |
| **ESP32-P4 (DSP firmware)** | Central, always available. | Adds processing to DSP core. More invasive change. |

**Recommended:** RP2350 + Browser both evaluate mappings independently. The ESP32-P4 DSP firmware only receives raw param values — it doesn't know about control surfaces.

```
┌─────────────┐     raw params      ┌───────────────┐
│  RP2350     │────────────────────→ │   ESP32-P4    │
│  (HW UI)    │   SPI/USB           │   (DSP)       │
│  evaluates  │                     │  just receives │
│  mapping    │                     │  raw 0–4095    │
└─────────────┘                     └───────────────┘
                                          ↑
┌─────────────┐     raw params      │
│  Browser    │────────────────────→ │
│  (WebUI)    │   HTTP API          │
│  evaluates  │                     
│  mapping    │                     
└─────────────┘                     
```

Both the RP2350 and the browser load the same control surface JSON. Both evaluate the same mapping expressions. Both send raw param results to the ESP32-P4. The ESP32-P4 never changes.

### 10.3 Keeping v1 API Working

All existing v1 endpoints remain. The WebUI can still operate in "raw mode" — showing all 388 parameters from the `mui` schema with basic 0–4095 controls. This is essential for:
- Debugging
- Power users who want direct DSP access
- Plugins that don't have control surfaces yet
- Backward compatibility with the old WebUI

Control surface mode is an overlay, not a replacement.

### 10.4 Batch Param Endpoint

The single most important firmware addition — already prototyped in the codebase:

```http
POST /api/v2/params/0
Content-Type: application/json

{
  "params": [
    { "id": "ch1_db_f0", "current": 2048 },
    { "id": "ch1_db_decay", "current": 1500 },
    { "id": "ch1_db_accent", "current": 3000 }
  ]
}
```

The method `SetChannelParamsFromCStrJSON()` in `ctagSoundProcessor.hpp` already does exactly this. We just need a REST endpoint wired to it.

---

## 11. Parameter Unit Type System

The `display` field on each control determines how values are shown. These display types are shared across hardware UI and WebUI:

### 11.1 Continuous Types

| display | Unit | Scale | Example display | Widget |
|---------|------|-------|-----------------|--------|
| `freq_hz` | Hz / kHz | log | "440 Hz", "1.2 kHz" | knob |
| `time_ms` | ms / s | log | "120 ms", "2.5 s" | knob |
| `time_s` | s | log | "0.35 s", "12 s" | knob |
| `rate_hz` | Hz | log | "0.25 Hz", "5 Hz" | knob |
| `bpm` | BPM | linear | "120 BPM" | knob |
| `db` | dB | linear | "-12.5 dB", "+3 dB" | knob |
| `db_gain` | dB | linear | "0 dB", "+24 dB" | knob |
| `ratio` | :1 | linear | "4.0:1", "∞:1" | knob |
| `pan` | L/C/R | linear | "L50", "C", "R47" | knob |
| `percent` | % | linear | "75%" | knob |
| `percent_bipolar` | % | linear | "-50%", "+75%" | knob |
| `amount` | — | linear | "42" (unitless 0–100) | knob |
| `normalized` | — | linear | "0.65" (0.00–1.00) | knob |
| `semitones` | st | linear | "-12 st", "+7 st" | knob |
| `cents` | ct | linear | "-50 ct", "+23 ct" | knob |
| `degrees` | ° | linear | "90°", "270°" | knob |
| `q` | Q | linear | "0.7", "12" | knob |
| `stereo_width` | % | linear | "0%", "120%" | knob |
| `int_count` | — | linear | "4", "16" (stepped) | knob |

### 11.2 Discrete Types

| display | Widget | Description |
|---------|--------|-------------|
| `toggle` | switch | On/Off |
| `select` | dropdown/radio | Named options from `options` array |

### 11.3 Display Type Formatting Rules

| Rule | Example |
|------|---------|
| Auto Hz↔kHz at 1000 | 950 Hz → 1.2 kHz |
| Auto ms↔s at 1000 | 800 ms → 1.2 s |
| Pan: L/C/R notation | value < 0 → "L50", value == 0 → "C", value > 0 → "R50" |
| Ratio: infinity at max | ratio > 100 → "∞:1" |
| Signed dB | always show sign: "+3.0 dB", "-12.5 dB", "0.0 dB" |

### 11.4 How This Differs From the Previous tbd-display.json Approach

The display types list is almost the same. The critical difference:

- **Before:** Types were assigned per raw DSP param in a WebUI-only overlay file. The hardware UI couldn't use them.
- **Now:** Types are assigned per **control** in the control surface JSON. Both hardware UI and WebUI read the same file. A sound designer chooses the display type when creating a control — not the firmware developer.

---

## 12. Concrete Example — Digital Bass Drum

### 12.1 The DSP Layer (Layer 1) — Already Exists

From `mui-PicoSeqRack.jsn` and `RackDBD.cpp`:

| DSP param | Raw range | Physical range | Conversion |
|-----------|-----------|---------------|------------|
| `ch1_db_trigger` | bool | — | — |
| `ch1_db_accent` | 0–4095 | 0–1 | linear |
| `ch1_db_f0` | 0–4095 | 20–1000 Hz | linear min-max |
| `ch1_db_tone` | 0–4095 | 0–1 | linear |
| `ch1_db_decay` | 0–4095 | 0–1 | linear |
| `ch1_db_dirty` | 0–4095 | 0–1 | linear |
| `ch1_db_fm_env` | 0–4095 | 0–1 | linear |
| `ch1_db_fm_dcy` | 0–4095 | 0–1 | linear |

These are the "wires" underneath. The user should never need to see these.

### 12.2 Factory Default Control Surface (Layer 2)

`/sdcard/data/surfaces/factory/db_default.jsn`:

```json
{
  "version": 1,
  "name": "Digital Bass Drum",
  "author": "Factory",
  "machine": "db",
  "description": "Default control surface for the Mutable Instruments-style synthetic bass drum",

  "pages": [
    {
      "name": "SOUND",
      "controls": [
        { "id": "freq",    "name": "Frequency",    "shortname": "FREQ",  "type": "knob", "display": "freq_hz", "min": 20, "max": 1000, "default": 200, "resolution": 0 },
        { "id": "tone",    "name": "Tone",         "shortname": "TONE",  "type": "knob", "display": "percent", "min": 0, "max": 100, "default": 50, "resolution": 0 },
        { "id": "decay",   "name": "Decay",        "shortname": "DECAY", "type": "knob", "display": "percent", "min": 0, "max": 100, "default": 50, "resolution": 0 },
        { "id": "accent",  "name": "Accent",       "shortname": "ACCNT", "type": "knob", "display": "percent", "min": 0, "max": 100, "default": 0, "resolution": 0 }
      ]
    },
    {
      "name": "FM",
      "controls": [
        { "id": "dirty",   "name": "Dirtiness",    "shortname": "DIRTY", "type": "knob", "display": "percent", "min": 0, "max": 100, "default": 0, "resolution": 0 },
        { "id": "fm_env",  "name": "FM Envelope",  "shortname": "FMENV", "type": "knob", "display": "percent", "min": 0, "max": 100, "default": 20, "resolution": 0 },
        { "id": "fm_dcy",  "name": "FM Decay",     "shortname": "FMDCY", "type": "knob", "display": "percent", "min": 0, "max": 100, "default": 50, "resolution": 0 },
        { "id": "_empty",  "name": "",              "type": "empty" }
      ]
    }
  ],

  "mapping": [
    { "target": "db_f0",      "expr": "(freq - 20) / (1000 - 20) * 4095" },
    { "target": "db_tone",    "expr": "tone / 100 * 4095" },
    { "target": "db_decay",   "expr": "decay / 100 * 4095" },
    { "target": "db_accent",  "expr": "accent / 100 * 4095" },
    { "target": "db_dirty",   "expr": "dirty / 100 * 4095" },
    { "target": "db_fm_env",  "expr": "fm_env / 100 * 4095" },
    { "target": "db_fm_dcy",  "expr": "fm_dcy / 100 * 4095" }
  ]
}
```

Note: The mapping targets use **machine-local param names** (no channel prefix). The channel prefix is added at load time based on which channel this surface is assigned to.

### 12.3 Sound Designer's Custom Surface (Layer 2)

A third-party sound designer creates `808_punchy.jsn`:

```json
{
  "version": 1,
  "name": "808 Punch",
  "author": "SynthMaster3000",
  "machine": "db",
  "description": "Simplified 808-style kick with Punch macro",
  "tags": ["808", "kick", "punchy", "simple"],

  "pages": [
    {
      "name": "KICK",
      "controls": [
        { "id": "punch",   "name": "Punch",    "shortname": "PUNCH", "type": "knob", "display": "percent", "min": 0, "max": 100, "default": 60, "resolution": 0 },
        { "id": "pitch",   "name": "Pitch",    "shortname": "PITCH", "type": "knob", "display": "freq_hz", "min": 30, "max": 200, "default": 60, "resolution": 0 },
        { "id": "length",  "name": "Length",    "shortname": "LNGTH", "type": "knob", "display": "percent", "min": 0, "max": 100, "default": 70, "resolution": 0 },
        { "id": "click",   "name": "Click",     "shortname": "CLICK", "type": "knob", "display": "percent", "min": 0, "max": 100, "default": 30, "resolution": 0 }
      ]
    }
  ],

  "mapping": [
    { "target": "db_f0",      "expr": "(pitch - 30) / (200 - 30) * 4095" },
    { "target": "db_tone",    "expr": "punch * 0.3 * 40.95" },
    { "target": "db_decay",   "expr": "length * 40.95" },
    { "target": "db_accent",  "expr": "punch * 0.8 * 40.95" },
    { "target": "db_dirty",   "expr": "0" },
    { "target": "db_fm_env",  "expr": "click * 0.6 * 40.95" },
    { "target": "db_fm_dcy",  "expr": "click * 0.4 * 40.95" }
  ],

  "values": {
    "punch": 60,
    "pitch": 60,
    "length": 70,
    "click": 30
  }
}
```

**What the sound designer did:**
- Reduced 7 DSP params to 4 user controls
- Created a "Punch" macro that drives accent (80%) + tone (30%) simultaneously
- Created a "Click" macro that drives FM envelope (60%) + FM decay (40%)
- Locked "Dirtiness" to 0 (not relevant for clean 808 sound)
- Narrowed frequency range to 30–200 Hz (realistic kick range)
- Named everything for musicians, not engineers

**Result:** 4 knobs on one page. Any musician can make a good 808 kick without knowing what "FM Envelope" means.

### 12.4 User Presets (Layer 3)

The user creates presets within the "808 Punch" surface:

```json
{ "name": "Deep House Kick", "surface": "808_punchy", "values": { "punch": 45, "pitch": 52, "length": 80, "click": 15 } }
```

```json
{ "name": "Hard Techno Kick", "surface": "808_punchy", "values": { "punch": 90, "pitch": 70, "length": 40, "click": 85 } }
```

~100 bytes each. The control surface tells the system what these values mean.

---

## 13. The Kit & Preset Architecture

This section addresses the most common end-user workflow: **save the entire plugin state, share it with others, load someone else's setup.** While §5–§8 describe how individual machine controls are defined and mapped (the Control Surface), this section describes how **complete plugin snapshots** are saved, organized, and shared.

### 13.1 Industry Reference: How Hardware Grooveboxes Handle Presets

Seven devices from five manufacturers serve as reference points for how the industry's best solve preset management. Each approaches the problem from a different angle — together they map the full design space.

---

#### Teenage Engineering EP-133 KO II

The EP-133 organizes state into **Projects**:

- 9 project slots (1–5 ship pre-populated, 6–9 empty)
- Each project contains: all sounds (999 sample slots, 128 MB), 4 groups × 99 patterns, scenes, FX settings, fader assignments
- A project = the **complete device state** — switching projects changes everything
- Projects can be backed up, restored, and **shared between units**
- Sample banks can be exported and shared with friends/collaborators
- The commit model: changes are live until you explicitly save ("commit")

**Key insight:** TE's "Project" is their shareable unit. One file = everything. No partial saves.

---

#### Teenage Engineering OP-Z

The OP-Z uses a deeper hierarchy and introduces **per-track presets**:

- **10 Projects** → 16 Patterns per project → 16 Tracks per pattern → 16 Steps per track
- 8 audio tracks (4 drum + 4 synth) + 8 control tracks per pattern
- Each track has **plugs** (sample kits, synth engines, effects) assigned to **slots** (10 slots per track)
- **14 presets per plug** — stored on the white piano keys. Hold track + press key = instant recall. Hold track + press key for 2 seconds = store current params as preset at that position.
- **Randomize preset** — hold track + rec = instant random sound. Great for inspiration.
- **Project Snapshot** — hold project + = store a snapshot of the complete project state. Hold project + − = recall. Only ONE snapshot per project, previous is overwritten.
- **Auto-save by default** — all changes are automatically persisted. Can toggle to manual save mode (hold project + track) — useful when "lending your OP-Z to friends and not risk losing any of your patterns."
- **Content mode** — USB disk for backup/restore/import. Drag-drop sample packs (.aif format, 24 MB max), settings, and project files. Rejected files end up in a 'rejected' folder.
- **Copy operations** — copy pattern, copy settings, copy track, copy entire project to another slot

**Key insights:**
1. **Per-plug presets (14 per plug)** give quick sound variations per track — this is our "Machine Preset" concept. But the primary shareable/saveable unit is still the Project (complete state).
2. **Randomize preset** is a powerful creative tool that costs almost nothing to implement.
3. **Auto-save with manual override** solves the "I accidentally changed something" problem without adding friction for normal use. Their "Perform Kit" equivalent.
4. **Content mode as USB disk** — no proprietary software, no cloud account, just files. Simple and universally accessible.

---

#### Elektron Digitakt II (from OS 1.15A manual)

The Digitakt II has the most mature and granular preset/kit architecture of any device studied. Every design choice is backed by a clear rationale:

**Data hierarchy:**

```
+Drive (20 GB non-volatile storage, shared across all projects)
├── 128 Projects
├── 1024 Kits (named, reusable across projects)
├── 2048 Presets (in 8 banks × 256, available to all projects)
└── Sample Bank (up to 20 GB)

Project (active working state)
├── 128 Patterns (8 banks × 16)
│   ├── Kit (16 presets + levels + comp + master distortion + send FX)
│   ├── Sequencer data (trigs, parameter locks, 16 tracks)
│   └── Settings (BPM, length, swing, time signature)
├── 16 Songs (arrangements of patterns, up to 99 rows each)
└── Pool (128 presets for preset locks, project-local)
```

**What a Kit contains (directly from the Elektron manual):**
- 16 audio or MIDI track presets
- LEVEL settings for the audio tracks and the pattern
- Compressor and Master distortion settings
- Compressor routing and Control All settings
- Send FX settings

**What a Preset contains:**
- A sample (linked from +Drive by hash, not path — so renaming/moving won't break it)
- All track parameter page settings: SRC, FLTR, AMP, FX, and MOD

**The independent-copy principle:** "When a preset or kit is imported to a pattern, it becomes an independent copy of the preset/kit on the +Drive and is not linked to the original preset/kit on the +Drive. Instead, it fully becomes a part of the pattern." This means editing a sound in a pattern does NOT affect the stored preset — and vice versa. This eliminates a whole class of "I changed my preset and broke all my patterns" bugs.

**Preset Browser UX:**
- Open with [FUNC] + turn LEVEL/DATA knob — **one-gesture access**
- **Sort**: Alphabetical or by slot number (toggle)
- **Filter by tags**: Select one or multiple tags to narrow the list — first two tags show on the preset list entry
- **Text search**: Type a name to find presets matching or containing the text — press [FUNC] + [NO] to clear search
- **Live preview**: Press the active track's [TRIG] key to audition the highlighted preset *before* loading it. Press [KEYBOARD] to audition chromatically. **You hear the sound before committing to it.**
- **Bank selection**: 8 banks (A–H), selectable via dedicated keys

**Preset Manager operations:**
- LOAD TO TRACK — import preset to the active track
- SAVE TO HERE — export active track's preset to the selected +Drive slot
- COPY TO BANK — copy preset(s) to another bank
- RENAME — in-place rename
- EDIT TAGS — add/remove any number of tags (first two shown in list)
- DELETE — single or batch
- SELECT ALL / DESELECT ALL — for batch operations
- SELECT UNUSED — selects presets not used in any pattern (cleanup tool)
- TOGGLE (write protection) — padlock symbol, prevents overwrite/rename/delete
- SEND SYSEX — export presets via MIDI SysEx for backup or sharing between devices

**Kit operations (separate from Preset):**
- LOAD TO PATTERN — import a kit to the active pattern
- SAVE (KIT) — save the active pattern's kit to a named +Drive slot
- MANAGE (KIT) — full CRUD with SORT, SEARCH, COPY TO BANK, RENAME, DELETE, WRITE PROTECT, SEND SYSEX
- LOAD TO EMPTY — load a kit to **all empty patterns** in the project (batch setup)
- ADD TO POOL — adds the kit's 16 presets to the project's preset pool

**Preset Locks (per-step preset changes):**
The Pool (128 presets, project-local) enables **Preset Locks** — on any sequencer step, a track's preset can be swapped to a different preset from the Pool. This allows a single track to play different sounds on different beats: "These preset locks are an immensely useful feature for adding variations to a track." Hold a note trig + turn LEVEL/DATA to browse and assign a Pool preset to that step.

**Perform Kit Mode:**
"In PERFORM KIT mode, any changes made to the preset parameters are not auto-saved, and kits are not loaded when you change the pattern; instead, you keep the previous (tweaked) kit." Toggle with [FUNC] + [PRESET/KIT]. A flashing "P" indicates the mode is active. This separates **exploration** from **commitment** — the single most important UX pattern for live performance.
- [PRESET/KIT] + [NO] = reload the current pattern's kit instantly (undo all tweaks)
- [PRESET/KIT] + [YES] = save the modified kit (opens SAVE KIT menu)
- Temporary save/reload still works — `[FUNC] + [YES]` = temp save, `[FUNC] + [NO]` = temp reload

**Parameter page randomization:**
Press [PARAMETER] key + [YES] to randomize all parameters on that page. Press [PARAMETER] + [NO] to reset to last saved state. Per-page, not per-preset — surgical randomization of filter settings without touching amplitude, for example.

**Copy/paste/clear (comprehensive):**
- Copy **pattern** → paste to any slot in any bank
- Copy **track** → paste to another track (in GRID RECORDING mode)
- Copy **track page** → paste to another page
- Copy **parameter page** → paste to another track's same parameter page
- Copy **individual trig** (with all parameter locks) → paste to another step
- Copy **multiple trigs** at once — pasted preserving relative positions
- All operations are **undoable** by repeating the key press

**Key insights:**
1. **Preset Browser with sort, filter, search, and live preview** is the gold standard for preset browsing UX. TBD-16 should implement equivalent functionality in the WebUI.
2. **Independent copy principle** prevents the "I changed X and broke Y" class of bugs. When loading a Kit into the active state, it becomes a copy — edits don't affect the stored Kit.
3. **Preset Locks** (per-step preset changes) are a killer creative feature. For TBD-16, this maps to per-step machine preset changes in a future sequencer.
4. **Perform Kit Mode** with one-key toggle and explicit save/reload is the right separation of concerns for live performance.
5. **Tags on presets** with filter-by-tag in the browser is essential for large preset libraries. Tags are more flexible than folders.
6. **Write protection** prevents accidental overwrites of factory or valuable presets.
7. **SysEx export** for device-to-device sharing is the hardware equivalent of file sharing — for TBD-16, we use `.kit.jsn` files via WebUI or SD card.
8. **LOAD TO EMPTY** (batch-load a kit to all empty patterns) is a smart convenience feature for project setup.
9. **SELECT UNUSED** for cleanup — finding and removing presets/kits not used in any pattern — is essential for storage management on embedded devices.

---

#### Ableton Move / Note

Ableton's hardware devices introduce a **preset-as-bundle** approach with cross-device compatibility:

- Presets are created in **Ableton Live** (desktop DAW) and exported as `.ablpresetbundle` files
- Each bundle is **self-contained** — includes all referenced samples (max 400 MB per preset)
- Strict preset structure required for cross-device compatibility:
  - **Drums:** Instrument Rack → Drum Rack → Drum Samplers on pads + one return chain FX + one insert FX
  - **Synth (Drift):** Instrument Rack → Instrument Rack with mapped macros → Drift + insert effects
- **Live audition while browsing** — on Move, scroll through presets and each is immediately swapped in. Play notes or clips while browsing to audition each preset.
- **Macros mapped in Live are NOT displayed on Move** — Move shows its own simplified control layout. The macro layer from the desktop software and the hardware control surface are decoupled.
- **Loading workflow:** Export `.ablpresetbundle` from Live → drag onto Move Manager's Presets tab → Upload → available on device. For Note (iOS): transfer file via AirDrop/cloud → open in Files → "Open in Ableton Note."
- **Templates provided** — starter templates (Drum Rack Template, Drift Template) downloadable to ensure valid preset structure
- **Experimental feature** (as of Live 12.1) — still evolving, which shows even Ableton considers this a hard problem

**Key insights:**
1. **Self-contained bundles** eliminate the "missing sample" problem. A preset works because it carries everything it needs. For TBD-16, Kit files should reference sample paths (samples are already on the SD card), but a future "Kit Pack" format could bundle Kit + samples for sharing between devices.
2. **Macro decoupling** — "Macros mapped in Live are NOT displayed on Move." This validates our architecture: the Control Surface (what controls are shown) and the Kit (what values are stored) are independent. Move has its own rendering of controls, regardless of how the creator set up macros in Live.
3. **Live audition while browsing** — this is a critical UX feature. When the user scrolls through Kits in the WebUI or on the hardware, each Kit should be loadable instantly for real-time preview. The existing `LoadPreset()` method already works this way.
4. **Cross-device format compatibility** — Ableton enforces a strict structure so that a preset made in Live works on Move AND Note. For TBD-16, the Kit format must be stable and versioned so that Kits shared between users (who may have different firmware versions) remain compatible.

---

#### Roland MC-707 Groovebox

The MC-707 represents Roland's modern approach — **clip-based architecture** with the ZEN-Core engine:

**Data hierarchy:**

```
Project (saved to SD card)
├── 8 Tracks
│   ├── Tone (ZEN-Core synth patch) OR Drum Kit (16 instruments)
│   ├── 16 Clips per track (loopable sequences)
│   └── Track effects (from 90 types) + Track EQ
├── Scenes (combinations of clips across tracks)
└── Master effects (compressor, EQ, reverb, chorus/delay, multi-effect)
```

- **3,000+ Tone presets** and **80 preset Drum Kits** ship pre-loaded — massive factory library
- **ZEN-Core engine** provides both PCM sample playback and virtual analog synthesis — each Tone has subtractive synth controls (filter, amp, envelopes) on top of the source waveform
- Each Drum Kit = 16 individual drum sounds, each independently tunable
- **Clip-based workflow** like Ableton: clips trigger independently, scenes combine clips across tracks
- **SD card storage** for projects — save/load, user samples, custom drum kits
- **Random Tone Generator** (added in firmware 1.60) — generates random synth tones for inspiration
- **Scatter effect** — real-time beat-mangling across 16 pads, inherited from the AIRA line
- **External effects loop** — send/return jacks for external processing per track

**Key insights:**
1. **Massive factory preset library (3,000+ Tones)** ensures users never face a "blank slate." Even if users never create their own sounds, the instrument is fully playable out of the box.
2. **Tone = per-track complete sound patch** — equivalent to our Machine Preset concept. Drum Kit = complete multi-sound configuration — equivalent to our Kit concept.
3. **Random Tone Generator** (firmware update, not day-one feature) shows this is a highly-requested creative tool worth adding even as a later update.
4. **Clip-based architecture** separates musical phrases (clips) from sound design (tones) — same principle as our Kit vs. Pattern separation.
5. **SD card as primary storage** — simple, portable, user-accessible. No proprietary backup software required.

---

#### KORG drumlogue

The drumlogue represents KORG's approach — **64 factory kits with hybrid analog/digital architecture** and an open SDK:

**Architecture:**
- 11 parts: 4 analog (BD, SD, LT, HT) + 6 digital (sample-based) + 1 Multi-Engine (user DSP via SDK)
- **64 preloaded drum kits** spanning multiple genres — immediate out-of-box experience
- **Pattern-based sequencer** with 64-step capability per pattern
- Per-step probability, alternate trigger patterns, micro offsets, per-track groove patterns
- **Chain mode** for live arrangement (chain patterns in sequence)
- **Loop mode** for switching between variations live
- **Motion recording** (parameter automation) and **Accent recording**
- **Randomization function** for instant pattern/sound variation
- **User samples** loaded via USB drag-drop — no proprietary software
- **Custom synth voices** and **custom effects** via the logue SDK — third-party developers can build entire synth engines and effects (up to 24 parameters per effect)
- **Per-part send amounts** for delay and reverb, with multiple return points
- **Dedicated front-panel knobs** for the most important analog parameters — intentionally minimal menu diving for the most common operations

**Key insights:**
1. **Dedicated knobs for critical params + menus for deep editing** — the two-tier UX: instant access for 80% of use cases, menu access for 20%. This maps directly to our Control Surface philosophy (page 1 = most important controls, deeper pages = advanced).
2. **SDK extensibility** — third-party synth engines and effects can be loaded. This is relevant to TBD-16 where new machine types (DSP plugins) are added. The Kit format must gracefully handle unknown machine types.
3. **64 factory kits** — a generous number of curated starting points. Not just 3–5 "demo" presets, but 64 genre-spanning kits. This sets user expectations for what "enough factory content" means.
4. **USB drag-drop for samples** — same philosophy as OP-Z's content mode. No app, no account, just files.

---

#### Akai MPC (MPC One / MPC Key 61 / MPC Live series)

The MPC represents the most **DAW-like workflow** in hardware form, with 30+ years of evolution:

**Data hierarchy:**

```
Project
├── Sequences (up to 128 per project)
│   ├── Tracks (up to 128 per sequence)
│   │   └── Track → references a Program
│   └── Automation lanes
├── Programs (the "preset" concept)
│   ├── Drum Program (128 pads, each: sample + params)
│   ├── Keygroup Program (multi-sample instruments)
│   ├── Plugin Program (virtual instruments — 25 engines)
│   ├── MIDI Program (external MIDI routing)
│   ├── Clip Program (audio clip launcher)
│   └── Audio Program (audio recording track)
└── Sample Pool (all samples used in the project)
```

- **Program = the MPC's "preset" concept** — a complete instrument configuration. Multiple sequences can share the same Program, and changing the Program changes the sound everywhere it's used (linked, not copied — contrast with Digitakt II's independent-copy principle)
- **25 plugin instrument engines** on MPC Key 61 with **6,000+ factory presets** — the largest factory library of any device studied
- **MPC Expansion Packs** — genre-specific downloadable content (sold via thempcstore.com). Each pack includes Programs, Sequences, Samples, and Keygroups — a complete creative starting point
- **Clip Launching** (MPC 2.x firmware) — Ableton-style clip grid added via firmware update, showing evolution of workflow models
- **MPC Software (desktop)** for deeper editing and AU/VST plugin support
- **SATA SSD expansion** for massive sample libraries
- **Stems separation** (MPC Pro Stems) — AI-powered isolation of drum/vocal/melody/bass from any audio

**Key insights:**
1. **Program = linked reference, not independent copy** — the opposite of Elektron's approach. Both are valid: Elektron's independent-copy prevents accidental breakage, MPC's linked-reference enables global updates. TBD-16's Kit approach (independent copy when loaded into active state) follows Elektron's philosophy — safer for embedded devices.
2. **Expansion Packs as a content ecosystem** — Akai sells genre packs that bundle Programs + Sequences + Samples. This is the strongest vision for "content that sounds like music immediately." For TBD-16, the future "Kit Pack" format should aspire to this: Kit + complementary samples + optional patterns.
3. **Multiple Program types** (Drum, Keygroup, Plugin, MIDI, Clip, Audio) — each Program type has its own parameter structure. TBD-16's equivalent is different machine types (db, ds, hh, smp, tbd03, etc.), each with its own parameter set, all stored together in one Kit.
4. **6,000+ presets on MPC Key 61** — demonstrates that modern users expect massive preset libraries, especially for flagship products.

---

#### Polyend Play+ / Tracker

Polyend represents the **indie/creative** approach — smaller company, opinionated workflow:

**Play+ architecture:**
- 16-track sample + synth groovebox
- **6 synth engines** (ACD, FAT, VAP, WTFM, DIRT, PERC) — each with its own preset library
- "Every engine includes an extensive library of professionally crafted presets ready to inspire straight out of the box"
- **Patch Editor** with 9 endless encoders — fast, tactile sound design
- **Pattern-based** sequencer with Song arranger
- **Multi-track USB audio** (14 stereo channels) for DAW integration

**Tracker architecture:**
- **Instruments** — chains of tools (Volume, Tuning, Panning, Filters, Delay/Reverb sends, ADSRs, LFOs, Overdrive) applied to any sample
- **Sample + Instrument = the preset concept** — any sample becomes a playable instrument
- **Wavetable and Granular synthesis** built into the sample engine
- **MOD file import/export** — retro format compatibility for sharing
- **Performance mode** for live mangling of patterns
- **microSD as the entire storage medium** — projects, samples, instruments all on one card

**Key insights:**
1. **Per-engine preset libraries, all professionally crafted** — every synth engine comes with ready-to-play presets. Nobody has to "start from scratch" with any engine. For TBD-16, every machine type should have at least a few factory presets showing its character.
2. **Instrument = sample + processing chain** — Polyend's concept of building an instrument by stacking processing on a sample is similar to how TBD-16's sound processor chains work. The Kit must capture not just "which sample" but the complete processing chain state.
3. **microSD as single point of truth** — no cloud, no sync service, no companion app required. Everything lives on one card. Back up the card, back up everything. This is TBD-16's philosophy too.

---

#### What TBD-16 Should Learn From All Seven

| Lesson | Source(s) | TBD-16 Application |
|--------|-----------|---------------------|
| The shareable unit is a **complete snapshot** — don't ask users to assemble pieces | TE EP-133, TE OP-Z, Akai MPC | Kit = all 388 params, complete plugin state |
| Separate **sound state** from **sequence state** | Elektron Digitakt II, TE OP-Z, Roland MC-707 | Kit (sounds) vs. Pattern (sequence) — independent, mixable |
| Ship with **massive factory content** — the blank slate is hostile | All seven (Digitakt: 2048 slots; Roland: 3,000+ Tones; MPC: 6,000+ presets; KORG: 64 kits) | Factory Kits ship curated and musically useful; target 20+ factory kits |
| **Preset Browser with sort, filter, search, tags, and live preview** | Elektron Digitakt II (the gold standard) | WebUI Kit Browser: sort by name/date, filter by tags, text search, audition on hover/click |
| **Perform/audition mode** = live tweaking without corrupting saved state | Elektron ("Perform Kit"), TE OP-Z ("auto-save toggle"), Ableton Move ("live audition") | Load a Kit to audition; changes aren't saved unless explicitly committed |
| **Independent copy** when loading — edits don't affect stored Kit | Elektron Digitakt II ("becomes part of the pattern") | Loading a Kit copies values into active state; original Kit file is untouched |
| **Per-track/per-plug presets** for quick sound variations | TE OP-Z (14 presets per plug) | Machine Presets for individual channels (§6) |
| **Randomize** at multiple granularities | TE OP-Z (per-plug), Elektron (per-parameter-page), Roland MC-707 (random tone), KORG drumlogue (randomize function) | Randomize per-machine, per-page, or full Kit. Low-cost, high-value creative tool |
| **Self-contained bundles** eliminate "missing file" problems | Ableton Move (.ablpresetbundle), Akai MPC (Expansion Packs) | Kit references sample paths; future Kit Pack bundles Kit + samples for sharing |
| **Macro/control surface decoupling from presets** | Ableton Move (macros from Live not shown on Move) | Control Surface ≠ Kit. They're orthogonal (§13.10) |
| **Simple file-based sharing** — no cloud, no account, just files | TE OP-Z (USB disk), Ableton Move (.ablpresetbundle), Polyend (microSD) | Kit is a `.kit.jsn` file. Share via WebUI upload, SD card, email, Discord |
| **Stable, versioned format for cross-device compat** | Ableton Move/Note/Live | Kit format has `version` field. Older firmware can gracefully handle newer format |
| **Tags + categories** for organization in large libraries | Elektron Digitakt II (tags with filter), Akai MPC (genre packs) | Tag system for Kits: genre, character, author. Filter by tags in browser |
| **Write protection** for factory content and favorites | Elektron Digitakt II (padlock, prevents overwrite/rename/delete) | Factory and Artist Kits are read-only; user Kits are read-write |
| **Copy/paste/duplicate** operations on presets and kits | Elektron Digitakt II (comprehensive), TE OP-Z (copy pattern/track/project) | Duplicate Kit, copy Kit to another slot, paste Kit between preset slots |
| **Batch operations** for project setup | Elektron Digitakt II (LOAD TO EMPTY, SELECT ALL, SELECT UNUSED) | "Load Kit to all empty slots," "Find unused Kits" for cleanup |
| **Expansion Packs** as a content distribution model | Akai MPC (thempcstore.com), Elektron (Sound Packs) | Future: downloadable Kit Packs from website, community marketplace |
| **Dedicated knobs for common params + menus for deep editing** | KORG drumlogue, Roland MC-707 (channel strip) | HW UI: page 1 of Control Surface = dedicated knobs. Deeper pages = encoder-navigated |
| **SDK/plugin extensibility** must be reflected in preset format | KORG drumlogue (logue SDK), Akai MPC (25 plugin engines) | Kit format stores machine type ID per channel; unknown machines degrade gracefully |

### 13.2 The Kit Hierarchy for TBD-16

```
┌─────────────────────────────────────────────────────────────────┐
│  Factory Kits                                                    │
│  Ship with the product. Created by sound designer + firmware     │
│  developer. The default musical experience.                      │
│                                                                   │
│  Examples:                                                       │
│    "PicoSeqRack Default"   — balanced all-purpose drum kit       │
│    "909 Classic"           — Roland 909 recreation               │
│    "Lo-Fi Beats"           — dusty, low-fidelity character       │
├─────────────────────────────────────────────────────────────────┤
│  Artist Kits                                                     │
│  Created by named artists who are friends of the brand.          │
│  Downloadable. Genre-specific. Curated experiences.              │
│                                                                   │
│  Examples:                                                       │
│    "Stimming — Deep Techno"        — dark, minimal              │
│    "JakoJako — UK Bass"            — heavy, dubstep-influenced  │
│    "Barker — Experimental Breaks"  — deconstructed, glitchy     │
│    "Nerk — Ambient Percussion"     — soft, textural             │
├─────────────────────────────────────────────────────────────────┤
│  User Kits                                                       │
│  Created by the end user. Personal configurations.               │
│  Can be shared with friends, posted online, backed up.           │
│                                                                   │
│  Examples:                                                       │
│    "My Live Set 2026"                                            │
│    "Jam Session Feb 15"                                          │
│    "Modded 808 + Stab Kit"                                      │
└─────────────────────────────────────────────────────────────────┘
```

### 13.3 What's Inside a Kit — Complete Specification

A Kit contains **everything needed to reconstruct the complete plugin state**:

| Component | What it includes | Why it's needed |
|-----------|-----------------|-----------------|
| **All DSP parameter values** | 388 raw `{id, current}` pairs | The actual sound — every knob position across every channel, mixer, FX, master |
| **Channel machine assignments** | Which machine type is on each channel (db, ds, hh1, smp, tbd03, etc.) | A Kit can change the synth engine per channel, not just the knob positions |
| **Sample selections** | For Rompler channels: which sample kit/pack, bank, slice | Sample choice is fundamental to the sound — a Kit without it is incomplete |
| **Metadata** | Name, author, description, genre, tags, creation date | For browsing, sharing, and attribution |
| **CV/trig routing** (optional) | Per-param CV input and trigger assignments | Hardware-specific; omitted in shared Kits, included in local saves |

What a Kit does **NOT** contain:

| Excluded | Why |
|----------|-----|
| Control Surface definitions | The Kit stores raw DSP values; it works with any control surface (see §6) |
| Sequencer patterns | Patterns are a separate concern (future: "Song" bundles Pattern + Kit) |
| System settings (WiFi, MIDI channel) | Device-specific, not part of the musical state |
| Sample audio data | Referenced by path/ID, not embedded (too large) |

### 13.4 Kit Storage on SD Card

```
/sdcard/data/
  sp/
    mui-PicoSeqRack.jsn       ← Plugin schema (firmware-generated)
    mp-PicoSeqRack.jsn         ← Active state + saved kit slots (firmware-managed)
  kits/
    factory/
      PicoSeqRack/
        default.kit.jsn        ← Ships with product — the "out of box" experience
        909_classic.kit.jsn    ← Factory recreation  
        lofi_beats.kit.jsn     ← Factory lo-fi kit
    artist/
      PicoSeqRack/
        stimming_deep_techno.kit.jsn
        jakojako_uk_bass.kit.jsn
        barker_exp_breaks.kit.jsn
        nerk_ambient_perc.kit.jsn
    user/
      PicoSeqRack/
        my_live_set.kit.jsn
        jam_feb_15.kit.jsn
```

**Separate from `mp-*.jsn`:** The existing `mp-PicoSeqRack.jsn` file continues to function as it does today — it stores the active preset and numbered preset slots for immediate recall. The `kits/` directory is for **named, portable, shareable Kits** with metadata. The firmware can import a Kit from `kits/` into an `mp` preset slot, or export a preset slot to a Kit file.

### 13.5 The Factory Kit — What Ships With the Product

The Factory Kit defines the **out-of-box musical experience**. This is the most important Kit — it's the first thing every user hears.

**Who creates it:** The sound designer, in collaboration with the firmware developer. The sound designer tunes every parameter for a musically satisfying default. The firmware developer ensures the ranges and conversions support the desired sound.

**What it guarantees:**
- Kick sounds like a kick (not a click or a thud)
- Snare has snap and body
- HiHats are crisp and distinguishable (closed vs. open)
- Mixer levels are balanced — nothing clips, nothing is inaudible
- FX sends are set to tasteful defaults (not drowned in reverb)
- Rompler channels have appropriate sample banks loaded
- The whole thing sounds like a coherent drum kit, not 16 random channels

**How it differs from "Preset 0":** Today, `mp-PicoSeqRack.jsn` ships with `activePatch: 0` and a default preset that has all params at 0 or mid-range. This often sounds terrible — it's mathematically centered, not musically tuned. The Factory Kit replaces this with a curated musical default.

### 13.6 Artist Kits — The Shareable Experience

Artist Kits are created by musicians who are **friends of the brand** — professionals who use TBD-16 in their own productions and performances. They create genre-specific configurations that showcase the instrument's capabilities.

| Artist | Genre | Kit name | Character |
|--------|-------|----------|-----------|
| **Stimming** | Deep Techno | "Deep Techno" | Dark, punchy kick. Tight snare. Closed hats. Long reverb. Minimal FX. |
| **JakoJako** | UK Bass | "UK Bass" | Heavy sub kick. Snappy snare. Metallic hats. Delay throws. Aggressive compression. |
| **Barker** | Experimental | "Experimental Breaks" | Detuned kick. Noise snare. FM percussion. Glitchy FX. Extreme parameter ranges. |
| **Nerk** | Ambient | "Ambient Percussion" | Soft kick. Brush snare. Shimmer hats. Massive reverb tail. Subtle modulation. |

**Distribution:** Artist Kits ship as `.kit.jsn` files (~20–40 KB). They can be:
- Pre-installed on the SD card at purchase
- Downloaded from the TBD-16 website
- Shared on social media, Discord, forums
- Uploaded to the device via the WebUI's Kit Manager

**The sharing prerequisite:** For an Artist Kit to sound as intended, the recipient must have:
1. The same plugin (PicoSeqRack) — guaranteed if they have the same firmware
2. The same or compatible sample kits (if the Kit uses Rompler channels) — the Kit references sample paths; if the samples aren't present, those channels will be silent or use fallbacks

The Kit does NOT require the same control surface. Barker might create his Kit using a custom macro surface with exotic control mappings, but the user loads the Kit and sees it through whatever surface they prefer. The raw DSP values are what matter.

### 13.7 User Kits — End User Workflow

The end user's interaction with Kits should be as simple as:

**Save:**
1. User tweaks all channels until happy with the sound
2. Presses "Save Kit" in the WebUI (or long-press a hardware button)
3. Enters a name → Kit is saved to `/sdcard/data/kits/user/PicoSeqRack/`

**Load:**
1. User opens the Kit Manager in the WebUI
2. Browses Factory / Artist / User kits
3. Taps a Kit → all 388 params are loaded, channel machines switch, samples load
4. The entire plugin state is now Stimming's Deep Techno (or whatever was selected)

**Share:**
1. User opens Kit Manager → selects their Kit → "Export"
2. Browser downloads a `.kit.jsn` file
3. User sends the file to a friend (email, Discord, AirDrop, etc.)
4. Friend opens Kit Manager → "Import" → uploads the file → done

**Perform Kit mode (inspired by Elektron):**
When the user loads a Kit, they can tweak parameters freely. The changes are live (the DSP updates in real-time) but the saved Kit is NOT modified. To save changes, the user explicitly saves. This prevents accidental destruction of curated presets — especially important for Artist Kits and Factory Kits, which are read-only by default.

### 13.8 Kit vs. Pattern vs. Song

The Kit architecture intentionally excludes sequencer data. Here's why and what comes next:

| Concept | Contains | Scope | Shareable? |
|---------|----------|-------|-----------|
| **Kit** | All sound parameters + machine assignments + sample selections | Complete plugin sound state | Yes — the primary shareable unit |
| **Pattern** (future) | Step sequencer data, note events, parameter locks per step | Performance/arrangement data | Yes — separately from Kit |
| **Song** (future) | Kit reference + Pattern chain + tempo | Complete musical piece | Yes — bundles Kit + Patterns into one package |

The current PicoSeqRack has an internal step sequencer. Its state (which steps are on, which sounds trigger on which beats) is a **Pattern** concern, not a Kit concern. Separating them means:
- You can load Stimming's Kit but play your own pattern
- You can keep your Kit but load Barker's drum pattern
- A Song bundles both for "play my exact track configuration"

This mirrors the Elektron Digitakt II model: Kit = sounds, Pattern = sequence, Song = arrangement.

### 13.9 Kit API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v2/kits/:plugin` | GET | List all available Kits (factory + artist + user) for a plugin |
| `/api/v2/kits/:plugin/:id` | GET | Download a specific Kit file |
| `/api/v2/kits/:plugin` | POST | Upload/import a Kit file (saved to user directory) |
| `/api/v2/kits/:plugin/:id` | DELETE | Delete a user Kit (factory/artist are read-only) |
| `/api/v2/kits/:plugin/active` | GET | Export the current live state as a Kit |
| `/api/v2/kits/:plugin/active` | PUT | Load a Kit into the live state (sets all params, switches machines) |

**Relationship to existing API:**
- `GET /api/v1/getPresetData/:plugin` returns the full `mp-*.jsn` file — this is an export of all preset slots at once. The Kit API is more granular: one Kit = one snapshot.
- `POST /api/v1/setPresetData/:plugin` replaces the entire `mp-*.jsn` file. The Kit API is additive: import a Kit without destroying existing presets.
- The v1 API continues to work for backward compatibility and for "raw mode" preset management.

### 13.10 Relationship Between Control Surfaces and Kits

These are **two independent dimensions** of the user experience:

```
                    ┌──────────────────────────────────────────┐
                    │          Control Surface                  │
                    │     (what the controls look like)         │
                    │                                          │
                    │  "Factory Default"  │  "808 Punchy"      │
                    │  7 params, 2 pages  │  4 params, 1 page  │
              ┌─────┼──────────────────────┼───────────────────┤
              │     │                      │                    │
  Kit         │ A   │  7 knobs at          │  4 knobs at        │
  (what the   │     │  their positions     │  their positions   │
  values are) │     │                      │                    │
              ├─────┼──────────────────────┼───────────────────┤
              │     │                      │                    │
              │ B   │  Same 7 knobs,       │  Same 4 knobs,     │
              │     │  different positions │  different positions│
              │     │                      │                    │
              └─────┴──────────────────────┴───────────────────┘
```

- **Switching Kits** changes the sound immediately (all raw params update). The control surface stays. Knob positions in the UI update to reflect the new values.
- **Switching Control Surfaces** changes the control layout (names, ranges, macros, pages). The sound stays. The knobs rearrange but continue to show the current DSP state.
- You can combine any Kit with any compatible Control Surface. They're orthogonal.

**When sharing a complete experience:** A sound designer can bundle a Control Surface + Kit as a "Patch" (see §6, Combined Mode). This is what the developer's prototype produces. The recipient gets both the control layout AND the sound values in one file. But they can be consumed separately too.

---

## 14. What This Replaces

### From the Previous Version of This Document

| Previous concept | New concept | Why |
|-----------------|-------------|-----|
| `tbd-display.json` (WebUI-only overlay) | Control surface JSONs (shared across all UIs) | Single source of truth, not WebUI-specific |
| Per-param conv formulas extracted from C++ | Output mapping expressions in control surface | Sound designers write them, not firmware devs |
| 27 display types assigned to raw params | Same display types, but assigned to user-facing controls | The display type describes what the *user* sees, not what the DSP param *is* |
| Wildcard patterns matching param IDs | Machine-targeted surfaces that resolve channel at load time | Cleaner, no regex matching at render time |

### From WEBUI-HARDWARE-UI-SYNTHESIS.md

| Previous concept | New concept |
|-----------------|-------------|
| §5 Parameter Descriptor Table (PDT) per-plugin | Control surface definition per-machine |
| §9 Layer 2 "Parameter Descriptor Table" + Layer 3 "Macros (Future)" | Merged into one: the output mapping in the control surface |
| Appendix A: conv expressions for raw params | Replaced by mapping expressions in control surface |

### From WEBUI-SYNTHESIS.md

| Previous concept | New concept |
|-----------------|-------------|
| §3 "Two modes: Raw mode + Preset/Macro mode" | Still two modes, but now the preset/macro mode has a concrete format |
| "Output mapping — formulas like BD Decay = 10+(Cutoff×50)" | Formalized as the `mapping` array in the control surface JSON |

### What Stays Valid

- Everything about the existing `mui-*.jsn` / `mp-*.jsn` format (Layer 1)
- The v1 REST API (backward compatible, raw mode)
- webaudio-controls + Shoelace stack decisions
- 4-knob-per-page as the design primitive
- Webserver on/off connection management
- PicoSeqRack channel/machine architecture

---

## 15. Implementation Path

### Phase 1: Define the Format (Now)

- Finalize the control surface JSON schema (this document)
- Write factory control surfaces for 2–3 machines (db, mixer, master) as concrete test cases
- Validate that the format covers the developer's prototype use cases

### Phase 2: WebUI Control Surface Renderer (First)

- Build a "control surface mode" in the WebUI that:
  1. Loads a control surface JSON
  2. Renders pages → 4-knob rows
  3. Evaluates output mapping on knob change
  4. Sends raw param values via `setPluginParam` (v1 API) or batch POST (v2)
- Keep "raw mode" (current schema-driven renderer) as a toggle
- This works without any firmware changes

### Phase 3: Batch Param Endpoint (Firmware, Small)

- Add `POST /api/v2/params/:ch` to `RestServer.cpp`
- Wire to existing `SetChannelParamsFromCStrJSON` method
- WebUI switches from per-param GETs to batch POST

### Phase 4: Surface File Management API (Firmware, Small)

- Add `GET/POST/DELETE /api/v2/surfaces` endpoints
- Simple: list files in `/sdcard/data/surfaces/`, read file, write file, delete file
- WebUI can upload/download/manage surfaces

### Phase 5: RP2350 Integration (Firmware, Medium)

- RP2350 loads control surface JSON from SD card (via SPI read from ESP32)
- Or: RP2350 receives a binary representation of the control surface
- RP2350 renders pages on OLED, maps knob changes through the expression evaluator
- This makes hardware UI and WebUI behavior identical

### Phase 6: Patch Editor in WebUI (Feature)

- Visual editor for creating/editing control surfaces
- Drag controls onto pages, set ranges, define mappings
- Test with live DSP feedback
- Export as `.jsn` file

### Phase 7: Extend Plugin C++ to Emit Physical Ranges (Firmware, Additive)

- Add `physMin`, `physMax`, `scale`, `unit` to `knowYourself()` schema output
- Control surface authors can now query the DSP parameter's real range
- Factory control surfaces auto-validate against plugin metadata

### Phase 8: Kit File Management API (Firmware, Small)

- Add `GET/POST/DELETE /api/v2/kits/:plugin` endpoints to `RestServer.cpp`
- List Kits from `/sdcard/data/kits/{factory,artist,user}/:plugin/`
- Read, write, delete individual Kit files
- `GET /api/v2/kits/:plugin/active` exports current live state as a Kit (with metadata prompt)
- `PUT /api/v2/kits/:plugin/active` loads a Kit file into the live state (bulk param set + machine switch)
- Build on existing `GetCStrJSONAllPresetData()` / `SetActivePluginParameters()` methods

### Phase 9: Kit Manager UI in WebUI (Feature)

- Kit browser panel: three sections (Factory / Artist / User)
- Tap to preview Kit metadata (name, author, genre, description)
- Tap to load → all params update, machines switch, samples load
- Save current state as new User Kit (name + optional metadata)
- Import Kit from file upload; export Kit as `.kit.jsn` download
- Delete user Kits (factory/artist are read-only, visually distinguished)

### Phase 10: Factory & Artist Kit Curation (Content)

- Sound designer creates the Factory Default Kit for PicoSeqRack
  - Tune every channel for a musically satisfying out-of-box experience
  - Document the chosen machine per channel, sample selections, mixer balance
- Commission Artist Kits from brand artists (Stimming, JakoJako, Barker, Nerk)
  - Each artist receives a TBD-16, creates 1–3 genre-specific Kits
  - Kits are reviewed, metadata standardized, shipped on SD card or via download
- Artist Kit `.kit.jsn` files are placed in `/sdcard/data/kits/artist/PicoSeqRack/`

### Phase 11: Song Bundles (Future)

- Define "Song" format: Kit reference + Pattern data + tempo in one file
- Song = complete musical snapshot (sound + sequence + arrangement)
- Enables "load this and press play" workflows
- Requires Pattern export/import to be implemented first

---

## Appendix A: Comparison of Approaches

| Aspect | tbd-display.json (v1, abandoned) | Control Surface (v2, current) |
|--------|----------------------------------|-------------------------------|
| Who creates it? | WebUI developer | Plugin dev (factory) + Sound designer (custom) |
| Where does it live? | WebUI bundle | SD card (portable, editable) |
| What does it describe? | Display formatting for raw params | Full control experience: what the user sees and how it maps to DSP |
| Supports macros? | No | Yes (output mapping expressions) |
| Works on hardware UI? | No | Yes (same file) |
| Shareable? | No (developer artifact) | Yes (~1 KB JSON files) |
| Requires C++ knowledge? | Yes (extract conv formulas) | No (sound designer works with physical units) |
| Can restrict parameter ranges? | No (always 0–4095) | Yes (min/max in physical units) |
| Number of files | 1 for all plugins | 1 per machine variant (but small and self-contained) |

## Appendix B: Document Cross-Reference

| Document | What it covers | Status |
|----------|---------------|--------|
| [SAMPLE-MANAGER-RESEARCH.md](SAMPLE-MANAGER-RESEARCH.md) | Sample management research, device architecture, webserver deep dive | Foundation |
| [UNIFIED-WEBUI-ARCHITECTURE.md](UNIFIED-WEBUI-ARCHITECTURE.md) | Original WebUI architecture, component library, state management, file structure | Foundation (partially superseded) |
| [WEBUI-SYNTHESIS.md](WEBUI-SYNTHESIS.md) | PicoSeqRack analysis, preset editor concept, revised constraints, application layout | Foundation |
| [WEBUI-HARDWARE-UI-SYNTHESIS.md](WEBUI-HARDWARE-UI-SYNTHESIS.md) | Hardware UI analysis, RP2350 firmware, 4-knob row, webaudio-controls, Shoelace | Foundation (§5 + Appendix A superseded by this doc) |
| **This document** | Control surface architecture, kit & preset architecture, mapping system, unit types, implementation path | Current |
