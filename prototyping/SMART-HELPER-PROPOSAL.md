# Smart Helper — AI-Assisted Macro & Preset Design

> **Status:** Proposal / Feature Concept  
> **Scope:** TBD-16 WebUI (Preset & Macro Manager)  
> **Date:** March 2026

---

## 1. Overview

The TBD-16 WebUI currently requires users to understand the inner workings of
each DSP machine when creating macro definitions and sound presets. The **Smart
Helper** is a proposed feature that embeds knowledge of every DSP plugin's audio
engine directly into the UI, helping users create musically coherent macros and
presets faster — regardless of their synthesis experience level.

### Goals

| Goal | Description |
|------|-------------|
| **Lower the barrier** | Users shouldn't need to read C++ source code to know which parameters combine well. |
| **Prevent mistakes** | Warn when a macro mapping is musically nonsensical (e.g. filter resonance without cutoff). |
| **Accelerate workflow** | Offer one-click macro templates for common use cases and genres. |
| **Teach** | Explain what each parameter does in plain language, with audio-relevant context. |

---

## 2. Architecture

```
┌─────────────────────────────────────────────┐
│                  WebUI                       │
│  ┌───────────┐  ┌──────────┐  ┌───────────┐ │
│  │ Performer │  │ Designer │  │Smart Helper│ │
│  │ (presets) │  │ (macros) │  │  (panel)   │ │
│  └─────┬─────┘  └─────┬────┘  └─────┬─────┘ │
│        │              │             │        │
│        └──────────┬───┘             │        │
│                   ▼                 │        │
│           ┌──────────────┐          │        │
│           │  shared.js   │◄─────────┘        │
│           │  (data API)  │                   │
│           └──────┬───────┘                   │
│                  │                           │
│           ┌──────▼───────┐                   │
│           │ dsp-knowledge│  ← NEW JSON file  │
│           │    .json     │                   │
│           └──────────────┘                   │
└─────────────────────────────────────────────┘
```

The core addition is a **DSP Knowledge Base** (`dsp-knowledge.json`) that
encodes musical metadata for every machine and parameter. The Smart Helper
panel reads this file and provides contextual guidance.

---

## 3. DSP Knowledge Base (`dsp-knowledge.json`)

A single JSON file shipped alongside `synthdefinitions.json` containing
machine-level musical metadata that the C++ code cannot express.

### 3.1 Schema

```json
{
  "machines": {
    "db": {
      "displayName": "Synth Kick",
      "category": "drum",
      "subcategory": "kick",
      "description": "Digital kick drum based on Mutable Instruments Peaks BassDrum model. Sine body with FM pitch sweep and dirt.",
      "parameters": {
        "8": {
          "cppName": "f0",
          "displayName": "Freq",
          "description": "Base frequency of the kick drum body",
          "unit": "Hz",
          "musicalRole": "pitch",
          "range": { "min": 0, "max": 127, "sweet": [8, 32] },
          "tips": "Lower values (8-16) for deep sub kicks, higher (24-40) for punchy techno kicks"
        },
        "9": {
          "cppName": "tone",
          "displayName": "Tone",
          "description": "Brightness / tonal character of the body oscillator",
          "musicalRole": "timbre",
          "range": { "min": 0, "max": 127, "sweet": [32, 80] }
        }
      },
      "parameterGroups": {
        "pitch": {
          "name": "Pitch & Attack",
          "params": [8, 12, 13],
          "description": "Controls the characteristic pitch sweep of a kick drum. Freq sets the landing pitch, FM Env sets sweep depth, FM Decay sets sweep speed."
        },
        "body": {
          "name": "Body & Tone",
          "params": [9, 10],
          "description": "Shape the timbre and sustain of the drum hit."
        },
        "character": {
          "name": "Character",
          "params": [11],
          "description": "Adds harmonic distortion."
        },
        "dynamics": {
          "name": "Dynamics",
          "params": [14],
          "description": "Accent scaling for velocity response."
        }
      },
      "macroSuggestions": [
        {
          "name": "Pitch + FM",
          "description": "Classic kick macro: one knob sweeps the base pitch while proportionally adjusting the FM envelope depth",
          "knobs": [
            { "name": "Pitch", "targets": [
              { "ctrl": 8, "mul": 1, "div": 1 },
              { "ctrl": 12, "mul": 1, "div": 3 }
            ]}
          ]
        },
        {
          "name": "Body",
          "description": "Controls body fullness: decay length and tonal brightness move together",
          "knobs": [
            { "name": "Body", "targets": [
              { "ctrl": 9, "mul": 1, "div": 2 },
              { "ctrl": 10, "mul": 1, "div": 2 }
            ]}
          ]
        }
      ],
      "incompatible": [
        {
          "params": [8, 14],
          "reason": "Freq and FM Accent are independent axes — combining them into one knob would make the accent unusable at low pitches"
        }
      ]
    }
  }
}
```

### 3.2 Key Concepts

| Field | Purpose |
|-------|---------|
| `category` / `subcategory` | Enables genre filtering (e.g. show only "drum/kick" machines) |
| `musicalRole` | Tags like `pitch`, `timbre`, `envelope`, `modulation`, `filter`, `dynamics` — used for smart grouping |
| `parameterGroups` | Which parameters naturally belong together (derived from DSP architecture) |
| `macroSuggestions` | Pre-built macro knob templates users can insert with one click |
| `incompatible` | Parameter combinations that should trigger warnings |
| `sweet` | Sweet-spot ranges for defaults and randomization |

---

## 4. Smart Helper UI Features

### 4.1 Contextual Parameter Tooltips

When hovering over any knob or parameter name, a tooltip shows:

```
┌──────────────────────────────────┐
│ ♪ Freq (Synth Kick)             │
│                                  │
│ Base frequency of the kick drum  │
│ body oscillator.                 │
│                                  │
│ Sweet spot: 8–32                 │
│ Lower = deep sub, Higher = punch │
│                                  │
│ Groups well with:                │
│  • FM Env (pitch sweep depth)    │
│  • FM Decay (sweep speed)        │
│                                  │
│ ⚠ Avoid combining with Accent   │
└──────────────────────────────────┘
```

**Implementation:** Add a `<sl-tooltip>` on each `.macro-knob-label` that
pulls data from `dsp-knowledge.json`. The tooltip content is generated
dynamically based on the current machine and parameter ctrl number.

### 4.2 Macro Builder Assistant Panel

A slide-out panel in the Designer (Macros tab) that appears when building
a macro definition. It offers:

#### Quick-Add Macro Templates

```
┌─────────────────────────────────────┐
│ 🎛 Macro Templates for Synth Kick   │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ ⊕ Pitch + FM                   │ │
│ │   One knob sweeps pitch with    │ │
│ │   proportional FM envelope      │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ ⊕ Body (Decay + Tone)          │ │
│ │   Controls body fullness        │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ ⊕ Drive                        │ │
│ │   Dirt amount                   │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

Clicking `⊕` adds the knob with pre-configured mapping to the current
macro definition. The user can then adjust multipliers/dividers.

#### Mapping Validator

When the user adds or modifies a mapping in the Macro Builder, the
validator runs automatically:

```
┌─────────────────────────────────────┐
│ ✓ Knob "Body" → Decay, Tone        │
│   Good match! These naturally       │
│   control the drum body together.   │
│                                     │
│ ⚠ Knob "Weird" → Freq, Accent      │
│   These parameters are independent  │
│   axes. Consider separating them    │
│   into individual knobs.            │
│                                     │
│ ✗ Knob "Filter" → Cutoff            │
│   Missing: Filter Type is set to    │
│   bypass (0). This knob will have   │
│   no audible effect.                │
└─────────────────────────────────────┘
```

**Validation rules from the knowledge base:**
- Warn on `incompatible` parameter pairs
- Warn when a dependent parameter is missing (e.g. filter controls without filter type set)
- Warn when mapping a parameter marked as "not used" in the DSP code
- Suggest complementary parameters from the same `parameterGroup`

### 4.3 Genre Preset Wizard

A guided wizard that helps users create presets targeting specific genres.
This is accessible from the Performer tab's sidebar.

```
┌─────────────────────────────────────┐
│ 🎵 Preset Wizard                    │
│                                     │
│ Genre:  ┌──────────────────────┐    │
│         │ Techno            ▼  │    │
│         └──────────────────────┘    │
│                                     │
│ Sub-style:                          │
│  ○ Hard Techno                      │
│  ● Deep / Minimal                   │
│  ○ Acid Techno                      │
│  ○ Industrial                       │
│                                     │
│ This will set starting points for:  │
│  CH01 Kick  → Freq:12 Decay:48 ... │
│  CH03 Snare → Freq:32 Snap:64  ... │
│  CH04 Hat   → Tone:80 Decay:16 ... │
│  FX1 Delay  → Time:64 FB:32    ... │
│                                     │
│        [ Apply to All Tracks ]      │
│        [ Apply to Current Only ]    │
└─────────────────────────────────────┘
```

### 4.4 Parameter Relationship Visualizer

In the Macro Builder, when a knob has multiple output mappings, show a
small diagram of how the knob value flows to each DSP parameter:

```
         Knob: "Body" (0–127)
              │
    ┌─────────┴──────────┐
    │                    │
    ▼                    ▼
 Decay               Tone
 start:8             start:32
 mul:1 div:2         mul:1 div:2
 range: 8–71         range: 32–95
```

This makes it immediately clear how a macro knob distributes its value
across multiple DSP controls, including the effective ranges.

---

## 5. Genre Templates Data Structure

Genre templates are stored in a separate JSON file (`genre-templates.json`)
and define starting-point parameter values for common musical styles.

```json
{
  "genres": [
    {
      "id": "techno-deep",
      "genre": "Techno",
      "subStyle": "Deep / Minimal",
      "tracks": {
        "0": {
          "machine": "db",
          "macro": "db-allparams",
          "values": {
            "8": 12, "9": 48, "10": 64, "11": 0,
            "12": 16, "13": 8, "14": 8
          },
          "mix": { "1": 80, "2": 64, "3": 16, "4": 24 }
        },
        "2": {
          "machine": "ds",
          "macro": "ds-allparams",
          "values": {
            "8": 32, "9": 40, "10": 20, "11": 64, "12": 32
          },
          "mix": { "1": 56, "2": 72, "3": 8, "4": 16 }
        }
      },
      "fx": {
        "16": {
          "machine": "fxdelay",
          "values": { "8": 64, "9": 32, "10": 80 }
        }
      }
    }
  ]
}
```

---

## 6. Implementation Phases

### Phase 1 — Foundation (Low effort, high impact)

1. **Create `dsp-knowledge.json`** with parameter descriptions, groups,
   and roles for all machines. This is a one-time editorial effort.
2. **Add parameter tooltips** in both Performer and Designer views.
   Hook into `renderKnobGroups()` to add `title` or `<sl-tooltip>`.
3. **Add mapping warnings** in the Designer's Macro Builder tab.
   Check output mappings against `incompatible` rules on save.

**Estimated effort:** 2–3 days  
**Files touched:** `shared.js` (tooltip rendering), `designer.js` (warnings),
new `dsp-knowledge.json`

### Phase 2 — Macro Templates (Medium effort)

4. **Add macro suggestion panel** to Designer sidebar.
   Show `macroSuggestions` from the knowledge base for the current machine.
5. **One-click template insertion** — clicking a suggestion auto-populates
   groups and mapping entries in the macro definition.
6. **Mapping validator** — real-time feedback as user builds macros.

**Estimated effort:** 3–4 days  
**Files touched:** `designer.js` (template panel + validator), `app.css`
(panel styling)

### Phase 3 — Genre System (Higher effort)

7. **Create `genre-templates.json`** with curated starting points for
   5–10 common genres.
8. **Build Preset Wizard UI** — genre picker + track preview + apply.
9. **Batch-apply** — set machines, macros, and parameter values across
   multiple tracks at once.

**Estimated effort:** 4–5 days  
**Files touched:** `performer.js` (wizard UI), `shared.js` (batch API),
new `genre-templates.json`

### Phase 4 — Advanced (Future)

10. **Parameter relationship visualizer** in Macro Builder.
11. **"Explain this preset"** — natural language summary of what a preset
    does based on its parameter values and the knowledge base.
12. **AI-powered suggestions** — use an LLM to generate macro mappings
    based on a text prompt (e.g. "aggressive acid bass").

---

## 7. Data Generation Strategy

The `dsp-knowledge.json` file can be bootstrapped automatically and then
refined manually:

1. **Auto-generate** the skeleton from `synthdefinitions.json` +
   `registerParamAndCC` calls in the C++ source (the test script
   `test_dsp_json_alignment.py` already extracts this data).
2. **Enrich** with musical descriptions, roles, and groupings by
   reviewing each DSP plugin's `Process()` function.
3. **Add macro suggestions** by analyzing existing custom macro
   definitions (e.g. `db-phatpunch.json` becomes a template).
4. **Curate genre templates** from real-world preset collections.

---

## 8. API Surface

No new REST endpoints are needed. The knowledge base is a static JSON file
loaded at boot alongside `synthdefinitions.json`:

```javascript
// In shared.js loadSharedData()
fetch('/api/v1/samples?getconfig=dsp-knowledge.json')
  .then(r => r.json())
  .then(kb => { sharedData.dspKnowledge = kb; });
```

All Smart Helper features are purely client-side — they read the knowledge
base and the existing macro/preset data to generate suggestions and warnings.

---

## 9. Key Machines Reference

For convenience, here is a summary of all sound machines and their
parameter groupings (this should be encoded in `dsp-knowledge.json`):

| Machine | Category | Params | Natural Groups |
|---------|----------|--------|----------------|
| `db` | drum/kick | 7 | Pitch (Freq+FM Env+FM Decay), Body (Tone+Decay), Dirt, Accent |
| `ab` | drum/kick | 6 | Pitch (Freq+A FM+S FM), Body (Tone+Decay), Accent |
| `fmb` | drum/kick | 8 | Carrier (FM+DB), Modulator (FM+DM+BM), FM Depth (AF+DF+I) |
| `ds` | drum/snare | 5 | Pitch (Freq), Envelope (Decay), Timbre (FM+Snap), Dynamics (Accent) |
| `as` | drum/snare | 5 | Pitch (Freq), Body (Tone+Decay), Snap, Dynamics (Accent) |
| `hh1` | drum/hihat | 5 | Pitch (Freq), Timbre (Tone+Noise), Envelope (Decay), Dynamics (Accent) |
| `hh2` | drum/hihat | 5 | Same as hh1 |
| `rs` | drum/perc | 5 | Pitch (Freq), Timbre (Tone+Noise), Envelope (Decay), Dynamics (Accent) |
| `cl` | drum/perc | 5 | Pitch (Freq), Timbre (Tone+Scale), Envelope (Decay), Transient |
| `ro` | sampler | 18 | Sample (Bank+Slice+Start+End+Speed+Loop+PingPong), Filter (Cutoff+Reso+Type), Envelope (Attack+Decay), Pitch, BitCrush, EG2FM, TimeStretch |
| `td3` | synth/bass | 16 | Oscillator (Bank+P0+P1), Filter (Cutoff+Reso+Type+Envelope), Envelope (VCA D+VCF D), Distortion (Satur+Drive), 303 (Slide+Accent+Acc.Lev), Timbre Mod (P0 Amt+P1 Amt) |
| `mo` | synth/lead | 13 | Oscillator (Bank+P0+P1+Waveshape), Mod (P0A+P1A+FMA), Envelope (Attack+Decay+LoopEnv), Scale (Q Scale), Effects (Decim+BitRed) |
| `wtosc` | synth/pad | 20 | Wave (Bank+Wave), Pitch (Tune+Q Scale), Filter (Type+Cutoff+Reso), ADSR (Attack+Decay+Sustain+Release), EG Mod (E2Wave+E2FM+E2Filt), LFO (Speed+Sync), LFO Mod (L2Wave+L2AM+L2FM+L2Filt) |
| `pp` | synth/chord | 18 | Harmony (Chord+Inversion+Notes+Q Scale), Filter (Cutoff+Reso+Type), ADSR (Attack+Decay+Sustain+Release), Vibrato (L1Speed+L1Amount), Filter Mod (L2Speed+L2Amount), Detune, EG→Filter |

---

## 10. Example: Smart Helper in Action

**Scenario:** User selects CH01 (Kick), machine "Synth Kick", and opens
the Designer to create a new macro.

1. The Smart Helper panel shows:
   > "Synth Kick has 7 parameters in 4 natural groups:
   > Pitch & Attack, Body & Tone, Character, and Dynamics."

2. User clicks **"⊕ Pitch + FM"** template → a "Pitch" knob is added
   with mapping: `Freq (1:1) + FM Env (1:3)`.

3. User drags "Accent" into the same knob. The validator shows:
   > "⚠ Freq and Accent are independent axes. Consider keeping
   > Accent as a separate knob for better control."

4. User clicks **"⊕ Body"** → a "Body" knob is added with mapping:
   `Tone (start:32, 1:2) + Decay (start:8, 1:2)`.

5. The Mix page is automatically appended. User saves the macro.

6. Switching to the Performer tab, the user clicks **Preset Wizard**,
   selects "Techno → Deep/Minimal" and applies starting values across
   all tracks.

---

## 11. Open Questions

- **LLM integration:** Should the Smart Helper use an API-connected LLM
  for free-form questions ("how do I make a harder kick?"), or should it
  stay fully offline with curated knowledge?
- **User contributions:** Could users export and share their macro
  templates / genre presets? (Would need a community format.)
- **Per-machine vs global:** Should genre templates lock specific machines
  to tracks, or just set parameter values for whatever machine is active?
