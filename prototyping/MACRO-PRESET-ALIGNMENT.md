# Macro Preset Implementation — Alignment with Spec

> **Date:** February 23, 2026
> **Branch:** `macropresets`
> **Commits analyzed:** `0cf00c0` ("Models for macros, Rest api, dummy web ui") and `683dcd0` ("Macro updates...")
> **Reference specs:**
> - `MACRO-PRESET-SPEC.md` (authoritative, February 2026)
> - `WEBUI-UNIFIED-FORMAT-AND-TYPES.md` (superseded by MACRO-PRESET-SPEC for format decisions)

---

## 1. Overview

The two commits introduce the foundational macro device / sound preset system on the ESP32-P4 side. This covers roughly **Steps 1–4** of the MACRO-PRESET-SPEC's 8-step implementation plan:

1. Data models for Macro Device Definitions, Sound Presets, Synth Definitions, and Track Definitions
2. REST API endpoints for CRUD operations
3. A `MacroTranslator` that evaluates macro→synth mappings in the audio processing path
4. A standalone WebUI page (`macros.html`) for editing and testing

---

## 2. Macro Device Definition Format

### Status: STRONG alignment with MACRO-PRESET-SPEC §3

The implementation parses and serializes the exact JSON format from the spec:

```json
{
  "id": "md-kickmachine-2",
  "name": "My preset",
  "machine": "db",
  "groups": [
    {
      "name": "Group 1",
      "parameters": [
        { "idx": 0, "name": "Cutoff", "def": 50, "min": 10, "max": 10000, "res": 1000, "ui": "freq" }
      ]
    }
  ],
  "mapping": [
    { "tgt": "db-d", "start": 10, "add": [{ "src": 0, "amt": 50 }, { "src": 2, "amt": 50 }] }
  ]
}
```

**C++ classes** (all in `CTAG::MACROPRESETS` namespace):

| Class | Spec concept | Fields |
|-------|-------------|--------|
| `MacroDeviceDefinition` | Macro Device (§3 top-level) | `id`, `name`, `synthId` (from `"machine"`), `parameterGroups`, `outputMappings` |
| `MacroDeviceParameterGroup` | Parameter group/page | `name`, `parameters[]` |
| `MacroDeviceParameter` | Per-parameter definition | `index`, `name`, `defaultValue`, `minValue`, `maxValue`, `resolution`, `uiType` |
| `MacroDeviceOutputMapping` | Per-mapping entry | `synthParameterId` (from `"tgt"`), `startValue`, `sources[]` |
| `MacroDeviceOutputMappingSource` | Per-source in `"add"` array | `parameterIndex` (from `"src"`), `amount` (from `"amt"`) |

**Files:**
- `main/MacroDeviceDefinition.cpp` / `.hpp`
- `main/MacroDeviceDefinitionDataModel.cpp` / `.hpp`

### What matches the spec

- All required fields (`id`, `name`, `machine`, `groups`, `mapping`) are parsed
- Parameter fields (`idx`, `name`, `def`, `min`, `max`, `res`, `ui`) all present
- Mapping format (`tgt`, `start`, `add[]` with `src`/`amt`) exact match
- Both serialization and deserialization implemented

### What to watch

- The `"machine"` JSON key maps to `synthId` internally — this is fine but needs consistency in documentation
- Empty parameter slots for pages with <4 params (spec §3 "Empty Slots") are not explicitly handled yet — the WebUI should pad

---

## 3. Mapping Evaluation

### Status: EXACT match with MACRO-PRESET-SPEC §3 mapping formula

The spec defines: `target_value = start + Σ(macro_values[src] × amt)`

Implementation in `MacroTranslator::TranslateInput()`:
```cpp
int32_t finalvalue = om->startValue;
for(auto src : om->sources) {
    int val = trackParameterValues[t][src->parameterIndex];
    finalvalue += val * src->amount;
}
```

Supports all mapping capabilities from the spec:
- **One-to-one:** One macro knob → one synth param
- **Many-to-one:** Multiple `add` sources → one target
- **One-to-many:** Same `src` index referenced in multiple mapping entries
- **Constant lock:** `start` value with no `add` sources

Output values are clamped to 0–127 (MIDI CC range), which differs from the spec's implied 0–4095 DSP range — this is because the implementation routes through MIDI CC, not direct DSP param setting.

---

## 4. Sound Preset Format

### Status: PARTIAL alignment with MACRO-PRESET-SPEC §4

Spec format:
```json
{ "name": "Deep House Kick", "group": "Kicks", "macro": "db-1234", "values": [60, 52, 80, 15, -1, -1, -1] }
```

Implementation format (from example files):
```json
{ "id": "msp-kick2", "name": "Kick 2", "macroDeviceId": "md-analogkick-1", "parameters": [] }
```

**Differences:**

| Spec field | Implementation | Notes |
|-----------|---------------|-------|
| `name` | `name` | Match |
| `group` | Missing | Not implemented — needed for preset categorization |
| `macro` | `macroDeviceId` | Cosmetic naming difference |
| `values` (array) | `parameters` (array) | Same concept, different key name |
| — | `id` | Added field — not in spec but useful for CRUD |

**Files:**
- `main/MacroSoundPreset.cpp` / `.hpp`
- `main/MacroSoundPresetGroup.cpp` / `.hpp`
- `main/MacroSoundPresetDataModel.cpp` / `.hpp`
- `sdcard_image/data/macrosoundpresets/msp-kick1.json`, `msp-kick2.json`, `msp-kick3.json`

### TODO
- [ ] Add `group` field for categorization (spec §4)
- [ ] Wire preset values through `MacroTranslator` fully (loading a preset → applying values → re-evaluating all mappings)
- [ ] Support `-1` sentinel value meaning "use macro device default" (spec §4)

---

## 5. SynthDefinition & TrackDefinition (New — Not in Specs)

### Status: PRAGMATIC ADDITION — resolves open question from MACRO-PRESET-SPEC §12

The specs left "mapping target names → synth param name resolution" as an open question. The implementation resolves this by introducing two new data objects:

#### SynthDefinition
Defines a machine type and its DSP parameters with MIDI CC mappings:

```json
{
  "id": "db",
  "name": "Digital Bass Drum",
  "type": 2,
  "parameters": [
    { "id": "freq", "name": "Frequency", "type": "cc", "default": 0, "cc": 8 },
    { "id": "decay", "name": "Decay", "type": "cc", "default": 0, "cc": 9 }
  ]
}
```

This bridges macro device `"tgt"` names (e.g., `"freq"`) to actual MIDI CC numbers by matching `synthParameterId` against `SynthParameter::id`.

#### TrackDefinition
Defines the 16 tracks of PicoSeqRack and which machines each track supports:

```json
{
  "index": 0, "type": "drum", "name": "Kick",
  "midichannel": 9, "drumnote": 36, "basecc": 0,
  "machines": ["nodrum", "db", "ab", "extdrum"]
}
```

Both are loaded from `sdcard_image/data/synthdefinitions.json`.

**Files:**
- `main/SynthDefinition.cpp` / `.hpp`
- `main/SynthDefinitionDataModel.cpp` / `.hpp`
- `main/TrackDefinition.cpp` / `.hpp`
- `sdcard_image/data/synthdefinitions.json`

### Relationship to spec concepts

| Spec concept | Implementation |
|-------------|---------------|
| Machine ID table (MACRO-PRESET-SPEC §6) | `SynthDefinition` entries — same IDs (`db`, `ab`, `ds`, etc.) |
| Channel binding / prefix resolution (§6) | `TrackDefinition::baseCC` + `trackOutputMappingCC[][]` resolves per-track |
| Per-channel machine selection (§6) | `TrackDefinition::macroMachineIds` lists valid machines per track |
| How WebUI discovers available machines (§12 open question) | `GET /api/v1/picoseq/trackdefinition/*` returns available machines |

---

## 6. MacroTranslator (Core Engine)

### Status: WORKING — implements spec §8 data flows

`MacroTranslator` is the central component that:

1. **Receives MIDI input** → parses note on/off and CC messages → routes to correct track
2. **Receives macro parameter changes** (from WebUI or MIDI CC) → stores in `trackParameterValues[16][16]`
3. **Evaluates mappings** when a track is dirty → computes `start + Σ(src × amt)` → sends raw values to `soundProcessor` via `handleMidiControlChange()`
4. **Handles machine switching** per track via `setTrackMachine()`
5. **Accepts JSON commands** via `SetTrackParametersFromJSON()` — supports setting `macro`, `machine`, and `parameters` in one call

**File:** `main/MacroTranslator.cpp` / `.hpp`

### Data flow matches spec §8

```
WebUI sends PUT /api/v1/picoseq/tracks/0 with { "parameters": [72, 50, 80, ...] }
  → MacroTranslator::SetTrackParametersFromJSON()
  → trackParameterValues[0][...] updated, trackDirty[0] = 1
  → TranslateInput() evaluates all mapping entries for dirty tracks
  → soundProcessor->handleMidiControlChange(track, cc, finalvalue) for each output
```

### Key architectural note
The implementation routes through **MIDI CC** (0–127 range) rather than direct DSP param setting (0–4095) as the spec assumes. This is because PicoSeqRack's DSP internally uses MIDI CC for parameter control. The mapping amounts in macro device JSONs need to account for this range.

---

## 7. REST API

### Status: FUNCTIONAL EQUIVALENT — different URL scheme from spec

All endpoints are under `/api/v1/picoseq/` instead of the spec's `/api/v2/`:

| Spec (MACRO-PRESET-SPEC §10) | Implemented | Method |
|-------------------------------|-------------|--------|
| `GET /api/v2/macros` | `GET /api/v1/picoseq/macrodefinitions` | GET |
| `GET /api/v2/macros/:path` | `GET /api/v1/picoseq/macrodefinition/*` | GET |
| `PUT /api/v2/macros/:path` | `PUT /api/v1/picoseq/macrodefinition/*` | PUT |
| `POST /api/v2/macros` | Not yet (PUT creates/updates) | — |
| `DELETE /api/v2/macros/:path` | Not yet | — |
| `GET /api/v2/presets?macro=...` | `GET /api/v1/picoseq/soundpresets` | GET (no filter) |
| `GET /api/v2/presets/:id` | `GET /api/v1/picoseq/soundpreset/*` | GET |
| `PUT /api/v2/presets/:id` | `PUT /api/v1/picoseq/soundpreset/*` | PUT |
| `POST /api/v2/params/:ch` | `PUT /api/v1/picoseq/tracks/*` | PUT |
| `GET /api/v2/channels/:ch/macro` | `GET /api/v1/picoseq/trackstatus` (all tracks) | GET |
| `PUT /api/v2/channels/:ch/macro` | Via PUT tracks/* with `"macro"` in body | PUT |
| `GET/POST/DELETE /api/v2/kits` | **Not implemented** | — |
| `GET/PUT /api/v2/kits/active` | **Not implemented** | — |

**Additional endpoints not in spec:**

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/picoseq/synthdefinitionlist` | List machine types |
| `GET /api/v1/picoseq/synthdefinition/*` | Get machine definition (params + CCs) |
| `GET /api/v1/picoseq/trackdefinition/*` | Get track config (available machines) |

**Infrastructure additions:**
- CORS headers on all endpoints (needed for development with separate WebUI)
- OPTIONS preflight handler
- `max_uri_handlers` increased from 20 to 32

**File:** `main/RestServer.cpp` / `.hpp`

### TODO
- [ ] Add DELETE endpoints for macro definitions and sound presets
- [ ] Add preset filtering by macro device ID (`?macro=...`)
- [ ] Decide on URL scheme: stay with `/api/v1/picoseq/` or migrate to `/api/v2/`
- [ ] Implement Kit API (spec §10 Steps 6–7)

---

## 8. SD Card Layout

### Status: DIVERGENT naming, flat structure

| Spec (MACRO-PRESET-SPEC §11) | Implemented |
|-------------------------------|-------------|
| `/sdcard/data/macros/factory/*.jsn` | `/sdcard/data/macrodefinitions/*.json` |
| `/sdcard/data/macros/user/*.jsn` | Same directory (no factory/user split) |
| `/sdcard/data/presets/{macroId}/*.jsn` | `/sdcard/data/macrosoundpresets/*.json` |
| `/sdcard/data/kits/factory/*.kit.jsn` | Not implemented |
| `/sdcard/data/sp/mui-*.jsn` | Unchanged (existing) |
| `/sdcard/data/sp/mp-*.jsn` | Unchanged (existing) |
| — | `/sdcard/data/synthdefinitions.json` (new) |

### TODO
- [ ] Decide whether to adopt factory/user directory split for macro definitions
- [ ] Decide whether to organize sound presets by macro device ID subdirectories
- [ ] Implement kit storage directory

---

## 9. WebUI (macros.html)

### Status: WORKING scaffold — separate page

A standalone `macros.html` page with 1165 lines of JavaScript provides:
- Track selection and machine switching
- Macro device definition loading and editing
- Parameter knob rendering per group
- Mapping evaluation in JS (client-side, matching spec architecture)
- Batch parameter sending to device
- Sound preset list, load, and save
- Local cache in `localStorage`

**Files:**
- `sdcard_image/www/macros.html`
- `sdcard_image/www/js/macros.js`
- `sdcard_image/www/css/macros.css`

### TODO
- [ ] Integrate into main WebUI (currently a separate page)
- [ ] Render `ui` types properly (spec §7: `percent`, `freq`, `time_ms`, `db`, `pan`, `toggle`, `select:...`)
- [ ] Pad parameter groups to 4 per page (spec §3 "Empty Slots")
- [ ] Add Kit load/save UI (spec Step 7)

---

## 10. Kit Format

### Status: NOT IMPLEMENTED

The Kit format (MACRO-PRESET-SPEC §5, WEBUI-UNIFIED §13) — complete plugin snapshots with all 388 raw DSP params + channel machine assignments + metadata — is not yet in this branch. Both specs list this as Steps 6–7 of the implementation plan.

### TODO
- [ ] Define Kit JSON format (likely extend existing `mp-PicoSeqRack.jsn` patch structure)
- [ ] Implement Kit CRUD API (`/api/v2/kits`)
- [ ] Implement Kit load (`PUT /api/v2/kits/active`) — bulk param set + machine switching
- [ ] Implement Kit export (`GET /api/v2/kits/active`) — snapshot current state
- [ ] Add metadata: `name`, `author`, `description`, `genre`, `tags`, `created`
- [ ] Add `channels` object (per-channel machine assignments + sample selections)
- [ ] Kit Manager WebUI

---

## 11. PicoSeqRack DSP Changes

The `ctagSoundProcessorPicoSeqRack.cpp` received significant changes (+382/-25 lines) to support the macro system:
- `setTrackMachine()` method to switch machine types per track at runtime
- `handleMidiControlChange()` for receiving mapped macro output values
- `handleMidiNoteOn()` / `handleMidiNoteOff()` for MIDI note routing
- Integration with `MacroTranslator` in the process data path

---

## 12. SPManager / SpiAPI Integration

- `SPManager` gained initialization of `synthDefinitionModel`, `macroDeviceDefinitionModel`, `macroSoundDefinitionModel`, and `macroTranslator` shared pointers
- `SpiAPI` gained a `HandleMacroMidi()` method for forwarding MIDI data from the RP2350 to the MacroTranslator
- Models are loaded from SD card at startup

---

## 13. Decisions Made (vs. Spec Open Questions)

| Spec open question (§12) | Decision in implementation |
|--------------------------|---------------------------|
| Mapping target name resolution | Via `SynthDefinition` CC lookup — not direct `mui` ID matching |
| Where are sound presets stored? | On P4 SD card (`/sdcard/data/macrosoundpresets/`) — accessible via WebUI |
| Expression strings vs. `start+Σ(src×amt)`? | `start+Σ(src×amt)` only — no expression parser |
| How does WebUI discover available machines? | New endpoint `GET /api/v1/picoseq/trackdefinition/*` |
| Kit includes active macro assignments? | Not yet decided (Kit not implemented) |

---

## 14. What's Next (Spec Steps 5–8)

| Step | Description | Status |
|------|-------------|--------|
| 5 | Pico (RP2350) integration — load macro snapshot via SPI, render on OLED, evaluate mapping on encoder change | Not started |
| 6 | Kit CRUD API | Not started |
| 7 | Kit Manager WebUI | Not started |
| 8 | Patch editor integrated in main WebUI | Partially done (standalone `macros.html`) |
| Future | Extend `knowYourself()` to emit `physMin`, `physMax`, `scale` | Not started |
