# TBD-16 WebUI — Hardware UI Synthesis & Toolkit Research

> **Status:** New synthesis document — extends WEBUI-SYNTHESIS.md with hardware UI analysis, RP2350 firmware insights, and UI toolkit research.
> **Supersedes / extends:** [WEBUI-SYNTHESIS.md](WEBUI-SYNTHESIS.md) sections 3 (parameter abstraction) and 6 (revised plugin parameter rendering).
> **Prerequisites:** Read [WEBUI-SYNTHESIS.md](WEBUI-SYNTHESIS.md) and [UNIFIED-WEBUI-ARCHITECTURE.md](UNIFIED-WEBUI-ARCHITECTURE.md) first.
> **Date:** February 2026

---

## Table of Contents

1. [Hardware UI — What We're Dealing With](#1-hardware-ui--what-were-dealing-with)
2. [RP2350 Firmware — How the Hardware UI Works Today](#2-rp2350-firmware--how-the-hardware-ui-works-today)
3. [Why the Hardware UI Is Hard to Use](#3-why-the-hardware-ui-is-hard-to-use)
4. [The 4-Knob Row as a Design Primitive](#4-the-4-knob-row-as-a-design-primitive)
5. [Parameter Type System — What We Must Build](#5-parameter-type-system--what-we-must-build)
6. [webaudio-controls — Deep Feature Analysis](#6-webaudio-controls--deep-feature-analysis)
7. [UI Toolkit Research — Shoelace vs. Alternatives](#7-ui-toolkit-research--shoelace-vs-alternatives)
8. [Webserver On/Off — Architecture Implications](#8-webserver-onoff--architecture-implications)
9. [Macro/Preset Layer — Connecting Hardware and WebUI](#9-macropreset-layer--connecting-hardware-and-webui)
10. [Revised Component Architecture](#10-revised-component-architecture)
11. [Recommended Stack](#11-recommended-stack)
12. [First Iteration Scope (Updated)](#12-first-iteration-scope-updated)

---

## 1. Hardware UI — What We're Dealing With

### Physical Controls

The TBD-16 has:

| Control | Count | Role |
|---------|-------|------|
| Endless potentiometers (with push) | 4 | Parameter editing — the primary input device |
| MCL buttons (navigation) | 5 | Up/Down page navigation, track select, transport |
| Step buttons | 16 | Pattern steps, track selection |
| Transport buttons | 4 | Play, stop, record, shift |
| OLED display | 1 | 128 × 64 px, 1-bit, shows page name + 4 parameter slots |
| RGB LEDs | 19 | Step activity, track state, mute |

The OLED display at 128 × 64 pixels can show:
- A page name at the top (e.g. "SOUND", "MIXER", "FX")
- A sub-page name below (e.g. "DECAY", "FILTER", "SAMPLE")
- 4 parameter slots in a row: each showing a short name (≤10 chars) and a value (as a raw number or string)
- A pagination indicator (vertical dots showing which page you're on)

### The 4-Knob Layout on the Display

Each parameter page renders exactly **4 parameters in a horizontal row**, one per physical knob, using the `commonRenderParameter()` function in the firmware. The display is divided into 4 equal slots (each ~32 px wide at 128 px total). Each slot shows:

```
  ┌──────────────────────────────────────────────────────────────┐
  │  SOUND                   FILTER                         [3/6]│
  │──────────────────────────────────────────────────────────────│
  │                                                              │
  │  CUTOF    RESO    FTYPE   EGAMT                              │
  │   64 ●    31 ●    LPF     48 ●                              │
  └──────────────────────────────────────────────────────────────┘
     K1       K2       K3      K4   ← physical knobs
```

Each knob has a `shortname` (max 10 chars) and a `value` (raw int16 or a formatted string for enum types).

---

## 2. RP2350 Firmware — How the Hardware UI Works Today

### tbd-pico-seq3 Source: Key Findings

The sequencer firmware at `tbd-pico-seq3/` reveals the exact data model and UI logic driving the hardware interface. This is essential context for designing the WebUI.

#### Parameter Data Model (`songtypes.hpp`)

```cpp
enum PARAMTYPE {
    PT_NONE        = 0,
    PT_NUMBER      = 1,   // generic 0–N integer
    PT_BIG_NUMBER  = 2,   // larger range int
    PT_LEVEL       = 10,  // amplitude 0–127 → displayed as meter fill
    PT_PAN         = 11,  // panning -64..+64 → displayed as L/C/R
    PT_FILTER_TYPE = 20,  // enum: LP / HP / BP / Notch
    PT_FILTER_CUTOFF = 21,// frequency Hz (log scale)
    PT_FILTER_Q    = 22,  // resonance 0–127
    PT_ENV_ATTACK  = 30,  // time in ms (log scale)
    PT_ENV_DECAY   = 31,  // time in ms (log scale)
    PT_ENV_AMOUNT  = 32,  // bipolar –127..+127
    PT_DISTORTION  = 40,  // saturation 0–127
    PT_SHAPE       = 41,  // waveform shape 0–127
    PT_SHAPE2      = 42,
    PT_SHAPE3      = 43,
    PT_FREQ        = 44,  // frequency/pitch Hz (log)
    PT_NOISE       = 45,  // noise amount 0–127
};

struct AUDIOPARAM {
    enum PARAMTYPE type;   // ← controls display AND behavior
    char shortname[10];    // ← knob label
    int16_t minvalue;      // ← natural minimum
    int16_t maxvalue;      // ← natural maximum
    int16_t defaultvalue;
    int16_t value;
    uint8_t cc;            // ← maps to MIDI CC number
    // ... func/LFO fields ...
};
```

**Critical insight:** The `PARAMTYPE` enum encodes both the *display format* (how to render the value) and the *control behavior* (linear vs logarithmic, range, unit). This is the exact right abstraction. The WebUI needs the same concept.

#### Page Navigation

Parameter pages are stored in `AUDIOPARAMGROUP`:
```cpp
struct AUDIOPARAMGROUP {
    uint8_t numPages;                           // e.g. 6 pages
    struct AUDIOPARAMPAGE page[MAX_PAGES];      // page names
    struct AUDIOPARAM param[MAX_AUDIOPARAMS];   // params[0..3] = page 0, [4..7] = page 1, etc.
};
```

Navigation in `sound.cpp`:
- **Up arrow**: decrement `sound_page`, wrap around to last page (switches to mixer screen at wrap)
- **Down arrow**: increment `sound_page`, wrap around to page 0 (switches to mixer screen at wrap)
- Physical K1–K4 always control params `[page * 4 + 0]` through `[page * 4 + 3]`

The screen hierarchy:
```
SoundParametersScreen  ← per-track DSP parameters (pages 0..N)
TrackMixerScreen        ← level, pan, FX send (always last "page")
FxScreen                ← global FX parameters
MasterScreen            ← master compressor, output level
```

#### Step Parameter Locks

Each step can store overrides for any of the 24 audio params. If a step parameter lock is active, the value display shows `"64<"` (note the `<` suffix indicating a lock). This is a sequencer-specific concept that informs WebUI step editing.

#### Live Feedback: LFO and Random Modes

Parameters can be in one of three modes:
- `SPA_FIXED_VALUE` — normal static value (what the knob controls)
- `SPA_LFO` — value is modulated by an LFO; displayed as `"L3"` 
- `SPA_RANDOM_VALUE` — random per-step; displayed as `"R2"`

These modulation modes are set per-parameter. The WebUI needs to surface them.

---

## 3. Why the Hardware UI Is Hard to Use

This is documented explicitly in the project context and confirmed by the firmware source:

### Problem 1: All Params Are Raw 0–4095 (or 0–127)

In `ctagSoundProcessorPicoSeqRack.cpp`, every parameter is `atomic<int32_t>` with values 0–4095. The DSP code converts them inline:

```cpp
// Example: attack in ms. The user sees "0–4095" but the real range is 0.3–30 ms
MK_FLT_PAR_ABS_MIN_MAX_NOCV(fCompAtk, c_atk, 4095.f, 0.3f, 30.f)

// Example: frequency, logarithmic
MK_FLT_PAR_ABS_NOCV(fBase, fx1_base, 4095.f, 1.f)
fBase = 20.f * stmlib::SemitonesToRatio(fBase * 120.f); // ← log conversion hidden here
```

The conversion from raw to physical unit is **buried in the DSP code** and never exposed to the UI layer. A user turning the "FX Base" knob and seeing "2190" has no idea this corresponds to ~440 Hz.

### Problem 2: Booleans Are Integers

On/off parameters are stored as `int32_t` with values 0 or 1. The hardware UI has no way to render a toggle — it just shows `"0"` or `"1"` next to a knob symbol. There is no switch widget.

### Problem 3: Enums Are Integers

Filter type, waveform shape selectors, and similar multi-choice parameters are stored as 0–N integers. On the 128×64 OLED these are rendered with custom string arrays only for `PARAMTYPE = PT_FILTER_TYPE`. For everything else, you see `"0"`, `"1"`, `"2"`, etc.

### Problem 4: No Context for "Page"

The page/parameter assignment is statically compiled into the firmware. If `page[2].name = "FILTER"`, you know that knobs K1–K4 on page 2 are filter parameters. But the assignment to physical knobs and MIDI CCs is opaque unless you look at the source.

### Root Cause

The sequencer firmware (`tbd-pico-seq3`) has a proper `PARAMTYPE` system with the infrastructure for correct rendering. But the ESP32 plugin parameter schema (`mui-*.jsn`) does **not** carry this metadata. The JSON schema has only `type: "int"` / `type: "bool"` / `type: "group"` — no units, no display hints, no scale.

**The WebUI is the right place to add this layer** without modifying the ESP32 firmware.

---

## 4. The 4-Knob Row as a Design Primitive

### Hardware Origin

The 4 physical knobs are the TBD-16's primary interaction paradigm. Every parameter page shows exactly 4 controls. This is not arbitrary — it reflects the hardware constraint:
- 4 knobs fit on the 128×64 display with enough label space
- 4 knobs can be operated simultaneously (one per finger in "DJ mode")
- 4 parameters per page forces grouping discipline: related controls live together

### WebUI Translation

The WebUI should **embrace this constraint** rather than abandon it. A 4-column parameter row in the WebUI:
1. Creates direct correspondence with hardware — if you see a "FILTER" page with 4 knobs in the browser, those are the same 4 params the hardware shows
2. Enables **mirror mode** — a visual representation of what the hardware display shows
3. Informs muscle memory — power users who know "K3 on page 2 is filter type" can navigate the WebUI intuitively

```
┌─────────────────────────────────────────────────────┐
│  CH9 · BASS · TBD03      FILTER           ▲  2/6  ▼ │
├────────────┬────────────┬────────────┬────────────┤
│  CUTOF     │  RESO      │  FTYPE     │  EGAMT     │
│  ◎ 880 Hz  │  ◎ 24%    │  ▣ LP      │  ◎ +32     │
│            │            │            │            │
└────────────┴────────────┴────────────┴────────────┘
```

The page name, page number, and up/down navigation are shown in a header strip. The lower area shows the 4 knobs, each with:
- A short name (from `shortname` in firmware, or derived from schema `name`)
- A control widget (knob, switch, or select depending on type)
- A formatted value display with unit (Hz, ms, %, dB, etc.)

### When a Page Has Fewer Than 4 Parameters

Some pages have 2 or 3 meaningful params (e.g. a Compressor page might be: Threshold, Ratio, Attack, Release = 4 / or: Mute, Level = 2). When fewer than 4 exist, the remaining slots render as dimmed placeholders.

---

## 5. Parameter Type System — What We Must Build

### The Problem

The plugin schema (`mui-*.jsn`) only describes:
```json
{ "id": "c_atk", "name": "Attack", "type": "int" }
```

No min/max, no unit, no scale, no display hint — the raw value range is always 0–4095.

### Solution: A Parameter Descriptor Layer

Built as a static JSON file (or embedded in the schema extension), a **parameter descriptor table** maps parameter IDs to display metadata:

```json
{
  "c_atk": {
    "displayType": "time_ms",
    "min": 0.3,
    "max": 30.0,
    "scale": "log",
    "unit": "ms",
    "decimals": 1,
    "conv": "x/4095 * (Math.log(30/0.3)/Math.log(10)) + Math.log10(0.3)",
    "convDisplay": "x => (Math.pow(10, x)*0.3).toFixed(1) + ' ms'"
  },
  "c_thres": {
    "displayType": "db",
    "min": -80,
    "max": 0,
    "scale": "linear",
    "unit": "dB",
    "decimals": 1,
    "conv": "((x/4095 * 80) - 80).toFixed(1) + ' dB'"
  },
  "fx1_feedback": {
    "displayType": "percent",
    "min": 0,
    "max": 150,
    "scale": "linear",
    "unit": "%",
    "decimals": 0,
    "conv": "(x/4095 * 150).toFixed(0) + '%'"
  },
  "ch1_mute": {
    "displayType": "toggle",
    "labels": ["ON", "MUTED"]
  },
  "ch1_device": {
    "displayType": "select",
    "options": ["Digital Bass Drum", "Analogue Bass Drum"]
  },
  "fx1_base": {
    "displayType": "freq_hz",
    "min": 20,
    "max": 20000,
    "scale": "log",
    "unit": "Hz",
    "decimals": 0,
    "conv": "(20 * Math.pow(10, x/4095 * (Math.log10(20000/20)))).toFixed(0) + ' Hz'"
  }
}
```

### Display Types Needed

| displayType | Widget | Examples | Notes |
|-------------|--------|----------|-------|
| `number` | knob | generic int 0–4095 | fallback for unknown params |
| `percent` | knob | level, mix, wet/dry | 0–100% |
| `db` | knob | threshold, gain | –80..0 dB, linear or log |
| `time_ms` | knob | attack, decay, delay | 0.3–2000 ms, always log |
| `time_s` | knob | reverb time | 0.1–10 s, log |
| `freq_hz` | knob | filter cutoff, oscillator | 20–20000 Hz, log |
| `semitones` | knob | pitch offset, detune | ±24 or ±100 st, linear |
| `pan` | knob (center-detent style) | stereo pan | –100 L .. 0 .. +100 R |
| `toggle` | switch | mute, freeze, bypass | bool: 0/1 |
| `select` | select/button-group | filter type, waveform | discrete enum |
| `midi_cc` | number input | CC assignments | 0–127 |
| `sample_bank` | number + name | rompler bank slot | shows bank name from sample ROM |

### webaudio-controls Mapping

| displayType | webaudio-controls tag | Key attributes |
|-------------|----------------------|----------------|
| `number` | `webaudio-knob` | `min=0 max=4095` |
| `percent` | `webaudio-knob` | `min=0 max=100 conv="(x/4095*100).toFixed(0)+'%'"` |
| `db` | `webaudio-knob` | `min=-80 max=0 log=0 conv="((x/4095*80)-80).toFixed(1)+'dB'"` |
| `time_ms` | `webaudio-knob` | `min=1 max=4095 log=1 conv="..."` with ms unit |
| `freq_hz` | `webaudio-knob` | `min=1 max=4095 log=1 conv="..."` with Hz unit |
| `pan` | `webaudio-knob` | custom center-zero display |
| `toggle` | `webaudio-switch` | `type="toggle"` |
| `select` | `webaudio-switch` `type="radio"` or `<sl-select>` | for enum values |

---

## 6. webaudio-controls — Deep Feature Analysis

The library at [g200kg/webaudio-controls](https://github.com/g200kg/webaudio-controls) is a single 30 KB Web Components file. Key features relevant to TBD-16:

### The `conv` Attribute — Value-to-Display Conversion

This is the most important feature for TBD-16's parameter display problem:

```html
<!-- Filter cutoff knob: raw 0–4095, displayed as Hz with log scale -->
<webaudio-knob
  id="cutoff"
  min="0" max="4095"
  conv="(20 * Math.pow(1000, x/4095)).toFixed(0) + ' Hz'"
  tooltip="%s"
  valuetip="1">
</webaudio-knob>
```

```html
<!-- Attack time: raw 0–4095, displayed as ms with log scale -->
<webaudio-knob
  id="attack"
  min="0" max="4095"
  conv="(0.3 * Math.pow(100, x/4095)).toFixed(1) + ' ms'"
  tooltip="%s">
</webaudio-knob>
```

```html
<!-- Filter type: 0–3 displayed as enum names -->
<webaudio-knob
  id="ftype"
  min="0" max="3" step="1"
  conv="['LP','HP','BP','Notch'][x]"
  tooltip="%s">
</webaudio-knob>

<!-- Or better: use a switch group for discrete values -->
<webaudio-switch type="radio" group="ftype" value="0"> LP
<webaudio-switch type="radio" group="ftype" value="1"> HP
```

### The `log` Attribute — Logarithmic Scaling

```html
<!-- log=1 makes knob rotation logarithmic — center position = geometric mean -->
<webaudio-knob min="20" max="20000" log="1">
<!-- center knob position → 632 Hz (geometric mean of 20 and 20000) -->
```

This is **exactly what frequency and time parameters need**. Without it, 90% of the knob range is wasted on 0–100 Hz, and 10 kHz–20 kHz is crushed into the last 5°.

### The `webaudio-param` Companion

```html
<!-- Editable value display linked to a knob, shows formatted value -->
<webaudio-knob id="k1" min="0" max="4095"
  conv="(20 * Math.pow(1000, x/4095)).toFixed(0)"
  tooltip="%s Hz">
</webaudio-knob>
<webaudio-param link="k1" width="60" height="20">
</webaudio-param>
```

The `webaudio-param` element auto-links to the knob, showing the `convValue` (the formatted display string). The user can also click it to type a value directly.

### MIDI Learn and CC Assignment

```html
<webaudio-knob midilearn="1" midicc="0.74">
<!-- Right-click opens MIDI learn menu -->
<!-- midicc="channel.ccNumber" assigns a fixed CC -->
```

This provides direct MIDI CC learning in the browser — essential for TBD-16 where parameters are controllable via MIDI CC.

### Limitations

| Limitation | Workaround |
|-----------|-----------|
| No built-in `rconv` for all cases — reverse conversion needed for `webaudio-param` editing | Define `rconv` attribute for editable param displays |
| Default knob visuals are basic (canvas-drawn) | Use custom knob images or CSS-only mode |
| No built-in grouping or collapsing | Wrap with Shoelace `<sl-details>` |
| No dark/light theme support built-in | Override CSS custom properties |

---

## 7. UI Toolkit Research — Shoelace vs. Alternatives

### The Requirement

The WebUI needs:
1. **UI chrome components**: buttons, tabs, dialogs/overlays, dropdowns, toggles, number inputs, sliders, collapsible sections, tooltips
2. **A design token system**: spacing, color, typography, dark mode
3. **Framework-agnostic**: Must work with plain ES Modules and webaudio-controls
4. **CDN-deliverable**: Can be served from the ESP32 SD card as a single pre-built file

Tailwind CSS was previously considered but rejected by the lead developer. The alternatives:

---

### Option A: Shoelace (→ Web Awesome) ★ Recommended

[shoelace.style](https://shoelace.style/) · [webawesome.com](https://webawesome.com/)

**What it is:** A professionally designed Web Components component library built on Lit. MIT licensed.

**Key strengths:**

| Feature | Detail |
|---------|--------|
| **Web Components native** | All components are custom elements. Works with any framework or no framework. |
| **Shadow DOM** | Encapsulates styles completely — no CSS conflicts with webaudio-controls |
| **Dark mode** | `document.documentElement.setAttribute('data-theme', 'dark')` — one line |
| **CSS custom properties** | Full design token system: `--sl-color-primary-*`, `--sl-spacing-*`, `--sl-font-size-*` etc. |
| **CDN-ready** | Single autoloader script from jsDelivr. Can be cached or self-hosted |
| **Component quality** | `<sl-details>` (collapsible), `<sl-dialog>`, `<sl-tab-group>`, `<sl-select>`, `<sl-switch>`, `<sl-tooltip>`, `<sl-badge>`, `<sl-spinner>` — all exactly what we need |
| **Evolution path** | Shoelace is being rebranded as "Web Awesome" by Font Awesome — active development, strong commercial backing |

**Components directly useful for TBD-16 WebUI:**

```html
<!-- Collapsible parameter group -->
<sl-details summary="Channel 1 – Kicks">
  <!-- 4-knob rows here -->
</sl-details>

<!-- Machine selector -->
<sl-select label="Machine" value="0">
  <sl-option value="0">Digital Bass Drum</sl-option>
  <sl-option value="1">Analogue Bass Drum</sl-option>
</sl-select>

<!-- Boolean mute toggle -->
<sl-switch>Mute</sl-switch>

<!-- Preset name input -->
<sl-input label="Preset name" placeholder="My Kit"></sl-input>

<!-- Connection status badge -->
<sl-badge variant="success" pill>Connected</sl-badge>
<sl-badge variant="danger" pill>Offline</sl-badge>

<!-- Dark mode toggle -->
<sl-icon-button name="moon" label="Dark mode"></sl-icon-button>

<!-- File upload for samples -->
<sl-button>
  <sl-icon name="upload"></sl-icon> Upload Sample
</sl-button>

<!-- Spinner while webserver reconnects -->
<sl-spinner style="font-size: 2rem;"></sl-spinner>

<!-- Tab groups for plugin slots and settings -->
<sl-tab-group>
  <sl-tab slot="nav" panel="slot-a">Slot A</sl-tab>
  <sl-tab slot="nav" panel="slot-b">Slot B</sl-tab>
  <sl-tab-panel name="slot-a">...</sl-tab-panel>
  <sl-tab-panel name="slot-b">...</sl-tab-panel>
</sl-tab-group>
```

**Shadow DOM and webaudio-controls coexistence:** Shoelace uses Shadow DOM for its own components; webaudio-controls uses Light DOM. They live in separate parts of the tree and don't conflict. Shoelace handles layout and chrome; webaudio-controls handles the audio knobs inside the Light DOM.

**Size:** The autoloader fetches only the components you actually use. Estimated payload for TBD-16 use = ~40–60 KB gzipped (just the Shoelace components referenced, plus the core Lit runtime). The full library is 500+ KB ungzipped but is never fully loaded.

**Self-hosting option:** To avoid CDN dependency and work purely on the device's SD card, bundle only the needed components at build time:
```bash
# In create_sd_archive.sh, bundle only what's needed:
npx @web/rollup-plugin-import-meta-assets ...
# Or: just vendor the full CDN bundle as a single file (~150 KB gzipped with all components)
```

**Shoelace → Web Awesome migration note:** Shoelace 2.x is stable. Web Awesome is the next major version (commercial licensing for some features). The transition is backward-compatible; Shoelace 2.x custom elements can be imported as-is.

---

### Option B: Open Props + Bare HTML

[open-props.style](https://open-props.style/)

**What it is:** Not a component library — a collection of ~500 CSS custom properties (design tokens) for color, spacing, typography, shadows, animations, easing.

```css
@import "https://unpkg.com/open-props";

.param-group {
  border-radius: var(--radius-2);
  box-shadow: var(--shadow-2);
  padding: var(--size-fluid-3);
}

.param-label {
  font-family: var(--font-mono);
  font-size: var(--font-size-0);
  letter-spacing: var(--font-letterspacing-3);
  color: var(--gray-4);
}
```

**Strengths:**
- Extremely small (~4 KB brotli for the full prop set)
- No JavaScript runtime — pure CSS variables
- Harmonious design tokens out of the box
- Not opinionated about HTML structure

**Weaknesses for TBD-16:**
- You build all interactive components yourself. Dialogs, tabs, selects, tooltips, dropdowns — all hand-coded
- No component library means no `<sl-details>`, no `<sl-dialog>`, no `<sl-select>` — you're reimplementing the wheel
- No dark mode switching mechanism built in (just `@media (prefers-color-scheme: dark)`)

**Verdict:** An excellent *complement* to Shoelace (use Open Props tokens alongside Shoelace design tokens), but not a standalone UI toolkit for an application with this complexity.

---

### Option C: Pico.css / MVP.css (Classless CSS)

[picocss.com](https://picocss.com/)

**What it is:** Minimal classless CSS frameworks — style native HTML elements without class names.

**Strengths:**
- Extremely small (< 10 KB)
- Dark mode built-in
- Works on plain HTML tables, forms, selects, details/summary

**Weaknesses for TBD-16:**
- No custom components. No knobs, no tabs with custom behavior, no dialogs
- Collapsible sections use native `<details>` — limited animation and styling control
- No tooltip component, no spinner, no badge — all hand-built

**Verdict:** Fine for very simple intranet tools. Too limited for TBD-16's needs.

---

### Option D: UIKit

[getuikit.com](https://getuikit.com/)

**What it is:** Full CSS+JS component framework. Buttons, grid, modal, tabs, tooltips, notifications, off-canvas panels.

**Strengths:**
- Rich component set
- Off-canvas/sidebar built-in (good for plugin browser)
- Notification/toast system (good for connection status)

**Weaknesses for TBD-16:**
- Not Web Components — uses jQuery-style JS API
- Shadow DOM not used — CSS conflicts with webaudio-controls are possible
- ~180 KB gzipped (JS + CSS combined)
- No design token system for easy theming
- Not compatible with a Web Component architecture

**Verdict:** Too old-paradigm. The TBD-16 WebUI is building for the next 5+ years.

---

### The Recommendation

**Use Shoelace for UI chrome + Open Props for design tokens + webaudio-controls for audio parameter widgets.**

```
┌─────────────────────────────────────────────────────────────┐
│  Shoelace                                                   │
│  (sl-details, sl-dialog, sl-tab-group, sl-select,           │
│   sl-switch, sl-tooltip, sl-badge, sl-spinner, sl-button)   │
│                                                             │
│  Open Props (CSS custom properties: colors, spacing,        │
│   typography, shadows, animations)                          │
│                                                             │
│  webaudio-controls                                          │
│  (webaudio-knob, webaudio-slider, webaudio-switch,          │
│   webaudio-param — inside parameter group Light DOM)        │
└─────────────────────────────────────────────────────────────┘
```

These three libraries don't conflict because:
- Shoelace components use Shadow DOM (isolated styling)
- webaudio-controls uses Light DOM canvas (isolated rendering)
- Open Props are plain CSS variables — no specificity conflicts

---

## 8. Webserver On/Off — Architecture Implications

The lead developer confirmed that the **ESP32 webserver is turned on and off by the RP2350 UI firmware** to reduce processing load. This is a first-class operational scenario, not an edge case.

### Why the Webserver Is Off Sometimes

```
RP2350 UI firmware → SPI → ESP32-P4
                              └── DSP audio engine (always on)
                              └── Webserver (toggleable)
```

The ESP32-P4 is challenged running both audio DSP and HTTP server simultaneously. Under high CPU load (e.g. PicoSeqRack with all 16 channels active), the webserver may be disabled to ensure glitch-free audio. The RP2350 manages this power decision.

### What This Means for the WebUI

1. **Connections will drop suddenly without warning.** No graceful HTTP shutdown. The browser's fetch will just timeout.

2. **The WebUI must not assume the server is always available.** Every API call can fail.

3. **Connection state must be a first-class UI concept.** Not a small error toast — a visible status that the user understands.

4. **Auto-reconnect is essential.** When the server comes back online, the WebUI should reconnect and resync state automatically.

5. **Offline editing is not required (first iteration).** The WebUI does not need to queue changes while offline. When offline, controls show their last-known state and are visually frozen.

### Implementation

#### Connection State Machine

```
CONNECTING ──► CONNECTED ──► DISCONNECTED ──► RECONNECTING ──► CONNECTED
                   │                              ▲
                   └──────────────────────────────┘ (drop detected)
```

#### Status Bar Design

```
┌───────────────────────────────────────────────────────────────┐
│  TBD-16  ●  Slot A: PicoSeqRack    Slot B: —    [⟳ Reconnecting in 3s]│
└───────────────────────────────────────────────────────────────┘
```

When reconnecting, parameter controls are visually frozen (opacity reduced, pointer-events none). A `<sl-spinner>` + countdown shows in the header.

#### Reconnect Strategy

```javascript
class ConnectionManager {
  static RECONNECT_INTERVAL_MS = 3000;
  static MAX_RETRIES = 20; // ~60 seconds
  
  async ping() {
    try {
      const r = await fetch('/api/v1/getActivePlugin/0', { signal: AbortSignal.timeout(2000) });
      return r.ok;
    } catch { return false; }
  }
  
  async watchdog() {
    while (true) {
      await sleep(this.RECONNECT_INTERVAL_MS);
      if (this.state === 'DISCONNECTED' || this.state === 'RECONNECTING') {
        const alive = await this.ping();
        if (alive) this.onReconnected();
      }
    }
  }
}
```

#### Server-Sent Events Alternative

Rather than polling, if the webserver supports SSE (`text/event-stream`), the connection drop is instantly detected via the `EventSource` error event. The `RestServer.cpp` notes in earlier research confirm SSE is technically possible on ESP-IDF. However, for the first iteration, polling every 3 seconds is simpler and sufficient.

---

## 9. Macro/Preset Layer — Connecting Hardware and WebUI

This connects the engineer's macro mapping concept (from WEBUI-SYNTHESIS.md §3) with the hardware UI parameter page model.

### The Full Layer Stack

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 0: Hardware Physical Controls                        │
│  4 knobs × N pages = direct MIDI CC output to ESP32         │
│  Encoded in AUDIOPARAM.cc in the RP2350 firmware            │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Raw Plugin Parameters (ESP32 DSP side)            │
│  id: "c_atk", raw value 0–4095                              │
│  Accessed via /api/v1/setPluginParam                        │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Parameter Descriptor Table (WebUI side)           │
│  id: "c_atk" → { unit: "ms", min: 0.3, max: 30, log: true }│
│  Lives in a static JSON file bundled with the WebUI         │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Macro Definitions (Preset layer — future)         │
│  "PUNCH" macro → c_atk(weight: 0.6) + c_rel(weight: 0.4)   │
│  Stored in /sdcard/data/macros.jsn                          │
└─────────────────────────────────────────────────────────────┘
```

### Layer 2 in the WebUI (First Iteration Priority)

The parameter descriptor table (PDT) is **the single most impactful thing** the WebUI can add. It translates raw plugin parameters into human-usable controls. It lives entirely in the browser — no ESP32 changes needed.

**File structure:**
```
sdcard_image/www/js/
├── param-descriptors/
│   ├── PicoSeqRack.json      ← per-plugin descriptor tables
│   ├── DrumRack.json
│   ├── TBDeep.json
│   └── _default.json         ← fallback for unknown params
```

The WebUI loads the matching descriptor file when a plugin is active. For unknown params it falls back to `_default.json` which renders everything as a plain 0–4095 number knob.

### Layer 3: Macros (Future)

Macros are named controls that combine multiple raw parameters via weighted formulas. They represent "musician-friendly" concepts:
- **"Punch"** → Attack + Decay weighted combination
- **"Character"** → Tone + FM amount
- **"Space"** → Reverb send + Reverb time

Macros are stored separately from presets and referenced by preset files. The WebUI in a later iteration adds a "Macro Editor" where musicians define these mappings visually. The RP2350 firmware can optionally sync macro values to physical knob pages.

---

## 10. Revised Component Architecture

Building on UNIFIED-WEBUI-ARCHITECTURE.md but incorporating the above insights:

### Parameter Rendering Component Tree

```
tbd-channel-strip               ← full plugin channel (e.g. "CH1 Kicks")
├── tbd-channel-mixer           ← fixed 4-param strip: Mute, Device, Level, Pan, FX1, FX2
│   ├── tbd-param-toggle        ← Mute (webaudio-switch)
│   ├── tbd-param-select        ← Device (sl-select or radio group)
│   └── tbd-param-knob × 4     ← Level, Pan, FX1, FX2
└── tbd-param-page-group        ← collapsible section (sl-details)
    └── tbd-param-page × N      ← one page per 4-param block
        └── tbd-param-row       ← always 4 columns
            └── tbd-param-knob | tbd-param-toggle | tbd-param-select × 4
```

### tbd-param-knob Component Contract

```javascript
class TbdParamKnob extends HTMLElement {
  // Required attributes
  static observedAttributes = ['param-id', 'value', 'channel'];
  
  // Loaded from param-descriptors/<plugin>.json
  get descriptor() {
    return window.TBD.paramDescriptors.get(this.paramId) ?? DEFAULT_DESCRIPTOR;
  }
  
  // Generates the webaudio-knob with all display attributes
  render() {
    return `
      <div class="param-slot">
        <span class="param-label">${this.descriptor.shortname}</span>
        <webaudio-knob
          id="knob-${this.paramId}"
          min="0" max="4095"
          value="${this.value}"
          log="${this.descriptor.scale === 'log' ? 1 : 0}"
          conv="${this.descriptor.conv}"
          tooltip="%s"
          valuetip="1"
          midilearn="1">
        </webaudio-knob>
        <webaudio-param
          link="knob-${this.paramId}"
          width="60" height="16">
        </webaudio-param>
      </div>
    `;
  }
  
  // On change: enqueue API call to /api/v1/setPluginParam
  onChange(rawValue) {
    window.TBD.fetchQueue.enqueue({
      url: `/api/v1/setPluginParam/${this.channel}`,
      params: { id: this.paramId, current: rawValue }
    });
  }
}
```

### New File Structure (Updated from UNIFIED-WEBUI-ARCHITECTURE.md)

```
sdcard_image/www/
├── index.html
├── css/
│   └── tbd.css                         ← base styles using Open Props
├── js/
│   ├── app.js
│   ├── connection-manager.js           ← NEW: webserver on/off handling
│   ├── fetch-queue.js
│   ├── state.js
│   ├── midi.js
│   ├── param-descriptors/              ← NEW: per-plugin display metadata
│   │   ├── PicoSeqRack.json
│   │   ├── DrumRack.json
│   │   └── _default.json
│   ├── components/
│   │   ├── tbd-app-shell.js
│   │   ├── tbd-connection-status.js    ← NEW: visible connection state
│   │   ├── tbd-plugin-browser.js
│   │   ├── tbd-slot.js
│   │   ├── tbd-channel-strip.js        ← NEW: per-channel group with mixer
│   │   ├── tbd-param-page.js           ← NEW: 4-knob row with page nav
│   │   ├── tbd-param-knob.js           ← wraps webaudio-knob + descriptor
│   │   ├── tbd-param-toggle.js         ← wraps webaudio-switch + descriptor
│   │   ├── tbd-param-select.js         ← wraps sl-select + descriptor
│   │   ├── tbd-param-group.js          ← collapsible group (sl-details)
│   │   ├── tbd-favorites-bar.js
│   │   ├── tbd-preset-panel.js
│   │   ├── tbd-midi-mapper.js
│   │   ├── tbd-sample-manager.js
│   │   └── tbd-config-view.js
├── vendor/
│   ├── webaudio-controls.js            ← pinned version (single file)
│   └── shoelace/                       ← self-hosted Shoelace bundle
│       ├── shoelace-autoloader.js
│       └── themes/
│           ├── light.css
│           └── dark.css
```

---

## 11. Recommended Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **UI Chrome** | Shoelace 2.x (→ Web Awesome) | Professional Web Components, dark mode, `sl-details`, `sl-dialog`, `sl-select`, `sl-switch`, `sl-tooltip`. Framework-agnostic. MIT licensed. |
| **Design Tokens** | Open Props | 500+ CSS variables for spacing, color, typography, shadows, animations. 4 KB gzipped. Complements Shoelace tokens. |
| **Audio Controls** | webaudio-controls | The only mature Web Component library for audio knobs. Single 30 KB file. `conv`, `log`, `midilearn` attributes. Apache 2.0 license. |
| **Application Logic** | Vanilla ES Modules | No framework runtime. `import/export` for code organization. `CustomEvent` for inter-component communication. |
| **Request Queue** | Custom `FetchQueue` (~20 lines) | Serialize API calls. Replace `ajaxq.js`. |
| **Bundling / Build** | None required | All libraries served as static files from `/sdcard/www/vendor/`. Build step only for SD card archive creation (`create_sd_archive.sh`) — optional minification. |

### What Not to Use

| Technology | Reason to Avoid |
|-----------|----------------|
| Tailwind CSS | Rejected by lead developer |
| Alpine.js | Adds reactive scoping; not needed for plain ES Modules + CustomEvent pattern |
| React / Vue / Svelte | Bundle size and build complexity for embedded static file serving |
| jQuery | Replaced by `fetch` + `querySelector` |
| Onsen UI | Current tech debt — being replaced entirely |

---

## 12. First Iteration Scope (Updated)

Revised from WEBUI-SYNTHESIS.md §10 to incorporate new insights:

### Must-Have (First Iteration)

| Feature | Why Now | Key Files |
|---------|---------|-----------|
| Connection manager with auto-reconnect | Webserver on/off is a primary scenario | `connection-manager.js` |
| Parameter descriptor table for PicoSeqRack | Fixes unusable 0–4095 displays | `param-descriptors/PicoSeqRack.json` |
| `tbd-param-knob` with `conv`/`log`/units | Core UX improvement | `tbd-param-knob.js` |
| `tbd-param-toggle` for bool params | Eliminates "0/1" confusion | `tbd-param-toggle.js` |
| `tbd-param-select` for enum params | Eliminates numeric enum display | `tbd-param-select.js` |
| `tbd-param-page` (4-knob row + page nav) | Mirrors hardware 4-knob layout | `tbd-param-page.js` |
| `tbd-channel-strip` with collapsible mixer | Handles PicoSeqRack 16-channel layout | `tbd-channel-strip.js` |
| Shoelace integration (details, dialog, switch) | UI chrome for groups, presets, settings | `vendor/shoelace/` |
| Persistent dark mode | Expected by all hardware musician UIs | `tbd-config-view.js` |
| Preset load/save (existing API) | Core workflow | `tbd-preset-panel.js` |

### Deferred (Later Iterations)

| Feature | Complexity | Notes |
|---------|-----------|-------|
| Sample manager with upload | Requires new ESP32 file upload endpoint | After file API work |
| Macro editor | Requires new data model | After PDT stabilizes |
| Plugin browser with drag-to-slot | Nice UX | After core param editing works |
| SSE-based live state sync | Requires ESP32 endpoint work | After polling confirmed working |
| MIDI learn UI | Already in webaudio-controls via right-click | Surface it properly in a dedicated view |
| RP2350 sequencer edit UI | Complex — step locks, LFO modes, pattern editing | Large feature, separate spec |

---

## Appendix A: webaudio-controls `conv` Expressions for PicoSeqRack

Below are production-ready `conv` expressions for common PicoSeqRack parameter types. These go into `param-descriptors/PicoSeqRack.json`.

```json
{
  "_types": {
    "attack_ms": {
      "conv": "(0.3 * Math.pow(100, x/4095)).toFixed(1) + ' ms'",
      "rconv": "Math.log(x/0.3) / Math.log(100) * 4095",
      "log": 1, "unit": "ms"
    },
    "release_ms": {
      "conv": "(40 * Math.pow(50, x/4095)).toFixed(0) + ' ms'",
      "rconv": "Math.log(x/40) / Math.log(50) * 4095",
      "log": 1, "unit": "ms"
    },
    "freq_hz_20_20k": {
      "conv": "(20 * Math.pow(1000, x/4095)).toFixed(0) + ' Hz'",
      "rconv": "Math.log(x/20) / Math.log(1000) * 4095",
      "log": 1, "unit": "Hz"
    },
    "freq_hz_bw": {
      "conv": "(20 * Math.pow(1000, x/4095)).toFixed(0) + ' Hz'",
      "log": 1, "unit": "Hz", "note": "fx1_base, fx1_width"
    },
    "db_threshold": {
      "conv": "((x/4095 * 80) - 80).toFixed(1) + ' dB'",
      "rconv": "(x + 80) / 80 * 4095",
      "log": 0, "unit": "dB"
    },
    "ratio_comp": {
      "conv": "(x/4095 * 1.25).toFixed(3)",
      "log": 0, "unit": ""
    },
    "percent_0_100": {
      "conv": "(x/4095 * 100).toFixed(0) + '%'",
      "rconv": "x / 100 * 4095",
      "log": 0, "unit": "%"
    },
    "delay_ms_bpm_sync": {
      "conv": "x + ' steps'",
      "note": "fx1_time_ms: displayed as rhythmic subdivision"
    }
  }
}
```

---

## Appendix B: Hardware Photo Reference

The hardware photo at `docs/_static/assets/dadamachines-tbd-16_mockup_002.jpg` shows:
- 4 knobs in a single horizontal row (top center)
- 16 step buttons (2 rows of 8)
- Navigation cluster left: Up/Down/Left/Right + confirm
- Transport buttons: Play, Stop, Record
- 2.4" OLED (upper left area)
- LED strip above step buttons

The WebUI's "4-knob row" layout primitive directly maps to those 4 physical knobs. When a musician is editing on hardware and opens the browser companion, they should see the *same mental model*: page name → 4 parameters → page navigation.
