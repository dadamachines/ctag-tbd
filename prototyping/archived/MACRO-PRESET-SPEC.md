# TBD-16 — Macro & Preset System Spec

> **Status:** Actionable specification for the macro device, sound preset, and kit system.  
> **Reference:** [Engineer's prototype](https://tbd-pico-seq-simulator.vercel.app/preseteditor.html)  
> **Replaces:** WEBUI-UNIFIED-FORMAT-AND-TYPES.md, WEBUI-HARDWARE-UI-SYNTHESIS.md §5/§9, WEBUI-SYNTHESIS.md §3  
> **Date:** February 2026

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [The Three Data Objects](#2-the-three-data-objects)
3. [Macro Device Format](#3-macro-device-format)
4. [Sound Preset Format](#4-sound-preset-format)
5. [Kit Format](#5-kit-format)
6. [Channel Binding & Machine IDs](#6-channel-binding--machine-ids)
7. [Display Types](#7-display-types)
8. [Data Flows](#8-data-flows)
9. [User Stories & Personas](#9-user-stories--personas)
10. [API Specification](#10-api-specification)
11. [SD Card Layout](#11-sd-card-layout)
12. [Open Questions & Decisions](#12-open-questions--decisions)
13. [Implementation Order](#13-implementation-order)

---

## 1. Architecture Overview

Two processors, three data objects.

```
┌─────────────────────────────────────────────────────────────┐
│  PICO (RP2350)                                              │
│                                                             │
│  ┌─────────────────────────────┐                            │
│  │ Sound Preset                │  ← What the user saves     │
│  │  • macro_id: "db-1234"     │     (~100 bytes)            │
│  │  • values: [50, 70, 30, …] │                             │
│  └─────────────────────────────┘                            │
│                                                             │
│  ┌─────────────────────────────────────┐                    │
│  │ Macro Device Info (snapshot from P4)│  ← Cached locally  │
│  │  • id, name, metadata              │     for offline use │
│  │  • macro parameter definitions     │                     │
│  └─────────────────────────────────────┘                    │
│                                                             │
└──────────────────────────┬──────────────────────────────────┘
                           │ SPI
┌──────────────────────────▼──────────────────────────────────┐
│  P4 (ESP32-P4)                                              │
│                                                             │
│  ┌───────────────────────────────────────────────────┐      │
│  │ Macro Device Implementation                       │      │
│  │  • id, name, metadata                             │      │
│  │  • macro parameter definitions (pages of 4)       │      │
│  │  • synth_id: "db"  ────────────────┐              │      │
│  │  • mapping: macro → synth params   │              │      │
│  └────────────────────────────────────┼──────────────┘      │
│                                       ▼                     │
│              ┌─────────────────────────────┐                │
│              │ Synth Device                │                │
│              │  • id: "db"                 │                │
│              │  • synth params (0–4095)    │                │
│              │    ch1_db_f0, ch1_db_decay… │                │
│              └─────────────────────────────┘                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Key principles:**
- The Pico never talks directly to the synth. It talks to the macro device, which maps macro values to synth parameters. The WebUI does the same.
- The P4 DSP only receives raw 0–4095 values. It never knows about macros.
- Both RP2350 and browser evaluate macros→raw independently. The P4 is unchanged.

```
┌─────────────┐     raw params      ┌───────────────┐
│  RP2350     │────────────────────→ │   ESP32-P4    │
│  evaluates  │   SPI                │   (DSP)       │
│  mapping    │                     │  just receives │
└─────────────┘                     │  raw 0–4095    │
                                    └───────────────┘
┌─────────────┐     raw params            ↑
│  Browser    │───────────────────────────→│
│  evaluates  │   HTTP API
│  mapping    │
└─────────────┘
```

---

## 2. The Three Data Objects

| Object | Scope | Size | Who creates it | Analogy |
|--------|-------|------|----------------|---------|
| **Macro Device** | One machine type (e.g., Digital Bass Drum) | ~1 KB | Plugin dev (factory), Sound designer (custom) | Elektron "control surface" |
| **Sound Preset** | Values for one macro device on one channel | ~100 B | End user, Sound designer | Elektron "Sound" |
| **Kit** | ALL 388 raw params + machine assignments + sample selections | ~20–40 KB | End user, Artist | Elektron "Kit", TE "Project" |

**Macro Device ≠ Sound Preset.** The macro device defines the *shape* of controls (what knobs exist, how they map). The sound preset is just *saved values* for those knobs. One macro device → many sound presets.

**Kit ≠ Sound Preset.** The Kit captures the entire plugin state (all 16 channels). The sound preset captures one channel's macro values. You share Kits (complete sounds); you switch sound presets within a session.

---

## 3. Macro Device Format

Uses the prototype's proven format directly:

```json
{
  "id": "db-1234",
  "name": "808 Punchy Kick",
  "machine": "db",
  "groups": [
    {
      "name": "Sound",
      "parameters": [
        { "idx": 0, "name": "Punch",  "def": 60, "min": 0,  "max": 100, "res": 100, "ui": "percent" },
        { "idx": 1, "name": "Pitch",  "def": 60, "min": 30, "max": 200, "res": 170, "ui": "freq" },
        { "idx": 2, "name": "Length", "def": 70, "min": 0,  "max": 100, "res": 100, "ui": "percent" },
        { "idx": 3, "name": "Click",  "def": 30, "min": 0,  "max": 100, "res": 100, "ui": "percent" }
      ]
    },
    {
      "name": "Filter",
      "parameters": [
        { "idx": 4, "name": "Cutoff", "def": 80, "min": 0,  "max": 127, "res": 127, "ui": "percent" },
        { "idx": 5, "name": "Type",   "def": 0,  "min": 0,  "max": 3,   "res": 3,   "ui": "select:LP,HP,BP,Notch" },
        { "idx": 6, "name": "Dirty",  "def": 0,  "min": 0,  "max": 1,   "res": 1,   "ui": "toggle" }
      ]
    }
  ],
  "mapping": [
    { "tgt": "db_f0",      "start": 0, "add": [{ "src": 1, "amt": 24 }] },
    { "tgt": "db_tone",    "start": 0, "add": [{ "src": 0, "amt": 12 }] },
    { "tgt": "db_decay",   "start": 0, "add": [{ "src": 2, "amt": 41 }] },
    { "tgt": "db_accent",  "start": 0, "add": [{ "src": 0, "amt": 33 }] },
    { "tgt": "db_dirty",   "start": 0, "add": [{ "src": 6, "amt": 4095 }] },
    { "tgt": "db_fm_env",  "start": 0, "add": [{ "src": 3, "amt": 25 }] },
    { "tgt": "db_fm_dcy",  "start": 0, "add": [{ "src": 3, "amt": 16 }] }
  ]
}
```

### Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique ID. Referenced by sound presets. |
| `name` | Yes | Human-readable name. |
| `machine` | Yes | Target synth machine ID (see §6). |
| `groups` | Yes | Array of parameter pages. Each group = one OLED page = up to 4 knobs. |

**Per parameter:**

| Field | Required | Description |
|-------|----------|-------------|
| `idx` | Yes | Global index across all groups. Used by `mapping[].add[].src`. |
| `name` | Yes | Display name. Also used as `shortname` on OLED (truncated to 6 chars). |
| `def` | Yes | Default value (used when no preset loaded, or preset value is `-1`). |
| `min` / `max` | Yes | User-facing range in meaningful units (not raw 0–4095). |
| `res` | Yes | Resolution (number of discrete steps). `0` = continuous. |
| `ui` | Yes | Display/widget type (see §7). |

**Per mapping entry:**

| Field | Required | Description |
|-------|----------|-------------|
| `tgt` | Yes | Target synth parameter name, **without channel prefix** (see §6). |
| `start` | Yes | Constant offset (base value). |
| `add` | No | Array of `{ "src": paramIdx, "amt": multiplier }`. Omit if target is a constant. |

**Mapping formula:**
```
target_value = start + Σ(macro_values[src] × amt)
```

This is deliberately simple — integer multiply + add. No expression parser needed. Runs on RP2350, in JS, or on P4.

**Mapping capabilities:**
- **One-to-one:** One macro knob → one synth param (simple scaling)
- **Many-to-one:** Multiple macro knobs → one synth param (macro combination)
- **One-to-many:** One macro knob appears in multiple mapping entries → drives multiple synth params
- **Constant lock:** `"start": 0` with no `"add"` → synth param locked to a fixed value

### Empty Slots

Pages always have 4 parameter slots for hardware consistency. If a page has <4 params, unused slots have `"name": ""` and are rendered as blanks on OLED / dimmed placeholders in WebUI.

---

## 4. Sound Preset Format

Saved values for one macro device. Tiny (~100 bytes).

```json
{
  "name": "Deep House Kick",
  "group": "Kicks",
  "macro": "db-1234",
  "values": [60, 52, 80, 15, -1, -1, -1]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | User-visible preset name. |
| `group` | No | Category for organizing (e.g., "Kicks", "Techno"). |
| `macro` | Yes | ID of the macro device this preset belongs to. |
| `values` | Yes | Array indexed by global `idx`. `-1` = use the macro device's `def` value. |

---

## 5. Kit Format

Complete plugin snapshot — all 388 raw synth params. This is the **primary shareable unit**.

```json
{
  "format": "tbd16-kit",
  "version": 1,
  "plugin": "PicoSeqRack",
  "name": "Deep Techno Kit",
  "author": "Stimming",
  "description": "Dark minimal techno. Punchy 909 kick, tight snare, closed hats.",
  "genre": "Techno",
  "tags": ["techno", "minimal", "dark"],
  "created": "2026-03-15",
  "channels": {
    "ch1":  { "machine": "db",   "patchName": "909 Kick" },
    "ch2":  { "machine": "ds",   "patchName": "Tight Snare" },
    "ch3":  { "machine": "hh1",  "patchName": "Closed Hat" },
    "ch7":  { "machine": "smp",  "patchName": "Perc Loop", "sampleKit": "drums/808_kit", "bank": 0, "slice": 3 },
    "ch9":  { "machine": "tbd03","patchName": "Acid Bass" }
  },
  "params": [
    { "id": "ch1_db_f0",       "current": 1200 },
    { "id": "ch1_db_decay",    "current": 2800 },
    { "id": "ch1_vol",         "current": 3200 },
    { "id": "ch1_pan",         "current": 2048 },
    { "id": "ch1_send1",       "current": 0 },
    { "id": "ch1_send2",       "current": 1024 },
    { "id": "fx1_delay_time",  "current": 1500 },
    { "id": "fx2_reverb_size", "current": 3400 },
    { "id": "c_master_vol",    "current": 3800 }
  ]
}
```

### What a Kit contains

| Component | Description |
|-----------|-------------|
| **All DSP param values** | 388 raw `{id, current}` pairs — every knob across all channels, mixer, FX, master |
| **Channel machine assignments** | Which machine type is on each channel |
| **Sample selections** | For Rompler channels: sample kit path, bank, slice |
| **Metadata** | name, author, description, genre, tags, created date |
| **CV/trig routing** (optional) | Per-param CV/trig assignments — omitted in shared Kits, included in local saves |

### What a Kit does NOT contain

| Excluded | Why |
|----------|-----|
| Macro device definitions | Kit stores raw DSP values — works with any macro device |
| Sequencer patterns | Patterns are a future separate concern (Kit = sounds, Pattern = sequence) |
| System settings | WiFi, MIDI channel, etc. are device-specific |
| Sample audio data | Referenced by path/ID, not embedded |

### Why raw values (not macro values)?

1. **Independence.** Kit works regardless of which macro device is active.
2. **Instant recall.** No mapping re-evaluation needed — raw values go straight to DSP.
3. **Round-trip fidelity.** No rounding errors from macro→raw→macro conversion.
4. **Backward compatible.** This is exactly what `mp-*.jsn` already stores.

### Relationship to existing codebase

| Existing concept | Kit concept | Change needed |
|-----------------|-------------|---------------|
| `mp-PicoSeqRack.jsn` → `patches[n]` | One Kit | Already stores all params as flat array |
| `patches[n].params` | `kit.params` | Same `{id, current}` format |
| `GetCStrJSONAllPresetData()` | Export Kit | Already exports the full mp file |
| `SetActivePluginParameters()` | Import Kit | Already imports a complete param set |
| `LoadPreset(n)` / `SavePreset(name, n)` | Load/Save Kit | Same operation |
| (missing) | `kit.channels` | New: record machine assignments per channel |
| (missing) | `kit.author`, `kit.genre`, etc. | New: metadata for sharing |

---

## 6. Channel Binding & Machine IDs

### How channel binding works

A macro device targets a **machine type**, not a specific channel. The `mapping[].tgt` uses **machine-local names** (no channel prefix):

```json
{ "tgt": "db_f0", "start": 0, "add": [{ "src": 1, "amt": 24 }] }
```

When this macro device is loaded on channel 3, the system resolves `db_f0` → `ch3_db_f0`. On channel 1, it resolves to `ch1_db_f0`. **One macro device definition works on any channel running that machine.**

### Machine ID table

| Machine ID | Description | mui group pattern | Example synth params |
|------------|-------------|-------------------|---------------------|
| `db` | Digital Bass Drum | `ch*_db_*` | `db_f0`, `db_decay`, `db_tone`, `db_dirty` |
| `ab` | Analogue Bass Drum | `ch*_ab_*` | `ab_f0`, `ab_decay` |
| `ds` | Digital Snare | `ch*_ds_*` | `ds_f0`, `ds_tone` |
| `as` | Analogue Snare | `ch*_as_*` | `as_f0`, `as_tone` |
| `hh1` | HiHat 1 | `ch*_hh1_*` | `hh1_f0`, `hh1_decay` |
| `hh2` | HiHat 2 | `ch*_hh2_*` | `hh2_f0`, `hh2_decay` |
| `fmb` | FM Bass Drum | `ch*_fmb*_*` | `fmb_f0`, `fmb_ratio` |
| `rs` | Rimshot | `ch*_rs_*` | `rs_f0`, `rs_decay` |
| `cl` | Clap | `ch*_cl_*` | `cl_f0`, `cl_decay` |
| `smp` | Rompler (sampler) | `ch*_smp_*` | `smp_bank`, `smp_slice`, `smp_tune` |
| `tbd03` | TBD03 Bass Synth | `ch*_tbd03_*` | `tbd03_cutoff`, `tbd03_reso` |
| `mo` | Macro Oscillator | `ch*_mo_*` | `mo_timbre`, `mo_morph` |
| `wtosc` | WT Oscillator | `ch*_wtosc_*` | `wtosc_pos`, `wtosc_detune` |
| `pp` | PolyPad | `ch*_pp_*` | `pp_chord`, `pp_voicing` |
| `mixer` | Channel mixer strip | `ch*_*` (vol, pan, send) | `vol`, `pan`, `send1`, `send2`, `mute` |
| `fx_delay` | FX1 Delay | `fx1_*` | `fx1_time`, `fx1_fb`, `fx1_mix` |
| `fx_reverb` | FX2 Reverb | `fx2_*` | `fx2_size`, `fx2_damp`, `fx2_mix` |
| `master` | Master bus | `c_*` + `sum_*` | `c_atk`, `c_rel`, `c_threshold` |

### Per-channel macro device selection

Each channel has an **active macro device**. This association is stored as part of the device state:

```json
{
  "ch1_macro": "factory/db_default",
  "ch2_macro": "factory/ds_default",
  "ch9_macro": "user/my_acid_bass"
}
```

- On boot, if no macro device is assigned, the system loads the factory default for that channel's machine type.
- Changing the macro device changes the control layout but does NOT change the sound (raw DSP params are untouched).
- Changing the machine (e.g., switching channel 1 from `db` to `ab`) invalidates the macro device — the system loads the factory default for the new machine.

---

## 7. Display Types

The `ui` field on each macro parameter tells the UI how to render the value.

### Control types (widget selection)

| `ui` value | Widget (WebUI) | Widget (OLED) | Value display |
|------------|----------------|---------------|---------------|
| `""` (empty) | Knob | Encoder | Raw number: `50` |
| `"percent"` | Knob | Encoder | `75%` |
| `"freq"` | Knob (log) | Encoder | `440 Hz`, `1.2 kHz` (auto-switch at 1000) |
| `"time_ms"` | Knob (log) | Encoder | `120 ms`, `2.5 s` (auto-switch at 1000) |
| `"db"` | Knob | Encoder | `-12 dB`, `+3 dB` (always show sign) |
| `"pan"` | Knob (center-detent) | Encoder | `L50`, `C`, `R47` |
| `"ratio"` | Knob | Encoder | `4.0:1`, `∞:1` (infinity at max) |
| `"semitones"` | Knob | Encoder | `-12 st`, `+7 st` |
| `"toggle"` | Switch | Push-toggle | `ON` / `OFF` |
| `"select:LP,HP,BP"` | Dropdown / radio group | Encoder-step | Named options from the colon-separated list |

### Format rules

| Rule | Behavior |
|------|----------|
| `freq`: auto Hz↔kHz | values ≥ 1000 display as kHz |
| `time_ms`: auto ms↔s | values ≥ 1000 display as s |
| `pan`: L/C/R notation | < center → `L50`, center → `C`, > center → `R47` |
| `db`: always signed | `+3.0 dB`, `-12.5 dB`, `0.0 dB` |
| `ratio`: infinity at max | ratio > 100 → `∞:1` |

The `ui` field is a **display hint**, not a data type. The underlying value is always a number within `min`–`max`. New types can be added without breaking existing macro devices.

---

## 8. Data Flows

### User turns a macro knob (hardware or WebUI)

```
User turns "Punch" (macro param idx 0, range 0–100, value → 72)
  → Evaluate mapping for all targets that reference src 0:
      db_tone   = 0 + (72 × 12) = 864
      db_accent = 0 + (72 × 33) = 2376
  → Resolve channel: ch1_db_tone = 864, ch1_db_accent = 2376
  → Send raw values to P4 DSP (SPI from Pico, HTTP from browser)
  → P4 applies values directly — no macro awareness needed
```

### Load a sound preset

```
User selects "Deep House Kick" preset for ch1
  → Load values: [60, 52, 80, 15, -1, -1, -1]
  → Apply to macro params (Punch=60, Pitch=52, Length=80, Click=15, rest=defaults)
  → Re-evaluate ALL mapping entries → batch-update all synth params
  → UI knobs animate to new positions
```

### Load a Kit

```
User selects "Stimming Deep Techno" kit
  → Load ALL raw synth params directly (bypass macro layer entirely)
  → For each channel: if machine type changed, switch machine
  → For rompler channels: load sample kit/bank/slice
  → UI updates: macro knob positions are reverse-calculated for display
```

### Reverse-mapping (Kit → macro display)

When a Kit is loaded, the UI needs to show where the macro knobs are. For simple one-to-one mappings, this is trivial:

```
macro_value = (raw_synth_value - start) / amt
```

For many-to-one macros (multiple sources → one target), exact reverse mapping is impossible. The UI shows `"--"` or the last-known macro value. This is a **display concern only** — the sound is correct regardless.

### Switch macro device (same sound, different controls)

```
User switches ch1 macro from "factory/db_default" (7 params) to "user/808_punchy" (4 params)
  → Sound: unchanged (raw DSP params are untouched)
  → UI: re-renders with the new macro layout (4 knobs instead of 7)
  → Knob positions: reverse-calculated from current raw DSP values
```

---

## 9. User Stories & Personas

### End User

| Story | How it works |
|-------|-------------|
| **"I want to tweak a kick sound"** | See 4 meaningful knobs (Punch, Pitch, Length, Click) instead of 8 raw params |
| **"I want to save my settings"** | Save as sound preset (~100 B) or as part of a Kit (~20 KB) |
| **"I want to load Stimming's kit"** | Open Kit browser → tap Kit → all 388 params load instantly |
| **"I want to share my setup"** | Export Kit as `.kit.jsn` → send via email/Discord/AirDrop |
| **"I want the same controls on hardware and browser"** | Both read the same macro device JSON → identical page layout |
| **"I tweak a loaded Kit but don't want to lose the original"** | Kits are loaded as independent copies. Edits are live but not saved until you explicitly save. |

### Sound Designer (no C++ knowledge)

| Story | How it works |
|-------|-------------|
| **"I want to create a simplified kick control"** | Create macro device JSON: 4 knobs, output mapping to 8 DSP params |
| **"I want one knob to drive multiple params"** | Use `"add"` array with multiple src references in a single mapping entry |
| **"I want to lock a param to a fixed value"** | Mapping entry with `"start": 0`, no `"add"` array |
| **"I want to restrict frequency range for musical results"** | Set `"min": 30, "max": 200` instead of full 0–4095 range |
| **"I want to share my macro device"** | Export as `.jsn` (~1 KB) → others drop it in `/macros/user/` or upload via WebUI |
| **"I want to create 20 preset variations"** | Create 20 sound presets, all referencing the same macro device ID |

### Plugin Developer

| Story | How it works |
|-------|-------------|
| **"I ship a new synth engine"** | Write DSP code + `knowYourself()` as usual. Create one factory macro device JSON. Done. |
| **"I don't want to maintain UI code"** | Macro device is a JSON file, not C++. WebUI and OLED render it generically. |
| **"Someone improves the control layout without touching my code"** | Sound designer creates a new macro device for the same machine. DSP code untouched. |
| **"Raw mode must always work"** | v1 API + `mui`/`mp` system unchanged. Raw mode is the fallback for all plugins. |

### WebUI Developer

| Story | How it works |
|-------|-------------|
| **"I render controls generically"** | Load macro device JSON → render groups as pages → each `ui` type maps to a widget |
| **"I support 300+ params without special-casing"** | PicoSeqRack has 16 channels × multiple machines. Each channel loads its own macro device. Renderer is the same for all. |
| **"I support raw mode for debugging"** | Toggle: macro mode renders from macro device JSON. Raw mode renders from `mui-*.jsn`. Both use the same component library. |

### Artist / Content Creator

| Story | How it works |
|-------|-------------|
| **"I create a genre-specific Kit"** | Tune all 16 channels, mixer, FX. Save as Kit with metadata (name, genre, tags). |
| **"My Kit works on any user's device"** | Kit stores raw DSP values. Works regardless of their macro device or firmware version. |
| **"Missing samples degrade gracefully"** | If the Kit references samples the user doesn't have, those channels are silent — rest works fine. |

---

## 10. API Specification

### Existing v1 API (unchanged, always available)

All existing endpoints remain for backward compatibility and raw mode:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/getPlugins` | GET | List available plugins |
| `/api/v1/getActivePlugin{ch}` | GET | Get active plugin on channel |
| `/api/v1/getPluginParams{ch}` | GET | Get merged schema + values (raw) |
| `/api/v1/setPluginParam{ch}?id=...&current=...` | GET | Set one raw param |
| `/api/v1/getPresets{ch}` | GET | List preset slots |
| `/api/v1/loadPreset{ch}?number=...` | GET | Load preset slot |
| `/api/v1/savePreset{ch}?name=...&number=...` | GET | Save preset slot |
| `/api/v1/getPresetData/{plugin}` | GET | Export all preset data |
| `/api/v1/setPresetData/{plugin}` | POST | Import all preset data |

### New v2 API: Macro Device CRUD

File-based CRUD on `/sdcard/data/macros/`. Returns JSON. Writes to `user/` subdirectory.

| Endpoint | Method | Request | Response | Notes |
|----------|--------|---------|----------|-------|
| `/api/v2/macros` | GET | — | `[{ "id": "db-1234", "name": "...", "machine": "db", "path": "factory/db_default" }, ...]` | Lists factory + user macro devices |
| `/api/v2/macros?machine=db` | GET | — | Same, filtered by machine type | For populating "choose macro" dropdown |
| `/api/v2/macros/:path` | GET | — | Full macro device JSON | `:path` = `factory/db_default` or `user/my_kick` |
| `/api/v2/macros` | POST | Macro device JSON body | `{ "path": "user/my_kick" }` | Saves to `/macros/user/`. ID must be unique. |
| `/api/v2/macros/:path` | PUT | Macro device JSON body | `200 OK` | Update existing user macro device. Factory = 403. |
| `/api/v2/macros/:path` | DELETE | — | `200 OK` | Delete user macro device. Factory = 403. |

### New v2 API: Channel Macro Assignment

| Endpoint | Method | Request | Response | Notes |
|----------|--------|---------|----------|-------|
| `/api/v2/channels/:ch/macro` | GET | — | `{ "macro": "factory/db_default" }` | Which macro device is active on this channel |
| `/api/v2/channels/:ch/macro` | PUT | `{ "macro": "user/808_punchy" }` | `200 OK` | Switch macro device. Sound unchanged. |

### New v2 API: Batch Param Update

**The single most important firmware addition.** Already prototyped: `SetChannelParamsFromCStrJSON()` exists but has no REST endpoint.

| Endpoint | Method | Request | Response | Notes |
|----------|--------|---------|----------|-------|
| `/api/v2/params/:ch` | POST | `{ "params": [{ "id": "ch1_db_f0", "current": 2048 }, ...] }` | `200 OK` | Batch-set multiple raw params atomically |
| `/api/v2/params/:ch` | GET | — | `{ "params": [{ "id": "ch1_db_f0", "current": 2048 }, ...] }` | Get current raw param values |

This replaces N individual `setPluginParam` calls with one request per knob change (the mapping produces multiple raw params per macro knob).

### New v2 API: Sound Preset CRUD

| Endpoint | Method | Request | Response | Notes |
|----------|--------|---------|----------|-------|
| `/api/v2/presets?macro=db-1234` | GET | — | `[{ "name": "Deep House", "group": "Kicks" }, ...]` | List presets for a macro device |
| `/api/v2/presets` | POST | Sound preset JSON body | `{ "id": "..." }` | Save new preset |
| `/api/v2/presets/:id` | GET | — | Full preset JSON | |
| `/api/v2/presets/:id` | PUT | Sound preset JSON body | `200 OK` | Update existing preset |
| `/api/v2/presets/:id` | DELETE | — | `200 OK` | |

### New v2 API: Kit CRUD

| Endpoint | Method | Request | Response | Notes |
|----------|--------|---------|----------|-------|
| `/api/v2/kits` | GET | — | `[{ "name": "Deep Techno", "author": "Stimming", "path": "artist/stimming_deep_techno", "genre": "Techno", "tags": [...] }, ...]` | List all Kits (factory + artist + user) |
| `/api/v2/kits/:path` | GET | — | Full Kit JSON | Download Kit file |
| `/api/v2/kits` | POST | Kit JSON body | `{ "path": "user/my_kit" }` | Upload/import Kit to user directory |
| `/api/v2/kits/:path` | DELETE | — | `200 OK` | Delete user Kit. Factory/artist = 403. |
| `/api/v2/kits/active` | GET | — | Kit JSON | Export current live state as a Kit |
| `/api/v2/kits/active` | PUT | Kit JSON body (or `{ "path": "artist/stimming" }`) | `200 OK` | Load Kit into live state (bulk param set + machine switch) |

### Implementation notes for Kit load (`PUT /api/v2/kits/active`)

Loading a Kit requires:
1. For each channel in `kit.channels`: if machine type differs from current, call `SetSoundProcessorChannel(ch, machineId)` — this is the existing `set_active_plugin_get_handler` logic.
2. Batch-set all `kit.params` via the existing `SetChannelParamsFromCStrJSON()` method.
3. For Rompler channels: set sample bank/slice params.
4. Return 200 with a summary of what changed.

This uses **existing firmware methods**. The new code is just the REST endpoint wiring + file I/O.

---

## 11. SD Card Layout

```
/sdcard/data/
  sp/
    mui-PicoSeqRack.jsn              ← Synth param schema (firmware-generated)
    mp-PicoSeqRack.jsn               ← Active state (firmware-managed, unchanged)
  macros/
    factory/
      db_default.jsn                 ← Factory macro: Digital Bass Drum (all params)
      db_808_punchy.jsn              ← Factory variant: 808-style, 4 macro knobs
      ab_default.jsn                 ← Factory: Analogue Bass Drum
      ds_default.jsn                 ← Factory: Digital Snare
      hh1_default.jsn                ← Factory: HiHat 1
      smp_default.jsn                ← Factory: Rompler
      tbd03_default.jsn              ← Factory: TBD03
      mo_default.jsn                 ← Factory: Macro Oscillator
      mixer_default.jsn              ← Factory: Channel mixer strip
      fx_delay_default.jsn           ← Factory: Delay
      fx_reverb_default.jsn          ← Factory: Reverb
      master_default.jsn             ← Factory: Master bus
    user/
      my_kick_macro.jsn              ← User-created
      downloaded_acid_bass.jsn       ← Third-party downloaded
  presets/
    db-1234/
      deep_house.jsn                 ← Sound presets organized by macro ID
      hard_techno.jsn
  kits/
    factory/
      default.kit.jsn                ← Out-of-box experience
      909_classic.kit.jsn
    artist/
      stimming_deep_techno.kit.jsn
      jakojako_uk_bass.kit.jsn
    user/
      my_live_set.kit.jsn
      jam_feb_15.kit.jsn
```

**Factory files are read-only.** Users can override by creating a user file with the same machine target. The system loads user files over factory files when both exist for the same machine.

---

## 12. Open Questions & Decisions

### Decided

| Decision | Rationale |
|----------|-----------|
| Macro device is separate from sound preset | One layout, many presets. Change layout without breaking presets. |
| Kit stores raw synth values, not macro values | Kits are independent of macro layouts. No re-mapping on load. |
| Mapping uses `start + Σ(src × amt)` arithmetic | Runs on RP2350 integer math. No expression parser needed. Prototype-proven. |
| 4 params per page (padded with empties) | Matches 4 physical encoders. Direct hardware↔WebUI correspondence. |
| Channel prefix resolved at load time | One macro device definition works on any channel running that machine. |
| `ui` field is a display hint | Start small, extend later. Never blocks implementation. |
| `mui`/`mp` system is unchanged | Macro layer sits above it. Raw mode always available as fallback. |
| v1 API remains fully functional | Backward compatibility. Raw mode. Debugging. |

### To decide

| Question | Options | Notes |
|----------|---------|-------|
| **Mapping target names → synth param name resolution** | A: Exact match against `mui` schema param IDs (strip channel prefix). B: Lookup table in firmware. | Prototype uses short names like `"db-d"`, `"db-fq"` that don't match `mui` IDs like `ch1_db_decay`. Need a canonical mapping or rename. |
| **Where are sound presets stored?** | A: On Pico only (fast, local). B: On P4 SD card (accessible via WebUI). C: Both (synced). | Prototype implies Pico-local. WebUI needs access for browsing/editing. |
| **Should macro devices support expression strings?** | A: Keep `start + Σ(src × amt)` only (prototype format). B: Add optional `"expr"` field for complex mappings. | (A) is simpler and RP2350-safe. (B) enables `"freq / 800 * 4095"` style but needs a parser. Not needed for v1. |
| **How does the WebUI discover available machines per channel?** | A: Read from `mui` schema group names. B: New endpoint. C: Hardcoded in WebUI. | Needed for the "choose macro device" dropdown. |
| **Kit format: should it include active macro device assignments?** | A: No (Kit = pure sound state). B: Yes (Kit includes per-channel macro ref). | (A) is cleaner but means loading a Kit doesn't restore the control layout. (B) enables "complete experience" sharing. |

---

## 13. Implementation Order

### Step 1: Agree on formats ← NOW

- Lock the macro device JSON format (§3 — the prototype's format with `ui` field addition).
- Lock mapping target names: decide how `tgt` values map to `mui` schema param IDs.
- Create 2–3 factory macro device JSONs as concrete test files (db, mixer, tbd03).

### Step 2: Batch param endpoint (firmware, small)

```
POST /api/v2/params/:ch
```

Wire the existing `SetChannelParamsFromCStrJSON()` to a REST endpoint. This unblocks both WebUI macro mode AND the kit loading feature. **Most valuable single change.**

### Step 3: Macro file CRUD API (firmware, small)

```
GET/POST/DELETE /api/v2/macros
GET/PUT         /api/v2/channels/:ch/macro
```

Simple file operations on `/sdcard/data/macros/`. Enables the WebUI to upload/download/select macro devices. The prototype's "Upload to device" button becomes functional.

### Step 4: WebUI macro rendering

Load macro device JSON → render groups as pages → on knob change, evaluate `start + Σ(src × amt)` → batch-POST raw values via v2 API.

This is when the WebUI transforms from 388 raw sliders to 4–8 meaningful knobs per machine.

### Step 5: Pico integration

RP2350 loads macro device snapshot (from P4 via SPI) → renders on OLED → evaluates mapping on encoder change → sends raw values. Hardware and WebUI now show identical controls.

### Step 6: Kit CRUD API (firmware, small)

```
GET/POST/DELETE /api/v2/kits
GET/PUT         /api/v2/kits/active
```

File operations on `/sdcard/data/kits/` + bulk param set + machine switching for kit load.

### Step 7: Kit Manager in WebUI

Kit browser (factory / artist / user sections), load/save/export/import, metadata display.

### Step 8: Patch editor in WebUI

Visual editor for creating/editing macro devices — the prototype integrated into the main WebUI.

### Future: Extend `knowYourself()` to emit physical ranges

Add `physMin`, `physMax`, `scale`, `unit` to `mui` schema output. Factory macro devices can auto-validate against these ranges. Not a blocker — sound designers work without it today.
